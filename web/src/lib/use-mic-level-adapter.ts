import { type RefObject, useEffect, useRef } from 'react'

/*
 * Loudness is logarithmic, so the level is mapped in decibels, not raw RMS. Room noise sits
 * below FLOOR_DB and reads as 0; a normal speaking voice (about -35 to -20 dBFS) lands
 * mid-range; only loud speech reaches CEIL_DB and fills the bars.
 */
const FLOOR_DB = -55
const CEIL_DB = -15
/* Per-frame smoothing: quick to rise with a syllable, slower to fall, like a VU meter. */
const ATTACK = 0.5
const RELEASE = 0.12

function toLevel(rms: number): number {
  const db = 20 * Math.log10(rms + 1e-8)
  return Math.min(1, Math.max(0, (db - FLOOR_DB) / (CEIL_DB - FLOOR_DB)))
}

/**
 * Live 0–1 mic level, smoothed, for decorative meters. While `active` it opens its own mic
 * stream (transcription keeps its own) and updates the returned ref every animation frame.
 * It is a ref, not state, so a meter can read it in its own animation loop without re-rendering
 * React 60 times a second. Reads 0 when inactive.
 */
export function useMicLevelAdapter(active: boolean): RefObject<number> {
  const level = useRef(0)

  useEffect(() => {
    level.current = 0
    if (!active) return

    let cancelled = false
    let frame = 0
    let stream: MediaStream | null = null
    let context: AudioContext | null = null

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
          const target = toLevel(Math.sqrt(sum / samples.length))
          const rate = target > level.current ? ATTACK : RELEASE
          level.current += (target - level.current) * rate
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
      level.current = 0
    }
  }, [active])

  return level
}
