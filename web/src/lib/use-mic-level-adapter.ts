import type { OrbAdapter, OrbSignal, OrbSignalListener } from 'orb-ui'
import { useEffect, useMemo } from 'react'

/** RMS of a quiet speaking voice sits well under 0.3; scale it so normal speech fills the bars. */
const GAIN = 3.5

/**
 * Orb adapter driven by the live microphone level. While `active`, it opens its own mic stream
 * (transcription keeps its own), reads RMS from an AnalyserNode every frame and pushes it to Orb's
 * listeners directly, so the bars move without a React render per frame.
 */
export function useMicLevelAdapter(active: boolean): OrbAdapter {
  const listeners = useMemo(() => new Set<OrbSignalListener>(), [])
  const adapter = useMemo<OrbAdapter>(
    () => ({
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }),
    [listeners],
  )

  useEffect(() => {
    const emit = (signal: OrbSignal) => listeners.forEach((listener) => listener(signal))
    if (!active) {
      emit({ state: 'idle', inputVolume: 0 })
      return
    }

    let cancelled = false
    let frame = 0
    let stream: MediaStream | null = null
    let context: AudioContext | null = null
    emit({ state: 'listening', inputVolume: 0 })

    void navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((media) => {
        if (cancelled) {
          media.getTracks().forEach((track) => track.stop())
          return
        }
        stream = media
        context = new AudioContext()
        const analyser = context.createAnalyser()
        analyser.fftSize = 512
        context.createMediaStreamSource(media).connect(analyser)
        const samples = new Float32Array(analyser.fftSize)
        const tick = () => {
          analyser.getFloatTimeDomainData(samples)
          let sum = 0
          for (const sample of samples) sum += sample * sample
          const level = Math.min(1, Math.sqrt(sum / samples.length) * GAIN)
          emit({ state: 'listening', inputVolume: level })
          frame = requestAnimationFrame(tick)
        }
        tick()
      })
      // The bars are decorative; the transcription flow reports mic errors itself.
      .catch(() => undefined)

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((track) => track.stop())
      void context?.close()
      emit({ state: 'idle', inputVolume: 0 })
    }
  }, [active, listeners])

  return adapter
}
