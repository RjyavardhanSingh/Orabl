import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { FileUp, Mic, RotateCcw, Sparkles, Target, Trophy, X, type LucideIcon } from 'lucide-react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from './ui/button'

type WorkflowStep = {
  step: string
  title: string
  text: string
  icon: LucideIcon
}

const STEPS: WorkflowStep[] = [
  {
    step: '01',
    title: 'Upload your material',
    text: 'A PDF or pasted notes. Your own source becomes the foundation for every question.',
    icon: FileUp,
  },
  {
    step: '02',
    title: 'Set your goal',
    text: 'Say what you want to understand and by when. Three levels, no jargon.',
    icon: Target,
  },
  {
    step: '03',
    title: 'Get your questions',
    text: 'A focused practice set built from your material, matched to your goal.',
    icon: Sparkles,
  },
  {
    step: '04',
    title: 'Answer out loud',
    text: 'One question at a time, spoken. Scoring runs behind the scenes while you talk.',
    icon: Mic,
  },
  {
    step: '05',
    title: 'Read your report',
    text: 'A readiness score, the concepts you nailed, and the exact mix-ups to fix.',
    icon: Trophy,
  },
  {
    step: '06',
    title: 'Retest the weak spots',
    text: 'Targeted practice on what slipped, then watch old weak areas turn strong.',
    icon: RotateCcw,
  },
]

export function WorkflowModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion() ?? false
  const beat = reduceMotion ? 0 : undefined

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: beat ?? 0.2 } }}
          exit={{ opacity: 0, transition: { duration: beat ?? 0.15 } }}
          role="dialog"
          aria-modal="true"
          aria-label="How Recall works"
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_24px_80px_-24px_rgba(27,26,23,0.45)]"
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
              transition: { duration: beat ?? 0.28, ease: [0.22, 1.2, 0.36, 1] },
            }}
            exit={{
              opacity: 0,
              scale: 0.96,
              y: 12,
              transition: { duration: beat ?? 0.18, ease: 'easeIn' },
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 p-6 pb-0 sm:px-8 sm:pt-7">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-ink-muted">
                  How it works
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
                  Upload → Goal → Speak → Report → Retest
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-canvas text-ink transition-colors hover:bg-sunk"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <ol className="scroll-area max-h-[50dvh] space-y-0 overflow-y-auto p-6 sm:px-8">
              {STEPS.map(({ step, title, text, icon: Icon }, index) => (
                <li key={step} className="relative flex gap-4 pb-6 last:pb-0">
                  {index < STEPS.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-0 left-[21px] top-12 w-px bg-line-strong"
                    />
                  ) : null}
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-sunk text-ink">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 pt-0.5">
                    <span className="flex items-baseline gap-2">
                      <span className="tabular text-xs font-bold text-ink-faint">{step}</span>
                      <span className="text-sm font-semibold tracking-tight text-ink">{title}</span>
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-ink-muted">{text}</span>
                  </span>
                </li>
              ))}
            </ol>

            <div className="border-t border-line p-6 pt-5 sm:px-8">
              <Button className="w-full" onClick={() => { onClose(); navigate('/upload') }}>
                Start a Session
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
