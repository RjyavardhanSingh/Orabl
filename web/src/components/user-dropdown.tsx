import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, LogOut, Settings2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuthStore } from '../lib/auth-state'

/** Focus-ring nuke applied to every interactive element in the dropdown. */
const NUKE_RINGS =
  'outline-none !outline-none focus:outline-none focus:ring-0 !ring-0 focus-visible:outline-none focus-visible:ring-0 !focus-visible:ring-0 focus-within:outline-none focus-within:ring-0 border-none'

/** Shared classes for every menu item row. */
const ITEM_CLASS = [
  'flex w-full items-center gap-3 rounded-sm px-3 py-2.5',
  'font-sans text-xs font-bold uppercase tracking-widest text-[#451017]',
  'transition-colors cursor-pointer',
  'hover:bg-[#451017]/10 hover:text-[#451017]',
  'focus:bg-[#451017]/10 focus:text-[#451017]',
  NUKE_RINGS,
].join(' ')

/**
 * Premium user-profile dropdown used across all dashboard headers.
 *
 * Trigger: monogram tile + flipping chevron, transparent hover.
 * Menu: soft-elevation rounded-sm card, no brutalist shadow.
 * Items: uppercase pill rows with soft maroon-tinted hover.
 */
export function UserDropdown({
  displayName,
  email,
}: {
  displayName: string
  email?: string | null
}) {
  const navigate = useNavigate()
  const signOut = useAuthStore((state) => state.signOut)

  const initial = displayName?.charAt(0).toUpperCase() ?? '?'

  return (
    <DropdownMenu.Root>
      {/* ── Trigger: monogram + flipping chevron ── */}
      <DropdownMenu.Trigger
        type="button"
        aria-label={`Account menu for ${displayName}`}
        className={`group flex items-center gap-2 p-1 rounded-sm bg-transparent hover:bg-[#451017]/5 transition-colors cursor-pointer ${NUKE_RINGS}`}
      >
        <span className="w-9 h-9 flex items-center justify-center bg-[#451017] text-[#EBE5D9] font-serif text-lg rounded-sm shrink-0">
          {initial}
        </span>
        <ChevronDown
          className="w-4 h-4 text-[#451017] opacity-70 transition-transform duration-200 mr-1 group-data-[state=open]:rotate-180"
          aria-hidden="true"
        />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        {/* ── Menu canvas: soft elevation, no brutalist shadow ── */}
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className={`z-50 min-w-[240px] rounded-sm border border-[#451017]/15 bg-[#EBE5D9] p-2 shadow-xl shadow-[#451017]/10 ${NUKE_RINGS}`}
        >
          {/* ── Header: user identity ── */}
          <DropdownMenu.Label className="border-b border-[#451017]/15 pb-3 mb-2">
            <div className="flex items-center gap-3 px-2 pt-1">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-[#451017] font-serif text-lg text-[#EBE5D9]">
                {initial}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-serif text-lg leading-none text-[#451017]">
                  {displayName}
                </span>
                <span className="truncate font-sans text-[10px] uppercase tracking-widest text-[#451017]/60">
                  {email ?? 'Your account'}
                </span>
              </div>
            </div>
          </DropdownMenu.Label>

          {/* ── Menu items ── */}
          <DropdownMenu.Item asChild>
            <Link to="/settings" className={ITEM_CLASS}>
              <Settings2 className="size-4" aria-hidden="true" />
              Account Ledger
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
