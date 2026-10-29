import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, LoaderCircle, Plus, RotateCw } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { AppPage, PageHeader, Section, SectionCount } from '../components/layout/page'
import { Button } from '../components/ui/button'
import { api, type StudySessionSummary } from '../lib/api'
import { useAuthStore } from '../lib/auth-state'
import { firstName } from '../lib/profile'
import { activeStudySessionId, clearFlowCache, markStudySessionHydrated, restoreStudySession, sessionStepPath, setActiveStudySession } from '../lib/study-session'
import { cn } from '../lib/utils'

const STAGES = ['Material', 'Goal', 'Prepare', 'Practice', 'Results'] as const

/** How far a session got, 0 (no material yet) to 4 (results ready). */
function stageIndex(session: StudySessionSummary): number {
  if (session.practice_status === 'completed') return 4
  if (session.practice_status) return 3
  if (session.context_id) return 2
  if (session.material_count) return 1
  return 0
}

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
const longDateFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'narrow' })

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (Math.abs(minutes) < 60) return relativeFormat.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return relativeFormat.format(-hours, 'hour')
  return relativeFormat.format(-Math.round(hours / 24), 'day')
}

function greeting(now = new Date()): string {
  const hour = now.getHours()
  if (hour < 5) return 'Working late'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

const pad = (value: number) => String(value).padStart(2, '0')

/* ---- Stage meter --------------------------------------------------------------------- */

/** Five square segments, one per flow step, filled up to the step the session has reached. */
function StageMeter({ session }: { session: StudySessionSummary }) {
  const reached = stageIndex(session)
  return (
    <span className="flex flex-col gap-2">
      <span className="flex gap-1" aria-hidden="true">
        {STAGES.map((stage, index) => (
          <span key={stage} className={cn('h-1.5 w-6 rounded-[1px]', index <= reached ? 'bg-ink' : 'bg-ink/15')} />
        ))}
      </span>
      <span className="text-xs text-ink/65">
        <span className="sr-only">Step {reached + 1} of {STAGES.length}: </span>
        {nextStep(session)}
      </span>
    </span>
  )
}

/* ---- Page ---------------------------------------------------------------------------- */

type Filter = 'all' | 'live' | 'done'

const thClass = 'pb-3 pt-4 text-left align-bottom text-[10px] font-bold uppercase tracking-[0.18em] text-ink/55 md:text-xs'

export function SessionsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const [filter, setFilter] = useState<Filter>('all')

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
  const liveItems = items.filter(isLive)
  const doneCount = items.length - liveItems.length
  const latestLive = liveItems[0]
  const activeId = activeStudySessionId()
  const loading = sessions.isLoading
  const visible = filter === 'live' ? liveItems : filter === 'done' ? items.filter((s) => !isLive(s)) : items

  const startButton = (
    <Button onClick={() => create.mutate()} disabled={create.isPending}>
      {create.isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
      New Session
    </Button>
  )

  const filters: Array<{ value: Filter; label: string; count: number }> = [
    { value: 'all', label: 'All', count: items.length },
    { value: 'live', label: 'In progress', count: liveItems.length },
    { value: 'done', label: 'Completed', count: doneCount },
  ]

  return (
    <AppPage>
      <PageHeader
        overline={longDateFormat.format(new Date())}
        title={`${greeting()}, ${firstName(user)}.`}
        description={
          latestLive
            ? `“${latestLive.title}” is waiting for you. ${nextStep(latestLive)}.`
            : 'Bring a source, say what you know, and see what sticks.'
        }
        actions={
          <>
            {latestLive ? (
              <Button
                variant="secondary"
                onClick={() => resume.mutate(latestLive.id)}
                disabled={resume.isPending}
              >
                {resume.isPending && resume.variables === latestLive.id ? (
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                ) : (
                  <RotateCw aria-hidden="true" />
                )}
                Resume Latest
              </Button>
            ) : null}
            {startButton}
          </>
        }
      />

      <Section
        id="sessions-title"
        title="Sessions"
        aside={
          items.length > 0 ? (
            <div role="group" aria-label="Filter sessions" className="flex items-center gap-4">
              {filters.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={filter === option.value}
                  onClick={() => setFilter(option.value)}
                  className={cn(
                    'text-xs font-bold uppercase tracking-[0.14em] transition-colors',
                    filter === option.value ? 'text-ink' : 'text-ink/45 hover:text-ink',
                  )}
                >
                  {option.label} <span className="tabular font-mono font-normal">{pad(option.count)}</span>
                </button>
              ))}
            </div>
          ) : (
            <SectionCount value={items.length} />
          )
        }
      >
        {sessions.isError ? (
          <div className="flex flex-col items-start gap-4 border-b border-line py-10">
            <p className="text-sm text-ink/70">Could not load your sessions. Check your connection and try again.</p>
            <Button variant="ghost" onClick={() => void sessions.refetch()}>
              <RotateCw aria-hidden="true" /> Retry
            </Button>
          </div>
        ) : null}

        {!loading && !sessions.isError && items.length === 0 ? (
          <div className="flex flex-col items-start border-b border-line py-14">
            <p className="font-serif text-3xl italic text-ink md:text-4xl">Nothing on the ledger yet.</p>
            <p className="text-pretty mt-3 max-w-md text-sm leading-6 text-ink/65">
              Start a session with a PDF or your own notes. It saves as you go, so you can stop at any step and pick it up here.
            </p>
            <div className="mt-8">{startButton}</div>
          </div>
        ) : null}

        {!loading && items.length > 0 && visible.length === 0 ? (
          <p className="border-b border-line py-10 text-sm text-ink/65">
            {filter === 'live' ? 'Nothing in progress. Every session has its results.' : 'No completed sessions yet.'}
          </p>
        ) : null}

        {loading || visible.length > 0 ? (
          <table className="w-full table-fixed border-collapse text-left text-sm">
            <caption className="sr-only">Your study sessions, how far each got, and how to continue them.</caption>
            <thead className="border-b border-line">
              <tr>
                <th scope="col" className={cn(thClass, 'hidden w-14 sm:table-cell')}>#</th>
                <th scope="col" className={thClass}>Session</th>
                <th scope="col" className={cn(thClass, 'hidden w-48 lg:table-cell')}>Stage</th>
                <th scope="col" className={cn(thClass, 'hidden w-32 md:table-cell')}>Updated</th>
                <th scope="col" className={cn(thClass, 'w-28 text-right')}>
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 4 }, (_, index) => (
                    <tr key={index} className="border-b border-line" aria-hidden="true">
                      <td className="hidden py-6 sm:table-cell"><span className="block h-4 w-6 animate-pulse rounded-sm bg-ink/10" /></td>
                      <td className="py-6 pr-4"><span className="block h-5 w-3/4 animate-pulse rounded-sm bg-ink/10" /></td>
                      <td className="hidden py-6 lg:table-cell"><span className="block h-3 w-32 animate-pulse rounded-sm bg-ink/10" /></td>
                      <td className="hidden py-6 md:table-cell"><span className="block h-3 w-20 animate-pulse rounded-sm bg-ink/10" /></td>
                      <td className="py-6"><span className="ml-auto block h-4 w-16 animate-pulse rounded-sm bg-ink/10" /></td>
                    </tr>
                  ))
                : visible.map((session) => {
                    const live = isLive(session)
                    const active = session.id === activeId && live
                    const pending = resume.isPending && resume.variables === session.id
                    const number = items.indexOf(session) + 1
                    return (
                      <tr key={session.id} className="group border-b border-line align-middle transition-colors hover:bg-ink/[0.035]">
                        <td className="tabular hidden py-6 font-mono text-sm text-ink/45 sm:table-cell">{pad(number)}.</td>
                        <th scope="row" className="min-w-0 py-6 pr-4 text-left font-normal">
                          <span className="flex min-w-0 items-center gap-3">
                            <span className="min-w-0 truncate font-serif text-xl leading-tight text-strong md:text-2xl">{session.title}</span>
                            {active ? (
                              <span className="shrink-0 rounded-[3px] border border-ink/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink">
                                Open
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-1.5 block truncate text-sm text-ink/55">
                            {session.material_count} {session.material_count === 1 ? 'source' : 'sources'}
                            <span className="lg:hidden"> · {nextStep(session)}</span>
                          </span>
                        </th>
                        <td className="hidden py-6 pr-4 lg:table-cell">
                          <StageMeter session={session} />
                        </td>
                        <td className="hidden py-6 pr-4 text-xs whitespace-nowrap text-ink/60 md:table-cell">
                          <time dateTime={session.updated_at} title={dateFormat.format(new Date(session.updated_at))}>
                            {timeAgo(session.updated_at)}
                          </time>
                        </td>
                        <td className="py-6 text-right">
                          <button
                            type="button"
                            onClick={() => resume.mutate(session.id)}
                            disabled={resume.isPending}
                            aria-label={`${live ? 'Resume' : 'View results of'} ${session.title}`}
                            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-ink transition-colors hover:text-strong disabled:opacity-50"
                          >
                            {live ? 'Resume' : 'Results'}
                            {pending ? (
                              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                            ) : (
                              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                            )}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        ) : null}
      </Section>
    </AppPage>
  )
}
