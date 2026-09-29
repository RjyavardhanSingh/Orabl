import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, LoaderCircle, X, XCircle } from 'lucide-react'

import { cn } from '../../lib/utils'
import { Button } from './button'

export type LoaderStatus = 'loading' | 'success' | 'error'

/**
 * Truthful multi-step loader overlay.
 *
 * Checkmarks move ONLY on real events, driven by `completedCount` from the
 * parent (e.g. request dispatched → 1, response parsed → all). Nothing
 * advances on a timer. The single exception is the waiting step's *sub-line*:
 * it rotates presentational flip texts while the operation is genuinely
 * in flight, and never marks anything complete.
 *
 * - Overlay is translucent + blurred; content has no panel (transparent).
 * - Icons green-900 on white; text ink. App is light-only.
 * - `useReducedMotion` freezes flips and transitions to a static list.
 */
export function MultiStepLoader({
  open,
  steps,
  status,
  completedCount,
  waitingIndex = 1,
  waitingTexts = [],
  flipMs = 4000,
  errorMessage,
  successText = 'Done',
  onRetry,
  onClose,
}: {
  open: boolean
  steps: string[]
  status: LoaderStatus
  /** Number of steps truly complete (parent-owned truth). */
  completedCount: number
  /** Index of the indeterminate "waiting" step. Defaults to 1. */
  waitingIndex?: number
  /** Rotating sub-lines for the waiting step; presentational only. */
  waitingTexts?: string[]
  flipMs?: number
  errorMessage?: string
  successText?: string
  onRetry?: () => void
  onClose?: () => void
}) {
  const reduceMotion = useReducedMotion() ?? false
  const [flipIndex, setFlipIndex] = useState(0)

  // Flip sub-text only while genuinely waiting. Never touches completion.
  useEffect(() => {
    if (!open || status !== 'loading' || reduceMotion || waitingTexts.length < 2) return
    const timer = window.setTimeout(() => {
      setFlipIndex((prev) => (prev + 1) % waitingTexts.length)
    }, flipMs)
    return () => window.clearTimeout(timer)
  }, [open, status, reduceMotion, waitingTexts.length, flipMs, flipIndex, waitingTexts])

  // Fresh mount per run (parent keys by run id), so flip index starts at 0.
  // Terminal states never advance anything.

  const doneCount = status === 'success' ? steps.length : Math.min(completedCount, steps.length)

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.25 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-canvas/70 backdrop-blur-md"
          role="status"
          aria-live="polite"
          aria-label={status === 'error' ? 'Generation failed' : 'Generating questions'}
        >
          {status === 'error' && onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Dismiss"
              className="absolute right-4 top-4 rounded-xl p-2 text-ink-muted transition-colors hover:bg-sunk hover:text-ink"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          ) : null}

          <div className="w-full max-w-sm px-6">
            <ol className="space-y-4">
              {steps.map((text, index) => {
                const done = index < doneCount
                const waiting = status === 'loading' && index === waitingIndex && !done
                const todo = !done && !waiting
                return (
                  <motion.li
                    key={text}
                    initial={false}
                    animate={{ opacity: done || waiting ? 1 : 0.45 }}
                    transition={{ duration: reduceMotion ? 0 : 0.3 }}
                    className="flex items-center gap-3"
                  >
                    {done ? (
                      <CheckCircle2 className="size-6 shrink-0 text-green-900" aria-hidden="true" />
                    ) : waiting ? (
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-green-900 text-white">
                        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                      </span>
                    ) : (
                      <Circle className="size-6 shrink-0 text-ink-faint" aria-hidden="true" />
                    )}
                    <span className="min-w-0">
                      <span
                        className={cn(
                          'block text-sm font-medium',
                          done || waiting ? 'text-ink' : 'text-ink-faint',
                        )}
                      >
                        {text}
                      </span>
                      {waiting && waitingTexts.length > 0 ? (
                        <span
                          key={flipIndex}
                          className="mt-0.5 block text-xs leading-5 text-ink-muted"
                        >
                          {waitingTexts[flipIndex % waitingTexts.length]}
                        </span>
                      ) : null}
                      {todo ? <span className="sr-only">Pending</span> : null}
                    </span>
                  </motion.li>
                )
              })}

              {status === 'success' ? (
                <motion.li
                  initial={false}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-3 border-t border-line pt-4"
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-green-900 text-white">
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold text-ink">{successText}</span>
                </motion.li>
              ) : null}

              {status === 'error' ? (
                <motion.li
                  initial={false}
                  animate={{ opacity: 1 }}
                  className="space-y-3 border-t border-line pt-4"
                >
                  <span className="flex items-center gap-3">
                    <XCircle className="size-6 shrink-0 text-bad" aria-hidden="true" />
                    <span className="text-sm font-semibold text-ink">LLM failed to respond</span>
                  </span>
                  {errorMessage ? (
                    <p className="text-pretty pl-9 text-xs leading-5 text-ink-muted">{errorMessage}</p>
                  ) : null}
                  <span className="flex gap-2 pl-9">
                    {onRetry ? (
                      <Button size="sm" onClick={onRetry} className="rounded-xl bg-green-900 hover:bg-green-800">
                        Try again
                      </Button>
                    ) : null}
                    {onClose ? (
                      <Button size="sm" variant="secondary" onClick={onClose} className="rounded-xl">
                        Dismiss
                      </Button>
                    ) : null}
                  </span>
                </motion.li>
              ) : null}
            </ol>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
