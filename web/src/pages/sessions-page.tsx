import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, BookOpen, Clock3, LoaderCircle, Plus, Sparkles } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { ProfileMenu } from '../components/layout/profile-menu'
import { Button } from '../components/ui/button'
import { api, type StudySessionSummary } from '../lib/api'
import { activeStudySessionId, clearFlowCache, markStudySessionHydrated, restoreStudySession, sessionStepPath, setActiveStudySession } from '../lib/study-session'
import { useAuthStore } from '../lib/auth-state'
import { nameFromEmail } from '../lib/profile'
import { cn } from '../lib/utils'

function nextStep(session: StudySessionSummary): string {
  if (session.practice_status === 'completed') return 'Results ready'
  if (session.practice_id) return 'Practice in progress'
  if (session.context_id) return 'Questions are next'
  if (session.material_count) return 'Set your goal'
  return 'Add your material'
}

function isLive(session: StudySessionSummary): boolean {
  return session.practice_status !== 'completed'
}

// One formatter per locale, built once: no hardcoded date formats.
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'narrow' })

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (Math.abs(minutes) < 60) return relativeFormat.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return relativeFormat.format(-hours, 'hour')
  return relativeFormat.format(-Math.round(hours / 24), 'day')
}

/** Shared action style: a text button with a rule under it, never a pill. */
const actionClass =
  'inline-flex items-center gap-1.5 border-b border-line-strong pb-0.5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-50'

const shellClass = 'mx-auto w-full max-w-[80rem] px-5 sm:px-8 lg:px-12'

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface/80 px-4 py-5 sm:px-5">
      <dt className="truncate text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-ink-faint">{label}</dt>
      <dd className="tabular mt-3 truncate font-display text-[1.45rem] leading-none sm:text-[1.7rem]">{value}</dd>
      {hint ? <p className="mt-1.5 truncate text-xs text-ink-faint">{hint}</p> : null}
    </div>
  )
}

