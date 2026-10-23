import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { useAuthStore } from '../../lib/auth-state'
import { nameFromEmail } from '../../lib/profile'
import { cn } from '../../lib/utils'
import { UserDropdown } from '../user-dropdown'

/**
 * The one navbar for every signed-in page: black wordmark, optional "My Sessions" link,
 * page-specific actions, then the profile menu. The bar spans the window; its contents and
 * bottom rule are constrained by `className` so they line up with each page's own grid.
 */
export function AppNavbar({
  showSessionsLink = true,
  actions,
  className = 'max-w-6xl px-6 md:px-8',
}: {
  /** Off on the sessions page itself, where the link would point at the current page. */
  showSessionsLink?: boolean
  /** Extra controls shown before the profile menu, e.g. the dashboard's Start Session button. */
  actions?: ReactNode
  /** Width and side padding of the inner row; match the page's main content container. */
  className?: string
}) {
  const user = useAuthStore((state) => state.user)

  return (
    <header className="z-50 w-full shrink-0 bg-[#EBE5D9]">
      <div className={cn('mx-auto flex h-20 w-full items-center justify-between gap-4 border-b border-[#451017]/20', className)}>
        <div className="flex min-w-0 items-center gap-5">
          <Link to="/sessions" className="shrink-0 text-2xl font-extrabold tracking-[-0.08em] text-black transition-colors hover:text-[#451017]">
            Orabl
          </Link>
          {showSessionsLink ? (
            <>
              <span className="hidden h-5 w-px bg-[#451017]/20 sm:block" aria-hidden="true" />
              <Link
                to="/sessions"
                className="hidden font-sans text-xs font-bold uppercase tracking-[0.2em] text-black/60 transition-colors hover:text-black sm:block"
              >
                My Sessions
              </Link>
            </>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-4 md:gap-6">
          {actions}
          <UserDropdown displayName={nameFromEmail(user?.email) ?? ''} email={user?.email} />
        </div>
      </div>
    </header>
  )
}
