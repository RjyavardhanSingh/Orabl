import {
  BookOpen,
  Check,
  ChevronUp,
  FileText,
  LoaderCircle,
  Lock,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Target,
  Trophy,
  Upload,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation } from 'react-router-dom'

import { useAuthStore } from '../../lib/auth-state'
import { cn } from '../../lib/utils'
import mainLogo from '../../assets/Main-logo-transparent.svg'
import { Button } from '../ui/button'

const steps = [
  { label: 'Upload Material', path: '/upload', icon: Upload },
  { label: 'Set Your Goal', path: '/goal', icon: Target },
  { label: 'Practice', path: '/practice', icon: BookOpen },
  { label: 'Results', path: '/results', icon: Trophy },
] as const

/**
 * Index of the step the current URL belongs to, or -1 for unknown routes so
 * nothing is falsely marked active on a 404.
 */
function useActiveStep() {
  const { pathname } = useLocation()
  return steps.findIndex((step) => pathname.startsWith(step.path))
}

/**
 * Which steps are unlocked, derived from the flow state the pages already
 * persist: material → goal → practice → results. Recomputed every render;
 * Sidebar re-renders on every navigation (useActiveStep), so unlocks apply
 * the moment a step completes. sessionStorage may throw (private mode) —
 * fail closed to Upload-only.
 */
function useUnlockedSteps(): boolean[] {
  useLocation()
  let material = false
  let context = false
  let results = false
  try {
    material = window.sessionStorage.getItem('recall.material') !== null
    const stored = window.sessionStorage.getItem('recall.materials')
    if (stored) {
      const parsed: unknown = JSON.parse(stored)
      material = material || (Array.isArray(parsed) && parsed.length > 0)
    }
    context = window.sessionStorage.getItem('recall.context') !== null
    results = window.sessionStorage.getItem('recall.results') !== null
  } catch {
    // fail closed below
  }
  return [true, material, context, results]
}

function BrandIcon({ className }: { className?: string }) {
  return (
    <img
      src={mainLogo}
      alt=""
      aria-hidden="true"
      className={cn('shrink-0 rounded-xl object-cover', className ?? 'size-9')}
    />
  )
}

function Brand() {
  return (
      <div className='bg-canvas rounded-xl flex items-center justify-center'>
      <BrandIcon className="h-14 w-24" />
      </div>
  )
}