export function SessionsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const sessions = useQuery({ queryKey: ['study-sessions'], queryFn: api.listStudySessions, retry: false })
  const create = useMutation({
    mutationFn: api.createStudySession,
    onSuccess: (session) => {
      clearFlowCache()
      setActiveStudySession(session.id)
      markStudySessionHydrated(session.id)
      void queryClient.invalidateQueries({ queryKey: ['study-sessions'] })
      navigate(sessionStepPath('upload', session.id))
    },
    onError: () => toast.error('Could not create your session. Try again.'),
  })
  const resume = useMutation({
    mutationFn: async (id: string) => restoreStudySession(await api.getStudySession(id)),
    onSuccess: (step, id) => navigate(sessionStepPath(step, id)),
    onError: () => toast.error('Could not restore this session. Try again.'),
  })

  const items = sessions.data ?? []
  const displayName = nameFromEmail(user?.email)

  // The active session is the one the learner last opened; fall back to the
  // most recent session that still has work left in it.
  const storedId = activeStudySessionId()
  const activeId =
    (storedId && items.some((s) => s.id === storedId) ? storedId : null) ??
    items.find(isLive)?.id ??
    null
  const liveCount = items.filter(isLive).length
  const sourceCount = items.reduce((total, session) => total + session.material_count, 0)
  const lastTouched = items[0]?.updated_at

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-canvas bg-[radial-gradient(ellipse_at_78%_0%,rgba(243,112,30,0.09),transparent_34%)] text-ink">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-3 focus:text-black">Skip to content</a>
      <header className={cn(shellClass, 'flex shrink-0 items-center justify-between gap-4 border-b border-line py-4 sm:py-5')}>
        <Link to="/sessions" className="shrink-0 text-xl font-extrabold tracking-[-0.08em] hover:opacity-90">Orabl</Link>
        <ProfileMenu displayName={displayName} email={user?.email} />
      </header>

      <main id="main-content" className={cn(shellClass, 'dashboard-main scroll-area min-h-0 flex-1 pb-6 md:flex md:flex-col md:overflow-hidden')}>
        <section className="shrink-0 pt-8 sm:pt-10" aria-labelledby="dashboard-title">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-6">
            <div className="min-w-0">
              <p className="mb-3 flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-accent"><Sparkles className="size-3.5" aria-hidden="true" /> Your Learning Space</p>
              <h1 id="dashboard-title" className="text-pretty break-words font-display text-[clamp(1.4rem,2vw,1.8rem)] leading-tight tracking-[-0.02em]">Welcome back, {displayName}.</h1>
              <p className="mt-2 max-w-lg text-pretty text-sm leading-6 text-ink-muted">
                {sessions.isLoading ? 'Your learning space is opening…' : items.length === 0 ? 'You don’t have a session yet. Start one to gather your material, set a goal, and learn at your own pace.' : 'Pick up where you left off, or follow a new question.'}
              </p>
            </div>
            <Button type="button" variant="accent" onClick={() => create.mutate()} disabled={create.isPending} className="shrink-0 rounded-xl px-5">
              {create.isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />} New Session
            </Button>
          </div>

          <dl className="mt-7 grid grid-cols-2 gap-3 sm:mt-8 sm:grid-cols-4">
            <Metric label="In Progress" value={String(liveCount).padStart(2, '0')} hint={liveCount ? 'Ready to resume' : 'Nothing open'} />
            <Metric label="Completed" value={String(items.length - liveCount).padStart(2, '0')} hint="Results saved" />
            <Metric label="Sources" value={String(sourceCount).padStart(2, '0')} hint="Material you added" />
            <Metric label="Last Activity" value={lastTouched ? timeAgo(lastTouched) : '—'} hint={lastTouched ? dateFormat.format(new Date(lastTouched)) : 'No sessions yet'} />
          </dl>
        </section>

        <section className="dashboard-sessions mt-9 sm:mt-11 md:flex md:min-h-0 md:flex-1 md:flex-col" aria-labelledby="sessions-title">
          <div className="mb-4 flex shrink-0 items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-accent">Pick Up Where You Left Off</p>
              <h2 id="sessions-title" className="font-display text-xl tracking-[-0.02em] sm:text-[1.4rem]">My Sessions</h2>
            </div>
            <span className="tabular rounded-full border border-line px-3 py-1 text-xs text-ink-muted">{items.length} total</span>
          </div>

          {sessions.isError ? <p className="py-10 text-sm text-bad">Could not load your sessions. Check your connection and <button type="button" onClick={() => void sessions.refetch()} className="underline underline-offset-4">retry</button>.</p> : null}

          {!sessions.isLoading && !sessions.isError && items.length === 0 ? (
            <div className="flex flex-col items-start gap-4 py-12 text-ink-muted">
              <BookOpen className="size-6" aria-hidden="true" />
              <p className="max-w-sm text-sm leading-6">Your first session will appear here and save as you go.</p>
              <button type="button" onClick={() => create.mutate()} disabled={create.isPending} className={actionClass}>Start a Session <ArrowRight className="size-4" aria-hidden="true" /></button>
            </div>
          ) : null}

          {sessions.isLoading || items.length > 0 ? (
            <Table className="w-full table-fixed border-collapse text-left" containerClassName="dashboard-table scroll-area md:min-h-0 md:flex-1">
              <TableCaption className="sr-only">Your study sessions, their current stage, and how to continue them.</TableCaption>
              <TableHeader className="bg-surface/80 [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-surface">
                <TableRow className="border-b border-line text-[0.68rem] uppercase tracking-[0.14em] text-ink-faint">
                  <TableHead scope="col" className="hidden w-16 py-3.5 pl-4 font-semibold sm:table-cell">#</TableHead>
                  <TableHead scope="col" className="py-3.5 pl-4 pr-3 font-semibold sm:pl-0 sm:pr-5">Session</TableHead>
                  <TableHead scope="col" className="hidden w-[15rem] py-3.5 pr-5 font-semibold lg:table-cell">Stage</TableHead>
                  <TableHead scope="col" className="hidden w-[11rem] py-3.5 pr-5 font-semibold md:table-cell">Updated</TableHead>
                  <TableHead scope="col" className="w-[7.5rem] py-3.5 pr-4 text-right font-semibold sm:w-[10rem] sm:pr-6">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.isLoading
                  ? Array.from({ length: 3 }, (_, index) => (
                      <TableRow key={index} className="border-b border-line" aria-hidden="true">
                        <TableCell className="hidden py-4 pl-4 sm:table-cell"><span className="block h-4 w-6 animate-pulse rounded bg-sunk" /></TableCell>
                        <TableCell className="py-4 pl-4 pr-3 sm:pl-0 sm:pr-5"><span className="block h-4 w-3/4 animate-pulse rounded bg-sunk" /></TableCell>
                        <TableCell className="hidden py-4 pr-5 lg:table-cell"><span className="block h-4 w-32 animate-pulse rounded bg-sunk" /></TableCell>
                        <TableCell className="hidden py-4 pr-5 md:table-cell"><span className="block h-4 w-24 animate-pulse rounded bg-sunk" /></TableCell>
                        <TableCell className="py-4 pr-4 text-right sm:pr-6"><span className="ml-auto block h-4 w-16 animate-pulse rounded bg-sunk" /></TableCell>
                      </TableRow>
                    ))
                  : items.map((session, index) => {
                      const live = isLive(session)
                      const active = session.id === activeId && live
                      const pending = resume.isPending && resume.variables === session.id
                      return (
                        <TableRow key={session.id} className={cn('border-b border-line align-middle transition-colors hover:bg-surface', active && 'bg-accent-tint/20')}>
                          <TableCell className={cn('hidden w-16 py-4 pl-4 text-left text-xs font-bold sm:table-cell', active ? 'text-accent-ink' : 'text-ink-faint')}>
                            <span className="flex items-center gap-2">
                              <span className={cn('size-1.5 shrink-0 rounded-full', active ? 'bg-accent' : live ? 'bg-ink-faint' : 'bg-line-strong')} aria-hidden="true" />
                              <span className="tabular">{String(index + 1).padStart(2, '0')}</span>
                            </span>
                          </TableCell>
                          <TableHead scope="row" className="min-w-0 py-4 pl-4 pr-3 text-left font-normal sm:pl-0 sm:pr-5">
                            <span className="flex items-center gap-2">
                              <span className="truncate font-display text-base leading-tight">{session.title}</span>
                              {active ? <span className="hidden shrink-0 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-accent-ink sm:inline">Active</span> : null}
                            </span>
                            <span className="mt-1 block truncate text-xs text-ink-faint">
                              {session.material_count} {session.material_count === 1 ? 'source' : 'sources'}
                              <span className="lg:hidden"> · {nextStep(session)}</span>
                            </span>
                          </TableHead>
                          <TableCell className="hidden py-4 pr-5 text-sm text-ink-muted lg:table-cell">{nextStep(session)}</TableCell>
                          <TableCell className="hidden py-4 pr-5 md:table-cell">
                            <span className="flex items-center gap-2 text-xs whitespace-nowrap text-ink-faint"><Clock3 className="size-3.5 shrink-0" aria-hidden="true" /> <time dateTime={session.updated_at}>{dateFormat.format(new Date(session.updated_at))}</time></span>
                          </TableCell>
                          <TableCell className="py-4 pr-4 text-right sm:pr-6">
                            <button type="button" onClick={() => resume.mutate(session.id)} disabled={resume.isPending} className={cn(actionClass, 'whitespace-nowrap', active && 'border-accent text-accent-ink hover:text-accent-hover')}>
                              {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />} {live ? 'Resume' : 'View Results'}
                            </button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
              </TableBody>
            </Table>
          ) : null}

          <p className="sr-only" role="status" aria-live="polite">
            {sessions.isLoading ? 'Loading your sessions…' : `${items.length} sessions loaded.`}
          </p>
        </section>
      </main>
    </div>
  )
}
