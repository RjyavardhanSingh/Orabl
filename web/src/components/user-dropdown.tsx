import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, LogOut, Settings2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuthStore } from '../lib/auth-state'
import { UserAvatar } from './user-avatar'

/** Focus-ring nuke applied to every interactive element in the dropdown. */
const NUKE_RINGS =
  'outline-none !outline-none focus:outline-none focus:ring-0 !ring-0 focus-visible:outline-none focus-visible:ring-0 !focus-visible:ring-0 focus-within:outline-none focus-within:ring-0 border-none'

/** Shared classes for every menu item row. */
const ITEM_CLASS = [
  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5',
  'font-sans text-xs font-bold uppercase tracking-widest text-ink',
  'transition-colors cursor-pointer',
  'hover:bg-ink/10 hover:text-ink',
  'focus:bg-ink/10 focus:text-ink',
  NUKE_RINGS,
].join(' ')

/**
 * Premium user-profile dropdown used across all dashboard headers.
 *
 * Trigger: Google photo (or monogram) tile + flipping chevron, transparent hover.
 * Menu: soft-elevation rounded-lg card, no brutalist shadow.
 * Items: uppercase pill rows with soft maroon-tinted hover.
 */
export function UserDropdown({
  displayName,
  email,
  picture,
}: {
  displayName: string
  email?: string | null
  /** Google profile photo; the initial shows when absent. */
  picture?: string | null
}) {
  const navigate = useNavigate()
  const signOut = useAuthStore((state) => state.signOut)

  return (
    <DropdownMenu.Root>
      {/* ── Trigger: monogram + flipping chevron ── */}
      <DropdownMenu.Trigger
        type="button"
        aria-label={`Account menu for ${displayName}`}
        className={`group flex items-center gap-2 p-1 rounded-lg bg-transparent hover:bg-ink/5 transition-colors cursor-pointer ${NUKE_RINGS}`}
      >
        <UserAvatar name={displayName} picture={picture} />
        <ChevronDown
          className="w-4 h-4 text-ink opacity-70 transition-transform duration-200 mr-1 group-data-[state=open]:rotate-180"
          aria-hidden="true"
        />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        {/* ── Menu canvas: soft elevation, no brutalist shadow ── */}
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className={`z-50 min-w-[240px] rounded-lg border border-line bg-canvas p-2 shadow-xl shadow-black/15 ${NUKE_RINGS}`}
        >
          {/* ── Header: user identity ── */}
          <DropdownMenu.Label className="border-b border-line pb-3 mb-2">
            <div className="flex items-center gap-3 px-2 pt-1">
              <UserAvatar name={displayName} picture={picture} className="size-11" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-serif text-lg leading-none text-ink">
                  {displayName}
                </span>
                <span className="truncate font-sans text-xs text-ink/60">
                  {email ?? 'Your account'}
                </span>
              </div>
            </div>
          </DropdownMenu.Label>

          {/* ── Menu items ── */}
          <DropdownMenu.Item asChild>
            <Link to="/settings" className={ITEM_CLASS}>
              <Settings2 className="size-4" aria-hidden="true" />
              Settings
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Item
            onSelect={() =>
              void signOut().then(
                () => navigate('/'),
                () => navigate('/'),
              )
            }
            className={ITEM_CLASS}
          >
            <LogOut className="size-4" aria-hidden="true" />
            Log Out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
