import { useEffect, useState } from 'react'

/** RMS of a quiet speaking voice sits well under 0.3; scale it so normal speech fills the bars. */
const GAIN = 3.5

/**
 * Live mic level driven by the microphone. While `active`, it opens its own mic stream
 * (transcription keeps its own), reads RMS from an AnalyserNode every frame, and returns a
 * 0–1 level. Returns 0 when inactive.
 */
export function useMicLevelAdapter(active: boolean): number {
  const [level, setLevel] = useState(0)

  useEffect(() => {
    if (!active) {
      setLevel(0)
      return
    }

    let cancelled = false
    let frame = 0
    let stream: MediaStream | null = null
    let context: AudioContext | null = null

    setLevel(0)

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
          const lvl = Math.min(1, Math.sqrt(sum / samples.length) * GAIN)
          setLevel(lvl)
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
      setLevel(0)
    }
  }, [active])

  return level
}