function Sidebar({
  onClose,
  collapsed = false,
  onToggleCollapse,
}: {
  onClose?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}) {
  const activeStep = useActiveStep()
  const unlocked = useUnlockedSteps()
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)

  return (
    <aside
      className={cn(
        'flex h-full w-full flex-col overflow-y-auto overscroll-contain bg-green-900 px-4 py-5 text-white transition-[width] duration-200',
        collapsed ? 'lg:w-[76px] lg:px-3' : 'lg:w-[248px] lg:shrink-0 xl:w-[264px]',
      )}
    >
      <div className={cn('flex items-center gap-2', collapsed ? 'flex-col lg:gap-3' : 'justify-between')}>
        {collapsed ? (
          <div className='bg-canvas rounded-xs'>
            <BrandIcon className="size-10" />
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <Brand />
          </div>
        )}
        {onClose ? (
          <Button
            variant="ghost"
            size="icon"
            className="text-white/60 hover:bg-white/10 hover:text-white focus-visible:ring-white lg:hidden"
            onClick={onClose}
          >
            <X className="size-5" aria-hidden="true" />
            <span className="sr-only">Close Navigation</span>
          </Button>
        ) : onToggleCollapse ? (
          <Button
            variant="ghost"
            size="icon"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={onToggleCollapse}
            className="hidden shrink-0 text-white/60 hover:bg-white/10 hover:text-white focus-visible:ring-white lg:inline-flex"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-5" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="size-5" aria-hidden="true" />
            )}
            <span className="sr-only">{collapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span>
          </Button>
        ) : null}
      </div>

      <nav className="mt-9 w-full flex-1" aria-label="Main">
        <p
          className={cn(
            'mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40',
            collapsed && 'lg:sr-only',
          )}
        >
          Your Journey
        </p>
        <ul className="space-y-1">
          {steps.map((step, index) => {
            const Icon = step.icon
            const isActive = index === activeStep
            const isDone = index < activeStep
            const locked = index > 0 && !unlocked[index]
            if (locked) {
              return (
                <li key={step.path}>
                  <span
                    aria-disabled="true"
                    title={`${step.label} — finish the previous step first`}
                    className={cn(
                      'flex cursor-not-allowed items-center gap-3 rounded-full px-3.5 py-2.5 text-sm text-white/35',
                      collapsed && 'lg:justify-center lg:px-0',
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className={cn('min-w-0 flex-1 truncate', collapsed && 'lg:sr-only')}>
                      {step.label}
                    </span>
                    <Lock className="size-3.5 shrink-0" aria-hidden="true" />
                  </span>
                </li>
              )
            }
            return (
              <li key={step.path}>
                <NavLink
                  to={step.path}
                  onClick={onClose}
                  title={collapsed ? step.label : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={collapsed ? step.label : undefined}
                  className={cn(
                    'group flex items-center gap-3 rounded-full px-3.5 py-2.5 text-sm transition-colors duration-150',
                    isActive
                      ? 'bg-surface text-ink'
                      : 'text-white/55 hover:bg-white/10 hover:text-white',
                    collapsed && 'lg:justify-center lg:px-0',
                  )}
                >
                  {({ isActive: navActive }) => (
                    <>
                      <Icon
                        className="size-4 shrink-0"
                        strokeWidth={navActive || isDone ? 2.5 : 2}
                        aria-hidden="true"
                      />
                      <span className={cn('min-w-0 flex-1 truncate', collapsed && 'lg:sr-only')}>
                        {step.label}
                      </span>
                      {isDone ? (
                        <Check className="size-3.5 shrink-0 text-white/60" strokeWidth={3} aria-hidden="true" />
                      ) : null}
                    </>
                  )}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="mt-8 w-full border-t border-white/10 pt-5">
        <ProfileMenu collapsed={collapsed} email={user?.email ?? null} onSignOut={() => void signOut()} />
      </div>
    </aside>
  )
}

/**
 * Profile block: avatar button opening a small menu with the account email
 * and sign-out. The menu portals to document.body with fixed positioning so
 * it works identically in the expanded rail and the collapsed icon rail
 * (no clipping from the sidebar's scroll container).
 */
function ProfileMenu({
  collapsed,
  email,
  onSignOut,
}: {
  collapsed: boolean
  email: string | null
  onSignOut: () => void
}) {
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const initial = (email?.trim()?.[0] ?? 'Y').toUpperCase()

  // The menu belongs to the route it was opened on: navigating (including
  // sign-out) closes it by derivation — no effect needed.
  const open = openPath !== null && openPath === location.pathname

  // Outside pointer + Escape dismiss.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (
        target &&
        ((buttonRef.current && buttonRef.current.contains(target)) ||
          (menuRef.current && menuRef.current.contains(target)))
      ) {
        return
      }
      setOpenPath(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenPath(null)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open ])

  function toggle() {
    if (open) {
      setOpenPath(null)
      return
    }
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) {
      const width = 248
      setAnchor({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        bottom: window.innerHeight - rect.top + 8,
      })
    }
    setOpenPath(location.pathname)
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={email ?? 'Profile'}
        onClick={toggle}
        className={cn(
          'flex w-full items-center gap-3 rounded-2xl bg-white/5 px-3 py-2.5 text-left transition-colors hover:bg-white/10',
          collapsed && 'lg:justify-center lg:rounded-full lg:px-0',
        )}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold text-white">
          {initial}
        </span>
        <span className={cn('min-w-0 flex-1 truncate text-xs font-medium text-white/80', collapsed && 'lg:sr-only')}>
          {email ?? 'Profile'}
        </span>
        <ChevronUp
          className={cn(
            'size-4 shrink-0 text-white/50 transition-transform duration-150',
            open && 'rotate-180',
            collapsed && 'lg:sr-only',
          )}
          aria-hidden="true"
        />
      </button>
      {open && anchor
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label="Profile"
              className="fixed z-[70] w-60 overflow-hidden rounded-2xl border border-line bg-surface text-ink shadow-xl"
              style={{ left: anchor.left, bottom: anchor.bottom }}
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sunk text-sm font-semibold text-ink">
                  {initial}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-display text-[15px] font-semibold leading-tight">
                    Personal Workspace
                  </p>
                  <p className="truncate text-xs text-ink-muted">{email ?? 'Local session'}</p>
                </div>
              </div>
              <div className="border-t border-line">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpenPath(null)
                    onSignOut()
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-sunk hover:text-ink"
                >
                  <LogOut className="size-4 shrink-0" aria-hidden="true" />
                  Sign out
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

const SIDEBAR_KEY = 'recall.sidebar.collapsed'

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    return false
  }
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)

  function toggleCollapse() {
    setCollapsed((prev) => {
      try {
        window.localStorage.setItem(SIDEBAR_KEY, prev ? '0' : '1')
      } catch {
        // private mode etc. — collapse still works for this session
      }
      return !prev
    })
  }

  // Escape closes the drawer; body scroll is locked while it is open.
  useEffect(() => {
    if (!mobileOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [mobileOpen])

  return (
    <div className="h-dvh overflow-hidden bg-canvas text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to main content
      </a>

      <div className="flex h-dvh">
        <div className="hidden shrink-0 lg:block">
          <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapse} />
        </div>

        {mobileOpen ? (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <button
              type="button"
              aria-label="Close Navigation"
              className="absolute inset-0 bg-ink/50"
              onClick={() => setMobileOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              className="relative h-full w-[288px] max-w-[calc(100vw-3rem)] shadow-2xl"
            >
              <Sidebar onClose={() => setMobileOpen(false)} />
            </div>
          </div>
        ) : null}

        <main id="main-content" className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-line/80 bg-canvas/90 px-4 backdrop-blur sm:px-6 lg:hidden">
            <Brand />
            <Button
              variant="secondary"
              size="icon"
              onClick={() => setMobileOpen(true)}
              aria-expanded={mobileOpen}
              className='bg-transparent border-none'
            >
              <Menu className="size-5 text-ink" aria-hidden="true" />
              <span className="sr-only">Open Navigation</span>
            </Button>
          </header>
          <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        </main>
      </div>
    </div>
  )
}

/**
 * Compact page heading. Deliberately has no "Step N of 6" eyebrow — the
 * sidebar already carries progress, and repeating it added noise.
 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 max-w-2xl">
        <h1 className="text-pretty text-2xl font-semibold tracking-[-0.03em] text-ink sm:text-[28px] sm:leading-tight">
          {title}
        </h1>
        {description ? (
          <p className="text-pretty mt-1.5 text-sm leading-6 text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  )
}

export function LoadingState({ label = 'Loading your workspace…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted" role="status">
      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
      {icon ? (
        <div className="grid size-14 place-items-center rounded-2xl bg-ink text-white">
          {icon}
        </div>
      ) : null}
      <h1 className="text-pretty mt-6 max-w-md text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
        {title}
      </h1>
      <p className="text-pretty mt-3 max-w-sm text-sm leading-6 text-ink-muted">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}

export function FileTypeIcon() {
  return <FileText className="size-5" aria-hidden="true" />
}
