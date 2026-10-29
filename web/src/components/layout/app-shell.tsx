import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import { activeStudySessionId, sessionStepPath } from '../../lib/study-session'
import { cn } from '../../lib/utils'
import { RailToc } from '../ui/rail-toc'
import { AppNavbar } from './app-navbar'
import { pageContainerClass } from './classes'
import { useFlowResultsAction } from './flow-results'

const steps = [
  { path: '/upload', label: 'Material' },
  { path: '/goal', label: 'Goal' },
  { path: '/preparing', label: 'Prepare' },
  { path: '/practice', label: 'Practice' },
  { path: '/results', label: 'Results' },
] as const
const RESULTS_INDEX = steps.length - 1
const railDepths = [0, 2, 1, 3, 0]
const railItems = steps.map((step, index) => ({ id: step.path.slice(1), label: step.label, depth: railDepths[index] }))
let lastRailStep: { sessionId: string | null; index: number } | undefined

/**
 * Ledger "spine": the rail spaced out to fill the left column. The plane loses its glow, step
 * names set in serif italic, and the active step goes large and bold. RailToc re-measures its
 * path on resize, so the line stretches with the wider gaps. Colours come from the theme roles.
 */
const LEDGER_RAIL = [
  '[&_[data-slot=rail-toc-plane]]:[filter:none]',
  '[&_[data-slot=rail-toc-title]]:mb-8 [&_[data-slot=rail-toc-title]]:tracking-widest [&_[data-slot=rail-toc-title]]:text-ink',
  '[&_[data-slot=rail-toc-list]]:flex [&_[data-slot=rail-toc-list]]:flex-col [&_[data-slot=rail-toc-list]]:gap-7',
  '[&_[data-slot=rail-toc-list]_button]:font-serif [&_[data-slot=rail-toc-list]_button]:text-base [&_[data-slot=rail-toc-list]_button]:italic',
  '[&_[aria-current=step]]:text-xl! [&_[aria-current=step]]:font-bold',
].join(' ')

function unlocked(): boolean[] {
  try {
    const materials = JSON.parse(window.sessionStorage.getItem('recall.materials') || '[]') as unknown[]
    const context = !!window.sessionStorage.getItem('recall.context')
    const practice = !!window.sessionStorage.getItem('recall.session')
    return [true, materials.length > 0, context, practice, !!window.sessionStorage.getItem('recall.results')]
  } catch {
    return [true, false, false, false, false]
  }
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { studyId } = useParams()
  const resultsAction = useFlowResultsAction()
  const available = unlocked()
  // Finished practice unlocks Results in the tracker before the report exists; opening it compiles the report.
  if (resultsAction) available[RESULTS_INDEX] = true
  const active = steps.findIndex((step) => location.pathname.endsWith(step.path))
  const id = studyId || activeStudySessionId()
  const [initialRailStep] = useState(() => lastRailStep?.sessionId === id ? lastRailStep.index : active)
  const disabledIndices = steps.flatMap((_, index) => available[index] ? [] : [index])

  useEffect(() => {
    if (active >= 0) lastRailStep = { sessionId: id, index: active }
  }, [active, id])

  const goToStep = (index: number) => {
    if (!available[index] || index === active) return
    if (index === RESULTS_INDEX && resultsAction) {
      if (!resultsAction.pending) resultsAction.open()
      return
    }
    navigate(sessionStepPath(railItems[index].id as 'upload' | 'goal' | 'preparing' | 'practice' | 'results', id))
  }
  // Memoised: RailToc re-measures its path whenever `items` changes identity.
  const resultsLabel = resultsAction ? (resultsAction.pending ? 'Compiling…' : 'See Results →') : null
  const items = useMemo(
    () =>
      resultsLabel
        ? railItems.map((item, index) => (index === RESULTS_INDEX ? { ...item, label: resultsLabel } : item))
        : railItems,
    [resultsLabel],
  )

  return (
    <div className="flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-canvas text-ink">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-on-primary">Skip to content</a>
      <AppNavbar />

      {/* Mobile: the rail folds into a ruled step bar; each segment is a step. */}
      {active >= 0 ? (
        <nav aria-label="Session steps" className="shrink-0 border-b border-line lg:hidden">
          <div className={cn(pageContainerClass, 'py-3')}>
            <p className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.18em] text-ink/65">
              <span>Step {active + 1} of {steps.length}</span>
              <span className="text-ink">{steps[active].label}</span>
            </p>
            <ol className="mt-2.5 grid grid-cols-5 gap-1.5">
              {steps.map((step, index) => (
                <li key={step.path}>
                  <button
                    type="button"
                    onClick={() => goToStep(index)}
                    disabled={!available[index]}
                    aria-current={index === active ? 'step' : undefined}
                    aria-label={step.label}
                    className={cn('block h-1.5 w-full rounded-[1px] transition-colors disabled:cursor-not-allowed', index <= active ? 'bg-ink' : available[index] ? 'bg-ink/30 hover:bg-ink/50' : 'bg-ink/10')}
                  />
                </li>
              ))}
            </ol>
          </div>
        </nav>
      ) : null}

      <div className={cn(pageContainerClass, 'flex min-h-0 flex-1')}>
        {active >= 0 ? (
          <aside className={cn('hidden w-60 shrink-0 border-r border-line py-12 pr-8 font-sans lg:block xl:w-64', LEDGER_RAIL)} aria-label="Session progress">
            <p className="mb-10 text-xs font-bold uppercase tracking-[0.2em] text-ink/65">Step {active + 1} of {steps.length}</p>
            <RailToc
              items={items}
              activeIndex={Math.max(0, active)}
              initialIndex={Math.max(0, initialRailStep)}
              disabledIndices={disabledIndices}
              onSelect={goToStep}
              title="Session steps"
            />
          </aside>
        ) : null}
        {/* Scrolls vertically; clips horizontally so the step slide never widens the page. */}
        <main id="main-content" className="scroll-area relative flex min-w-0 flex-1 items-start overflow-x-hidden pt-10 md:pt-12 lg:pl-12 xl:pl-16">
          <div className="w-full max-w-3xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
