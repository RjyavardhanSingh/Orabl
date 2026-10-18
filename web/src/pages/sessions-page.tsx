import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, BookOpen, Clock3, LoaderCircle, LogOut, Plus, Sparkles } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { api, type StudySessionSummary } from '../lib/api'
import { activeStudySessionId, clearFlowCache, markStudySessionHydrated, restoreStudySession, sessionStepPath, setActiveStudySession } from '../lib/study-session'
import { useAuthStore } from '../lib/auth-state'
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

/** Shared action style: a text button with a rule under it, never a pill. */
const actionClass =
  'inline-flex items-center gap-1.5 border-b border-line-strong pb-0.5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-50'

/** Full-bleed shell: spans the viewport, gutters scale with the device width. */
const shellClass = 'w-full px-[clamp(1.25rem,5vw,6rem)]'

export function SessionsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
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
  const handle = user?.email?.split('@')[0] ?? ''
  const displayName = handle || 'there'

  // The active session is the one the learner last opened; fall back to the
  // most recent session that still has work left in it.
  const storedId = activeStudySessionId()
  const activeId =
    (storedId && items.some((s) => s.id === storedId) ? storedId : null) ??
    items.find(isLive)?.id ??
    null
  const liveCount = items.filter(isLive).length

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-3 focus:text-black">Skip to content</a>
      <header className={cn(shellClass, 'flex items-center justify-between py-5')}>
        <Link to="/sessions" className="text-xl font-extrabold tracking-[-0.08em] hover:opacity-90">Orabl</Link>
        <div className="flex items-center gap-5">
          <Link to="/" className="hidden text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted transition-colors hover:text-ink sm:inline">Home</Link>
          <span className="hidden text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint sm:inline">Your learning space</span>
          <button type="button" onClick={() => void signOut().then(() => navigate('/'))} aria-label="Sign out" className="text-ink-muted transition-colors hover:text-ink"><LogOut className="size-4" /></button>
        </div>
      </header>

      <main id="main-content" className={cn(shellClass, 'pb-24')}>
        <section className="border-t border-line pt-10 sm:pt-14" aria-labelledby="dashboard-title">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-6">
            <div className="min-w-0">
              <p className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-accent"><Sparkles className="size-4" /> Your learning dashboard</p>
              <h1 id="dashboard-title" className="break-words font-display text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.08] tracking-[-0.045em]">Welcome, {displayName}.</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-ink-muted">
                {sessions.isLoading ? 'Your learning space is opening…' : items.length === 0 ? 'You don’t have a session yet. Start one to gather your material, set a goal, and learn at your own pace.' : 'Pick up where you left off, or follow a new question.'}
              </p>
            </div>
            <button type="button" onClick={() => create.mutate()} disabled={create.isPending} className={cn(actionClass, 'text-base')}>
              {create.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} New session
            </button>
          </div>

          <dl className="mt-10 grid w-full grid-cols-2 border-y border-line md:grid-cols-4">
            <div className="py-5 pr-6">
              <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">In progress</dt>
              <dd className="tabular mt-1.5 font-display text-2xl">{String(liveCount).padStart(2, '0')}</dd>
            </div>
            <div className="border-l border-line py-5 pl-6">
              <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">Completed</dt>
              <dd className="tabular mt-1.5 font-display text-2xl">{String(items.length - liveCount).padStart(2, '0')}</dd>
            </div>
          </dl>
        </section>

        <section className="mt-12" aria-labelledby="sessions-title">
          <div className="flex items-baseline justify-between border-b border-line-strong pb-4">
            <h2 id="sessions-title" className="font-display text-2xl tracking-[-0.02em] sm:text-3xl">My sessions</h2>
            <span className="tabular text-sm font-semibold text-ink-faint">{String(items.length).padStart(2, '0')}</span>
          </div>

          {sessions.isLoading ? <p className="flex items-center gap-2 py-10 text-sm text-ink-muted" role="status"><LoaderCircle className="size-4 animate-spin" /> Loading your sessions…</p> : null}
          {sessions.isError ? <p className="py-10 text-sm text-bad">Could not load your sessions. <button type="button" onClick={() => void sessions.refetch()} className="underline underline-offset-4">Retry</button></p> : null}

          {!sessions.isLoading && !sessions.isError && items.length === 0 ? (
            <div className="flex flex-col items-start gap-4 py-12 text-ink-muted">
              <BookOpen className="size-6" />
              <p className="text-sm">Your first session will appear here and save as you go.</p>
              <button type="button" onClick={() => create.mutate()} disabled={create.isPending} className={actionClass}>Start a session <ArrowRight className="size-4" /></button>
            </div>
          ) : null}

          {items.length > 0 ? (
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Your study sessions, their current stage, and how to continue them.</caption>
              <thead>
                <tr className="border-b border-line text-[0.68rem] uppercase tracking-[0.16em] text-ink-faint">
                  <th scope="col" className="py-3 pr-4 font-semibold">Session</th>
                  <th scope="col" className="hidden py-3 pr-4 font-semibold sm:table-cell">Stage</th>
                  <th scope="col" className="hidden py-3 pr-4 font-semibold md:table-cell">Updated</th>
                  <th scope="col" className="py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((session) => {
                  const live = isLive(session)
                  const active = session.id === activeId && live
                  const pending = resume.isPending && resume.variables === session.id
                  return (
                    <tr key={session.id} className={cn('border-b border-line align-middle transition-colors hover:bg-sunk', active && 'bg-accent-tint/20')}>
                      <td className="py-4 pr-4">
                        <span className="flex items-center gap-3">
                          <span className={cn('size-1.5 shrink-0 rounded-full', active ? 'bg-accent' : live ? 'bg-ink-faint' : 'bg-line-strong')} aria-hidden="true" />
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="truncate font-display text-lg leading-tight">{session.title}</span>
                              {active ? <span className="shrink-0 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-accent-ink">Active</span> : null}
                            </span>
                            <span className="mt-1 block text-xs text-ink-faint">
                              {session.material_count} {session.material_count === 1 ? 'source' : 'sources'}
                              <span className="sm:hidden"> · {nextStep(session)}</span>
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="hidden py-4 pr-4 text-sm text-ink-muted sm:table-cell">{nextStep(session)}</td>
                      <td className="hidden py-4 pr-4 md:table-cell">
                        <span className="flex items-center gap-2 text-xs text-ink-faint"><Clock3 className="size-3.5" /> {new Date(session.updated_at).toLocaleDateString()}</span>
                      </td>
                      <td className="py-4 text-right">
                        <button type="button" onClick={() => resume.mutate(session.id)} disabled={resume.isPending} className={actionClass}>
                          {pending ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />} {live ? 'Resume' : 'View results'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : null}
        </section>
      </main>
    </div>
  )
}
