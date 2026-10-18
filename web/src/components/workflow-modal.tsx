import * as Dialog from '@radix-ui/react-dialog'
import { FileUp, Mic, RotateCcw, Sparkles, Target, Trophy, X, type LucideIcon } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import type { RefObject } from 'react'

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

export function WorkflowModal({ open, onClose, triggerRef }: { open: boolean; onClose: () => void; triggerRef: RefObject<HTMLButtonElement | null> }) {
  const reduceMotion = useReducedMotion() ?? false
  const beat = reduceMotion ? 0 : undefined

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
        <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <Dialog.Content
            asChild
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              triggerRef.current?.focus()
            }}
          >
            <motion.div
              className="pointer-events-auto w-full max-w-lg overflow-hidden rounded-l border border-line bg-surface"
              initial={{ opacity: 0, scale: 0.92, y: 24 }}
              animate={{
                opacity: 1,
                scale: 1,
                y: 0,
                transition: {
                  duration: beat ?? 0.28,
                  ease: [0.22, 1.2, 0.36, 1],
                },
              }}
            >
              <div className="flex items-start justify-between gap-4 p-6 pb-0 sm:px-8 sm:pt-7">
                <div>
                  <Dialog.Title className="text-xs font-bold uppercase tracking-[0.2em] text-ink-muted">
                    How it works
                  </Dialog.Title>
                  <Dialog.Description className="sr-only">
                    Follow the six steps of a learning session.
                  </Dialog.Description>
                </div>
                <Dialog.Close
                  type="button"
                  aria-label="Close"
                  className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-canvas text-ink transition-colors hover:bg-sunk"
                >
                  <X className="size-4" aria-hidden="true" />
                </Dialog.Close>
              </div>

              <ol className="scroll-area max-h-[50dvh] space-y-0 overflow-y-auto p-6 sm:px-8">
                {STEPS.map(({ step, title, text, icon: Icon }, index) => (
                  <li key={step} className="relative flex gap-4 pb-6 last:pb-0">
                    {index < STEPS.length - 1 ? (
                      <span aria-hidden="true" className="absolute bottom-0 left-[21px] top-12 w-px bg-line-strong" />
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
            </motion.div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
