import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react'
import { Suspense, useState } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'

import { AppShell } from './app-shell'
import { FlowResultsProvider } from './flow-results'

/** Steps rendered inside the persistent ledger shell, in flow order. */
const FLOW = ['upload', 'goal', 'preparing', 'practice'] as const

// Sharp, architectural ease rather than a generic float.
const SLIDE_EASE = [0.32, 0.72, 0, 1] as const

const slide: Variants = {
  enter: (direction: number) => ({ x: `${direction * 100}%` }),
  center: { x: '0%' },
  exit: (direction: number) => ({ x: `${direction * -100}%` }),
}

/**
 * Layout route for the ledger steps. The shell (and its tracker) stays mounted across step
 * changes; only the right column slides, forward or back depending on the step order. URLs
 * still change per step, so refresh and Back keep working, and only the current step mounts.
 */
export function LedgerFlow() {
  const location = useLocation()
  const outlet = useOutlet()
  const reduceMotion = useReducedMotion()
  const step = FLOW.findIndex((name) => location.pathname.endsWith(`/${name}`))
  const [motionState, setMotionState] = useState({ step, direction: 1 })
  if (motionState.step !== step) setMotionState({ step, direction: step > motionState.step ? 1 : -1 })
  const { direction } = motionState

  return (
    // Practice hands its "open results" action to the tracker through this provider.
    <FlowResultsProvider>
      <AppShell>
        <AnimatePresence initial={false} mode="popLayout" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={slide}
            initial="enter"
            animate="center"
            exit="exit"
            transition={reduceMotion ? { duration: 0 } : { duration: 0.5, ease: SLIDE_EASE }}
            className="w-full flex-shrink-0 px-1"
          >
            {/* Keeps a late chunk from suspending the whole shell; the steps are prefetched together. */}
            <Suspense fallback={null}>{outlet}</Suspense>
          </motion.div>
        </AnimatePresence>
      </AppShell>
    </FlowResultsProvider>
  )
}
