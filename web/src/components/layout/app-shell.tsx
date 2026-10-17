import { BookOpen, Check, FileText, LogOut, Plus, Target, Trophy, Upload, Sparkles } from 'lucide-react'
import { type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate, useParams } from 'react-router-dom'

import { useAuthStore } from '../../lib/auth-state'
import { activeStudySessionId, sessionStepPath } from '../../lib/study-session'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'

const steps = [
  { path: '/upload', label: 'Material', icon: Upload },
  { path: '/goal', label: 'Goal', icon: Target },
  { path: '/preparing', label: 'Prepare', icon: Sparkles },
  { path: '/practice', label: 'Practice', icon: BookOpen },
  { path: '/results', label: 'Results', icon: Trophy },
]

function unlocked(): boolean[] {
  try {
    const materials = JSON.parse(window.sessionStorage.getItem('recall.materials') || '[]') as unknown[]
    const context = !!window.sessionStorage.getItem('recall.context')
    const practice = !!window.sessionStorage.getItem('recall.session')
    return [true, materials.length > 0, context, practice, !!window.sessionStorage.getItem('recall.results')]
  } catch { return [true, false, false, false, false] }
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { studyId } = useParams()
  const signOut = useAuthStore((s) => s.signOut)
  const available = unlocked()
  const active = steps.findIndex((step) => location.pathname.endsWith(step.path))
  const id = studyId || activeStudySessionId()

  return <div className="flex h-dvh flex-col overflow-hidden bg-canvas text-ink">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-3 focus:text-black">Skip to content</a>
    <header className="flex shrink-0 items-center justify-between gap-4 px-5 py-4 sm:px-9">
      <button type="button" onClick={() => navigate('/sessions')} className="text-xl font-extrabold tracking-[-0.08em]">Orabl<span className="text-accent">.</span></button>
      <div className="flex items-center gap-3">
        {id ? <span className="hidden text-xs font-medium text-ink-faint sm:inline">Session {id.slice(0, 8)}</span> : null}
        <Button type="button" variant="secondary" size="sm" onClick={() => navigate('/sessions')} className="border-line bg-transparent text-ink-muted hover:border-accent hover:text-white">Dashboard</Button>
        <Button type="button" variant="ghost" size="icon" onClick={() => void signOut().then(() => navigate('/'))} aria-label="Sign out"><LogOut className="size-4" /></Button>
      </div>
    </header>
    <main id="main-content" className="min-h-0 flex-1 overflow-hidden pb-22">{children}</main>
    <nav aria-label="Session steps" className="fixed bottom-3 left-1/2 z-40 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-full border border-[#55534b] bg-[#24241f]/95 p-1.5 shadow-[0_18px_48px_#0008] backdrop-blur sm:bottom-6 sm:gap-1">
      <button type="button" onClick={() => navigate('/sessions')} title="Dashboard" aria-label="Dashboard" className="grid size-10 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-white/10"><Plus className="size-4" /></button>
      <span className="mx-0.5 h-5 w-px shrink-0 bg-white/15" aria-hidden="true" />
      {steps.map((step, index) => {
        const Icon = step.icon
        return available[index] ? <NavLink key={step.path} to={sessionStepPath(step.path.slice(1) as 'upload' | 'goal' | 'preparing' | 'practice' | 'results', id)} aria-current={active === index ? 'page' : undefined} className={cn('flex h-10 shrink-0 items-center gap-2 rounded-full px-3 text-xs font-semibold transition-colors sm:px-4', active === index ? 'bg-accent text-black' : 'text-ink-muted hover:bg-white/10 hover:text-white')}>
          {index < active ? <Check className="size-4" /> : <Icon className="size-4" />}<span className={cn(active !== index && 'hidden sm:inline')}>{step.label}</span>
        </NavLink> : <span key={step.path} aria-label={`${step.label} locked`} title={`Complete the previous step to unlock ${step.label}`} className="grid size-10 shrink-0 place-items-center text-white/30"><Icon className="size-4" /></span>
      })}
    </nav>
  </div>
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3"><div className="min-w-0 max-w-2xl"><h1 className="text-pretty font-display text-3xl tracking-[-0.04em] text-ink sm:text-4xl">{title}</h1>{description ? <p className="text-pretty mt-2 text-sm leading-6 text-ink-muted">{description}</p> : null}</div>{action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}</div>
}

export function LoadingState({ label = 'Loading your workspace…' }: { label?: string }) {
  return <div className="flex items-center justify-center py-10 text-sm text-ink-muted" role="status">{label}</div>
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">{icon ? <div className="grid size-14 place-items-center rounded-full bg-accent text-black">{icon}</div> : null}<h1 className="text-pretty mt-6 max-w-md font-display text-3xl">{title}</h1><p className="text-pretty mt-3 max-w-sm text-sm leading-6 text-ink-muted">{description}</p>{action ? <div className="mt-6">{action}</div> : null}</div>
}

export function FileTypeIcon() { return <FileText className="size-5" aria-hidden="true" /> }
