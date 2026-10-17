import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, BookOpen, Clock3, LoaderCircle, LogOut, Plus, Sparkles } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { api, type StudySessionSummary } from '../lib/api'
import { clearFlowCache, markStudySessionHydrated, restoreStudySession, sessionStepPath, setActiveStudySession } from '../lib/study-session'
import { useAuthStore } from '../lib/auth-state'
import { Button } from '../components/ui/button'

function nextStep(session: StudySessionSummary): string {
  if (session.practice_status === 'completed') return 'Results ready'
  if (session.practice_id) return 'Practice in progress'
  if (session.context_id) return 'Questions are next'
  if (session.material_count) return 'Set your goal'
  return 'Add your material'
}

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
  const latest = items[0]
  const firstName = user?.email?.split('@')[0]?.split(/[._-]/)[0] || 'there'
  const displayName = firstName.charAt(0).toUpperCase() + firstName.slice(1)

  return (
    <div className="min-h-dvh bg-[#f6f2e9] text-[#25261e]">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-3">Skip to content</a>
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 sm:px-10">
        <Link to="/sessions" className="text-2xl font-extrabold tracking-[-0.08em] hover:opacity-90">Orabl<span className="text-[#d56130]">.</span></Link>
        <div className="flex items-center gap-3">
          <Link to="/" className="hidden text-xs font-semibold uppercase tracking-[0.16em] text-[#666455] hover:text-[#25261e] sm:inline">Home</Link>
          <span className="hidden rounded-full border border-[#d9d2c3] px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#666455] sm:inline">Your learning space</span>
          <Button type="button" size="icon" variant="ghost" onClick={() => void signOut().then(() => navigate('/'))} className="text-[#666455] hover:bg-[#eae4d8] hover:text-[#25261e]" aria-label="Sign out"><LogOut className="size-4" /></Button>
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-7xl px-6 pb-24 sm:px-10">
        <section className="grid gap-10 border-t border-[#d2cbbb] pt-10 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-16">
          <div className="min-w-0">
            <p className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[#a14c2c]"><Sparkles className="size-4" /> Your learning dashboard</p>
            <h1 className="max-w-4xl break-words font-display text-[clamp(2.75rem,5vw,4.5rem)] leading-[1.08] tracking-[-0.045em]">Welcome, {displayName}.</h1>
            <p className="mt-3 font-display text-[clamp(1.5rem,2.8vw,2.25rem)] italic leading-tight text-[#bd633e]">{items.length === 0 ? 'Curiosity looks good on you.' : 'You’re making progress.'}</p>
            <p className="mt-6 max-w-xl text-base leading-7 text-[#696759]">{sessions.isLoading ? 'Your learning space is opening…' : items.length === 0 ? 'You don’t have a session yet. Create one to gather your material, set a goal, and learn at your own pace.' : 'The work you started is right here. Continue at your pace, or follow a new question.'}</p>
            <Button type="button" onClick={() => create.mutate()} disabled={create.isPending} size="lg" className="mt-7 h-12 gap-4 bg-[#27281f] text-white hover:bg-[#424336]">
              {create.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} Create a new session <ArrowRight className="size-4" />
            </Button>
          </div>
          <aside className="hidden self-end border-t border-[#d2cbbb] pt-5 lg:block" aria-label="How a session works">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#a14c2c]">At your own pace</p>
            <ol className="mt-4 divide-y divide-[#d2cbbb] text-sm text-[#696759]">
              <li className="flex gap-4 py-3"><span className="font-bold text-[#25261e]">01</span> Add material</li>
              <li className="flex gap-4 py-3"><span className="font-bold text-[#25261e]">02</span> Set your goal</li>
              <li className="flex gap-4 py-3"><span className="font-bold text-[#25261e]">03</span> Practice and reflect</li>
            </ol>
          </aside>
        </section>
        {latest ? <section className="mt-14 border-y border-[#b9ae98] py-6" aria-label="Continue latest session"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#a14c2c]">Continue where you left off</p><div className="mt-4 flex flex-wrap items-end justify-between gap-6"><div><h2 className="font-display text-3xl">{latest.title}</h2><p className="mt-2 text-sm text-[#696759]">{nextStep(latest)} · Updated {new Date(latest.updated_at).toLocaleDateString()}</p></div><Button type="button" onClick={() => resume.mutate(latest.id)} disabled={resume.isPending} size="lg" className="bg-[#27281f] text-white hover:bg-[#424336]">{resume.isPending && resume.variables === latest.id ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />} Resume session</Button></div></section> : null}
        <section className={latest ? 'mt-12' : 'mt-14'} aria-labelledby="sessions-title">
          <div className="flex items-baseline justify-between border-b border-[#d2cbbb] pb-5"><h2 id="sessions-title" className="font-display text-3xl tracking-tight">{latest ? 'Earlier sessions' : 'Your sessions'}</h2><span className="text-sm font-semibold text-[#777466]">{Math.max(0, items.length - (latest ? 1 : 0)).toString().padStart(2, '0')}</span></div>
          {sessions.isLoading ? <p className="flex items-center gap-2 py-9 text-[#696759]"><LoaderCircle className="size-4 animate-spin" /> Loading your sessions…</p> : null}
          {sessions.isError ? <p className="py-9 text-[#9e4739]">Could not load your sessions. <button type="button" onClick={() => void sessions.refetch()} className="underline">Retry</button></p> : null}
          {!sessions.isLoading && !sessions.isError && items.length === 0 ? <div className="flex items-center gap-4 py-10 text-[#777466]"><BookOpen className="size-6" /><p>Your first session will appear here and save as you go.</p></div> : null}
          <ul className="divide-y divide-[#d2cbbb]">{items.slice(latest ? 1 : 0).map((session, index) => <li key={session.id}>
            <button type="button" onClick={() => resume.mutate(session.id)} disabled={resume.isPending} className="group grid min-h-28 w-full grid-cols-[2.5rem_1fr_auto] items-center gap-4 py-6 text-left transition-colors hover:bg-[#eee8dc] sm:grid-cols-[4rem_1fr_11rem_2rem] sm:px-4">
              <span className="text-xs font-bold text-[#a8684a]">{String(index + 2).padStart(2, '0')}</span>
              <span className="min-w-0"><span className="block truncate font-display text-2xl">{session.title}</span><span className="mt-2 block text-sm text-[#777466]">{nextStep(session)} · {session.material_count} {session.material_count === 1 ? 'source' : 'sources'}</span></span>
              <span className="hidden items-center gap-2 text-xs text-[#777466] sm:flex"><Clock3 className="size-4" /> {new Date(session.updated_at).toLocaleDateString()}</span>
              {resume.isPending && resume.variables === session.id ? <LoaderCircle className="size-5 animate-spin" /> : <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />}
            </button>
          </li>)}</ul>
        </section>
      </main>
    </div>
  )
}
