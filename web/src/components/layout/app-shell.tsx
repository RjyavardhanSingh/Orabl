import { ChevronDown, FileText } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import { activeStudySessionId, sessionStepPath } from '../../lib/study-session'
import { RailToc } from '../ui/rail-toc'
import { AppNavbar } from './app-navbar'
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
 * Editorial Ledger theme: re-points the shared dark tokens at the brand palette for this subtree,
 * so the rail tracker reads in maroon opacities on beige without forking it.
 */
const LEDGER_TOKENS = [
  '[color-scheme:light]',
  '[--color-ink:#451017] [--color-ink-muted:rgb(69_16_23/0.6)] [--color-ink-faint:#451017]',
  '[--color-line-strong:rgb(69_16_23/0.3)] [--color-accent:#451017]',
].join(' ')

/**
 * Ledger "spine": the rail spaced out to fill the left column. The plane loses its glow, the
 * dashed track and dots sit at maroon/30, step names set in serif italic, and the active step
 * goes large and bold. RailToc
 * re-measures its path on resize, so the line stretches with the wider gaps.
 */
const LEDGER_RAIL = [
  '[&_[data-slot=rail-toc-plane]]:[filter:none] [&_[data-slot=rail-toc-track]]:stroke-[#451017]/30',
  '[&_[data-slot=rail-toc-title]]:mb-8 [&_[data-slot=rail-toc-title]]:tracking-widest [&_[data-slot=rail-toc-title]]:text-[#451017]',
  '[&_[data-slot=rail-toc-list]]:flex [&_[data-slot=rail-toc-list]]:flex-col [&_[data-slot=rail-toc-list]]:gap-8',
  '[&_[data-slot=rail-toc-list]_button]:font-serif [&_[data-slot=rail-toc-list]_button]:italic',
  '[&_[aria-current=step]]:text-lg [&_[aria-current=step]]:font-bold',
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

export function AppShell({ children, variant = 'dark' }: { children: ReactNode; variant?: 'dark' | 'ledger' }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { studyId } = useParams()
  const mobileStepsRef = useRef<HTMLDetailsElement>(null)
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
    if (mobileStepsRef.current) mobileStepsRef.current.open = false
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
  const progressRail = (className?: string) => (
    <RailToc
      items={items}
      activeIndex={Math.max(0, active)}
      initialIndex={Math.max(0, initialRailStep)}
      disabledIndices={disabledIndices}
      onSelect={goToStep}
      title="Session steps"
      className={className}
    />
  )

  if (variant === 'ledger') {
    return (
      // Locked to the window like a desktop app: nothing scrolls.
      <div className={`flex h-screen max-h-screen w-full flex-col overflow-hidden bg-[#EBE5D9] text-black ${LEDGER_TOKENS}`}>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-[#EBE5D9] focus:p-3 focus:text-black">Skip to content</a>
        <AppNavbar />

        <main id="main-content" className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-start gap-8 overflow-hidden px-6 py-6 md:gap-12 md:px-8 md:py-8 lg:grid-cols-12">
          {/* Sticky is now measured from <main>'s top, below the navbar: top-12 keeps the old resting spot. */}
          {active >= 0 ? (
            <div className={`col-span-12 font-sans lg:sticky lg:top-12 lg:col-span-3 ${LEDGER_RAIL}`}>
              <p className="mb-10 font-sans text-xs font-bold uppercase tracking-[0.2em] text-[#451017]/70">Step {active + 1} of {steps.length}</p>
              {progressRail()}
            </div>
          ) : null}
          {/* Masks the step slide so it never widens the page. */}
          <div className="relative col-span-12 flex min-w-0 items-start overflow-hidden lg:col-span-9">{children}</div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-canvas text-ink">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-3 focus:text-black">Skip to content</a>
      <AppNavbar className="max-w-[80rem] px-5 sm:px-8 lg:px-12" />

      {active >= 0 ? (
        <details ref={mobileStepsRef} className="relative z-20 shrink-0 border-b border-line/70 bg-sunk lg:hidden">
          <summary className="mx-auto flex min-h-12 max-w-[80rem] cursor-pointer list-none items-center gap-3 px-5 text-xs font-semibold text-ink sm:px-8 [&::-webkit-details-marker]:hidden">
            <span className="text-accent">{String(active + 1).padStart(2, '0')} / 05</span>
            <span>{steps[active].label}</span>
            <span className="ml-auto text-ink-muted">Steps</span>
            <ChevronDown className="size-4 text-ink-muted" aria-hidden="true" />
          </summary>
          <div className="absolute inset-x-0 top-full border-b border-line-strong bg-sunk px-5 py-5 shadow-xl sm:px-8">
            {progressRail('mx-auto max-w-sm')}
          </div>
        </details>
      ) : null}

      <div className="mx-auto flex min-h-0 w-full max-w-[90rem] flex-1">
        {active >= 0 ? (
          <aside className="hidden w-52 shrink-0 border-r border-line/70 px-5 py-9 lg:block xl:w-60 xl:px-8" aria-label="Session progress">
            <p className="mb-7 text-[11px] font-semibold text-ink-muted">Step {active + 1} of {steps.length}</p>
            {progressRail()}
          </aside>
        ) : null}
        <main id="main-content" className="workflow-main min-h-0 min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  )
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  const location = useLocation()
  const index = steps.findIndex((step) => location.pathname.endsWith(step.path))
  return (
    <div className="flex shrink-0 flex-col justify-between gap-4 border-b border-line-strong pb-5 lg:flex-row lg:items-end">
      <div className="min-w-0 max-w-2xl">
        {index >= 0 ? <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-accent">Step {String(index + 1).padStart(2, '0')} / 05 · {steps[index].label}</p> : null}
        <h1 className="text-balance font-display text-[clamp(1.4rem,2.5vw,1.9rem)] leading-[1.18] tracking-[-0.025em] text-ink">{title}</h1>
        {description ? <p className="text-pretty mt-2 max-w-xl text-sm leading-6 text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="flex min-w-0 flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  )
}

export function LoadingState({ label = 'Loading your workspace…' }: { label?: string }) {
  return <div className="flex items-center justify-center py-10 text-sm text-ink-muted" role="status">{label}</div>
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="scroll-area mx-auto flex h-full max-w-xl flex-col items-center px-6 py-8 text-center"><div className="my-auto flex flex-col items-center">{icon ? <div className="grid size-14 place-items-center rounded-2xl bg-accent-tint text-accent">{icon}</div> : null}<h1 className="text-pretty mt-5 max-w-md font-display text-2xl">{title}</h1><p className="text-pretty mt-3 max-w-sm text-sm leading-6 text-ink-muted">{description}</p>{action ? <div className="mt-6">{action}</div> : null}</div></div>
}

export function FileTypeIcon() { return <FileText className="size-5" aria-hidden="true" /> }
