import { BookOpen, Check, FileText, Plus, Target, Trophy, Upload, Sparkles } from 'lucide-react'
import { type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom'

import { useAuthStore } from '../../lib/auth-state'
import { nameFromEmail } from '../../lib/profile'
import { activeStudySessionId, sessionStepPath } from '../../lib/study-session'
import { cn } from '../../lib/utils'
import { ProfileMenu } from './profile-menu'
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
  const user = useAuthStore((s) => s.user)
  const available = unlocked()
  const active = steps.findIndex((step) => location.pathname.endsWith(step.path))
  const id = studyId || activeStudySessionId()

  return <div className="min-h-dvh bg-canvas text-ink">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-3 focus:text-black">Skip to content</a>
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 border-b border-line px-4 py-3 sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-4">
        <Link to="/sessions" className="shrink-0 text-xl font-extrabold tracking-[-0.08em]">Orabl</Link>
        {active >= 0 ? <span className="hidden border-l border-line pl-4 text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint sm:inline">{steps[active].label}</span> : null}
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <Button asChild variant="secondary" size="sm" className="border-line bg-transparent text-ink-muted hover:border-accent hover:text-white"><Link to="/sessions">Dashboard</Link></Button>
        <ProfileMenu displayName={nameFromEmail(user?.email)} email={user?.email} />
      </div>
    </header>
    <main id="main-content" className="min-w-0 pb-[calc(7rem+env(safe-area-inset-bottom))]">{children}</main>
    <nav aria-label="Session steps" className="fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-1/2 z-40 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-full border border-[#55534b] bg-[#24241f]/95 p-1.5 shadow-[0_18px_48px_#0008] backdrop-blur sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom))] sm:gap-1">
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
  return <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3"><div className="min-w-0 max-w-2xl"><h1 className="text-pretty font-display text-[clamp(1.75rem,3.5vw,2.25rem)] leading-tight tracking-[-0.035em] text-ink">{title}</h1>{description ? <p className="text-pretty mt-2 text-sm leading-6 text-ink-muted">{description}</p> : null}</div>{action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}</div>
}

export function LoadingState({ label = 'Loading your workspace…' }: { label?: string }) {
  return <div className="flex items-center justify-center py-10 text-sm text-ink-muted" role="status">{label}</div>
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="flex min-h-[min(36rem,calc(100dvh-12rem))] flex-col items-center justify-center px-6 py-12 text-center">{icon ? <div className="grid size-14 place-items-center rounded-full bg-accent text-black">{icon}</div> : null}<h1 className="text-pretty mt-6 max-w-md font-display text-3xl">{title}</h1><p className="text-pretty mt-3 max-w-sm text-sm leading-6 text-ink-muted">{description}</p>{action ? <div className="mt-6">{action}</div> : null}</div>
}

export function FileTypeIcon() { return <FileText className="size-5" aria-hidden="true" /> }
