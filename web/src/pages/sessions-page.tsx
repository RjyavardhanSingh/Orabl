import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, BookOpen, Clock3, LoaderCircle, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'


import { UserDropdown } from '../components/user-dropdown'

import { Table, TableBody, TableCaption, TableCell, TableRow } from '../components/ui/table'
import { api, type StudySessionSummary } from '../lib/api'
import { activeStudySessionId, clearFlowCache, markStudySessionHydrated, restoreStudySession, sessionStepPath, setActiveStudySession } from '../lib/study-session'
import { useAuthStore } from '../lib/auth-state'
import { nameFromEmail } from '../lib/profile'

function nextStep(session: StudySessionSummary): string {
  if (session.practice_status === 'completed') return 'Results ready'
  if (session.practice_status) return 'Practice in progress'
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
  'inline-flex items-center gap-1.5 border-b border-[#451017]/20 pb-0.5 text-sm font-semibold text-black transition-colors hover:border-[#451017] hover:text-[#451017] disabled:pointer-events-none disabled:opacity-50'

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-[#451017] rounded-xl p-6 shadow-sm">
      <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[#EBE5D9]/70">{label}</dt>
      <dd className="tabular mt-3 truncate font-serif text-3xl leading-none sm:text-4xl text-[#EBE5D9]">{value}</dd>
      {hint ? <p className="mt-1.5 truncate text-sm text-[#EBE5D9]/60">{hint}</p> : null}
    </div>
  )
}

const HEATMAP_DAYS = 30
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/** Monochrome maroon scale; never rounded-full, never dots. */
const heatLevelClass = [
  'bg-transparent border border-[#451017]/10 text-[#451017]/40',
  'bg-[#451017]/20 text-[#451017]',
  'bg-[#451017]/50 text-[#EBE5D9]',
  'bg-[#451017]/80 text-[#EBE5D9]',
]
const todayNodeClass = 'bg-[#451017] text-[#EBE5D9] shadow-[2px_2px_0px_#000000] border border-black font-bold'

/** Activity per local day: how many sessions were created or worked on that day. */
function activityByDay(sessions: StudySessionSummary[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const session of sessions) {
    const days = new Set([session.created_at, session.updated_at].map((iso) => new Date(iso).toDateString()))
    for (const day of days) counts.set(day, (counts.get(day) ?? 0) + 1)
  }
  return counts
}

function ActivityHeatmap({ sessions }: { sessions: StudySessionSummary[] }) {
  const counts = activityByDay(sessions)
  const today = new Date()
  const days = Array.from({ length: HEATMAP_DAYS }, (_, index) => {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (HEATMAP_DAYS - 1 - index))
    return { day, count: counts.get(day.toDateString()) ?? 0, isToday: index === HEATMAP_DAYS - 1 }
  })
  // Pad so the first day lands under its weekday column.
  const leading = days[0].day.getDay()

  return (
    <div className="col-span-12 lg:col-span-4 border border-[#451017]/20 rounded-xl p-6 flex flex-col bg-transparent min-h-[300px]">
      <h3 className="font-sans uppercase tracking-[0.2em] text-xs font-bold text-black border-b border-[#451017]/20 pb-4 mb-6 flex justify-between items-end">
        <span>Activity Heatmap</span> <span className="text-[10px] text-[#451017]/60">LAST 30 DAYS</span>
      </h3>
      <div className="grid grid-cols-7 gap-1 md:gap-1.5 w-full">
        {WEEKDAY_LABELS.map((label, index) => (
          <span key={index} aria-hidden="true" className="text-[9px] font-sans font-bold text-[#451017]/40 text-center pb-2">
            {label}
          </span>
        ))}
        {Array.from({ length: leading }, (_, index) => (
          <span key={`pad-${index}`} aria-hidden="true" />
        ))}
        {days.map(({ day, count, isToday }) => {
          const label = `${dateFormat.format(day)}: ${count} ${count === 1 ? 'session' : 'sessions'}`
          return (
            <span
              key={day.toDateString()}
              title={label}
              aria-label={label}
              className={`aspect-square flex items-center justify-center text-[8px] font-sans font-medium rounded-sm transition-colors cursor-default ${
                isToday ? todayNodeClass : heatLevelClass[Math.min(count, 3)]
              }`}
            >
              {day.getDate()}
            </span>
          )
        })}
      </div>
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
  const liveCount = items.filter(isLive).length
  const sourceCount = items.reduce((total, session) => total + session.material_count, 0)
  const lastTouched = items[0]?.updated_at
  const activeId = activeStudySessionId()

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[#EBE5D9] text-[#451017]">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-3 focus:text-black">
        Skip to content
      </a>

      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Top Navigation - Structural */}
        <header className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-12 border-b border-[#451017]/20 pb-4 mb-8 flex justify-between items-center pt-6">
          <Link to="/sessions" className="text-2xl font-extrabold tracking-[-0.08em] text-[#451017] hover:opacity-90">
            Orabl
          </Link>
          <div className="flex items-center gap-4 md:gap-6">
            <button
              type="button"
              onClick={() => create.mutate()}
              disabled={create.isPending}
              className="bg-[#451017] text-[#EBE5D9] hover:bg-black px-5 py-2.5 rounded-xl font-sans font-bold text-[10px] md:text-xs uppercase tracking-widest transition-colors shrink-0 inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {create.isPending ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="size-4" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">Start Session</span>
              <span className="sm:hidden">Start</span>
            </button>
            <UserDropdown displayName={displayName ?? ''} email={user?.email} />
          </div>
        </header>

        <main id="main-content" className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-12 pb-16">
          {/* Hero Header & Metric Grid */}
          <section className="mb-8">
            <h1 className="font-serif italic text-5xl md:text-6xl text-[#451017] tracking-tight leading-tight mb-8">
              Welcome back, Raj.
            </h1>

            <div className="grid grid-cols-12 gap-6 md:gap-8">
            {/* The Metric Ledger — left of the heatmap */}
            <div className="col-span-12 lg:col-span-8 grid grid-cols-2 gap-4 md:gap-6 content-start">
              <Metric
                label="In Progress"
                value={String(liveCount).padStart(2, '0')}
                hint={liveCount ? 'Ready to resume' : 'Nothing open'}
              />
              <Metric
                label="Completed"
                value={String(items.length - liveCount).padStart(2, '0')}
                hint="Results saved"
              />
              <Metric
                label="Sources"
                value={String(sourceCount).padStart(2, '0')}
                hint="Materials uploaded"
              />
              <Metric
                label="Last Activity"
                value={lastTouched ? timeAgo(lastTouched) : '—'}
                hint={lastTouched ? dateFormat.format(new Date(lastTouched)) : 'No sessions yet'}
              />
            </div>

            <ActivityHeatmap sessions={items} />
            </div>
          </section>

          {/* The Sessions Ledger (Table) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-8">
            <section className="col-span-12 lg:col-span-9 min-w-0" aria-labelledby="sessions-title">
              <div className="border-b-2 border-black pb-4 mb-0">
                <h2 id="sessions-title" className="font-serif text-4xl text-[#451017]">
                  Sessions Ledger
                </h2>
              </div>

            {sessions.isError ? (
              <p className="py-10 text-sm text-[#451017]/70">
                Could not load your sessions. Check your connection and{' '}
                <button type="button" onClick={() => void sessions.refetch()} className="underline underline-offset-4">
                  retry
                </button>
                .
              </p>
            ) : null}

            {!sessions.isLoading && !sessions.isError && items.length === 0 ? (
              <div className="flex flex-col items-start gap-4 py-12 text-[#451017]/70">
                <BookOpen className="size-6" aria-hidden="true" />
                <p className="max-w-sm text-sm leading-6">Your first session will appear here and save as you go.</p>
                <button
                  type="button"
                  onClick={() => create.mutate()}
                  disabled={create.isPending}
                  className={actionClass}
                >
                  {create.isPending ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Plus className="size-4" aria-hidden="true" />
                  )}{' '}
                  Start a Session <ArrowRight className="size-4" aria-hidden="true" />
                </button>
              </div>
            ) : null}

            {sessions.isLoading || items.length > 0 ? (
              <div className="overflow-x-auto bg-transparent">
                <Table className="w-full table-fixed border-collapse text-left">
                  <TableCaption className="sr-only">
                    Your study sessions, their current stage, and how to continue them.
                  </TableCaption>
                  <thead className="bg-transparent border-b-2 border-black">
                    <tr className="bg-transparent hover:bg-transparent border-none">
                      <th scope="col" className="hidden w-16 pt-4 pb-3 pl-4 text-left align-middle text-black font-sans font-bold text-[10px] md:text-xs uppercase tracking-[0.15em] opacity-70 sm:table-cell">
                        #
                      </th>
                      <th scope="col" className="pt-4 pb-3 pl-4 pr-3 text-left align-middle text-black font-sans font-bold text-[10px] md:text-xs uppercase tracking-[0.15em] opacity-70 sm:pl-0 sm:pr-5">
                        Session
                      </th>
                      <th scope="col" className="hidden w-60 pt-4 pb-3 pr-5 text-left align-middle text-black font-sans font-bold text-[10px] md:text-xs uppercase tracking-[0.15em] opacity-70 lg:table-cell">
                        Stage
                      </th>
                      <th scope="col" className="hidden w-44 pt-4 pb-3 pr-5 text-left align-middle text-black font-sans font-bold text-[10px] md:text-xs uppercase tracking-[0.15em] opacity-70 md:table-cell">
                        Updated
                      </th>
                      <th scope="col" className="w-30 pt-4 pb-3 pr-4 text-right align-middle text-black font-sans font-bold text-[10px] md:text-xs uppercase tracking-[0.15em] opacity-70 sm:w-40 sm:pr-6">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <TableBody>
                    {sessions.isLoading
                      ? Array.from({ length: 3 }, (_, index) => (
                          <TableRow key={index} className="border-b border-[#451017]/10" aria-hidden="true">
                            <TableCell className="hidden py-4 pl-4 sm:table-cell">
                              <span className="block h-4 w-6 animate-pulse bg-[#451017]/10" />
                            </TableCell>
                            <TableCell className="py-4 pl-4 pr-3 sm:pl-0 sm:pr-5">
                              <span className="block h-4 w-3/4 animate-pulse bg-[#451017]/10" />
                            </TableCell>
                            <TableCell className="hidden py-4 pr-5 lg:table-cell">
                              <span className="block h-4 w-32 animate-pulse bg-[#451017]/10" />
                            </TableCell>
                            <TableCell className="hidden py-4 pr-5 md:table-cell">
                              <span className="block h-4 w-24 animate-pulse bg-[#451017]/10" />
                            </TableCell>
                            <TableCell className="py-4 pr-4 text-right sm:pr-6">
                              <span className="ml-auto block h-4 w-16 animate-pulse bg-[#451017]/10" />
                            </TableCell>
                          </TableRow>
                        ))
                      : items.map((session, index) => {
                          const live = isLive(session)
                          const active = session.id === activeId && live
                          const pending = resume.isPending && resume.variables === session.id
                          return (
                            <TableRow
                              key={session.id}
                              className="border-b border-[#451017]/20 align-middle transition-colors hover:bg-[#451017]/5"
                            >
                              <TableCell className="hidden w-16 py-6 pl-4 text-left sm:table-cell">
                                <span className="font-mono text-sm text-[#451017]/50 w-8">{String(index + 1).padStart(2, '0')}.</span>
                              </TableCell>
                              <TableCell scope="row" className="min-w-0 py-6 pl-4 pr-3 text-left font-normal sm:pl-0 sm:pr-5">
                                <span className="flex min-w-0 items-center gap-3">
                                  <span className="min-w-0 truncate font-serif text-2xl leading-tight text-black hover:text-[#451017] transition-colors">
                                    {session.title}
                                  </span>
                                  {active ? (
                                    <span className="shrink-0 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-black">
                                      ACTIVE
                                    </span>
                                  ) : null}
                                </span>
                                <span className="mt-1 block truncate text-sm text-black/50">
                                  {session.material_count} {session.material_count === 1 ? 'source' : 'sources'}
                                  <span className="lg:hidden"> · {nextStep(session)}</span>
                                </span>
                              </TableCell>
                              <TableCell className="hidden py-6 pr-5 text-sm text-black/60 lg:table-cell">
                                {nextStep(session)}
                              </TableCell>
                              <TableCell className="hidden py-6 pr-5 md:table-cell">
                                <span className="flex items-center gap-2 text-xs whitespace-nowrap text-black/60">
                                  <Clock3 className="size-3.5 shrink-0" aria-hidden="true" />
                                  <time dateTime={session.updated_at}>{dateFormat.format(new Date(session.updated_at))}</time>
                                </span>
                              </TableCell>
                              <TableCell className="py-6 pr-4 text-right sm:pr-6">
                                <button
                                  type="button"
                                  onClick={() => resume.mutate(session.id)}
                                  disabled={resume.isPending}
                                  className="font-sans font-bold uppercase text-xs tracking-wider text-[#451017] hover:text-black inline-flex items-center gap-2 transition-all hover:translate-x-1 disabled:opacity-50"
                                >
                                  {live ? 'Resume' : 'View'}{' '}
                                  {pending ? (
                                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                                  ) : (
                                    <ArrowRight className="size-4" aria-hidden="true" />
                                  )}
                                </button>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                  </TableBody>
                </Table>
              </div>
            ) : null}
            </section>

            {/* Coming Soon Vertical Block */}
            <aside className="col-span-12 lg:col-span-3">
              <div className="w-full h-full min-h-[350px] border border-[#451017]/20 rounded-xl flex flex-col items-center justify-center p-6 bg-[#451017]/5">
                <span className="font-serif text-2xl md:text-3xl text-[#451017]/30 text-center leading-[1.15] bg-transparent">
                  More Features<br />Coming<br />Soon
                </span>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  )
}
