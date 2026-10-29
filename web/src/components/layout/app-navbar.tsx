import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'

import { useAuthStore } from '../../lib/auth-state'
import { displayName } from '../../lib/profile'
import { cn } from '../../lib/utils'
import { ThemeToggle } from '../theme/theme-toggle'
import { UserDropdown } from '../user-dropdown'
import { pageContainerClass } from './classes'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'relative py-2 font-sans text-xs font-bold uppercase tracking-[0.2em] transition-colors',
    // The active page is underlined by the navbar's own rule, like a ledger tab.
    isActive ? 'text-ink after:absolute after:inset-x-0 after:-bottom-[21px] after:h-0.5 after:bg-rule' : 'text-ink/55 hover:text-ink',
  )

/**
 * The one navbar for every signed-in page: wordmark, the Dashboard link, page-specific actions,
 * the theme switch and the profile menu (which holds Settings and Log Out). Its row shares the page container, so the
 * wordmark lines up with every page's left edge.
 */
export function AppNavbar({
  actions,
  className,
}: {
  /** Extra controls shown before the theme switch, e.g. a page's main action. */
  actions?: ReactNode
  className?: string
}) {
  const user = useAuthStore((state) => state.user)

  return (
    <header className="z-50 w-full shrink-0 border-b border-line bg-canvas">
      <div className={cn(pageContainerClass, 'flex h-[72px] items-center justify-between gap-4', className)}>
        <div className="flex min-w-0 items-center gap-6 md:gap-8">
          <Link to="/sessions" className="shrink-0 text-2xl font-extrabold tracking-[-0.08em] text-strong transition-colors hover:text-ink">
            Orabl
          </Link>
          <span className="hidden h-5 w-px bg-line sm:block" aria-hidden="true" />
          <nav aria-label="App" className="hidden items-center gap-6 sm:flex">
            <NavLink to="/sessions" end className={navLinkClass}>
              Dashboard
            </NavLink>
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-3 md:gap-4">
          {actions}
          <ThemeToggle />
          <UserDropdown displayName={displayName(user)} email={user?.email} picture={user?.picture} />
        </div>
      </div>
    </header>
  )
}
