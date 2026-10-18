import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, LogOut, Settings2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuthStore } from '../../lib/auth-state'

export function ProfileMenu({ displayName, email }: { displayName: string; email?: string | null }) {
  const navigate = useNavigate()
  const signOut = useAuthStore((state) => state.signOut)

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        type="button"
        aria-label={`Open profile menu for ${displayName}`}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface py-1.5 pl-1.5 pr-3 text-sm font-semibold text-ink transition-colors hover:border-line-strong hover:bg-sunk data-[state=open]:border-accent"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-tint font-bold text-accent-ink" aria-hidden="true">
          {displayName.charAt(0).toUpperCase()}
        </span>
        <span className="hidden max-w-32 truncate sm:inline">{displayName}</span>
        <ChevronDown className="size-3.5 text-ink-muted" aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-60 rounded-xl border border-line-strong bg-surface p-1.5 text-ink shadow-[0_18px_50px_#000b] outline-none"
        >
          <DropdownMenu.Label className="px-3 py-2">
            <span className="block truncate text-sm font-semibold">{displayName}</span>
            <span className="mt-0.5 block truncate text-xs font-normal text-ink-muted">{email ?? 'Your account'}</span>
          </DropdownMenu.Label>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item asChild>
            <Link to="/settings" className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none focus:bg-sunk">
              <Settings2 className="size-4 text-ink-muted" aria-hidden="true" /> Settings
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => void signOut().then(() => navigate('/'), () => navigate('/'))}
            className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none focus:bg-sunk"
          >
            <LogOut className="size-4 text-ink-muted" aria-hidden="true" /> Log out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
