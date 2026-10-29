import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useSyncExternalStore } from 'react'

import { cn } from '../../lib/utils'

// The theme is only known after next-themes reads storage; render a stable icon until then.
const subscribeNoop = () => () => {}
function useMounted() {
  return useSyncExternalStore(subscribeNoop, () => true, () => false)
}

/**
 * Square light/dark switch. `tone="ink"` sits on the canvas (navbars), `tone="paper"` sits on a
 * maroon block (the landing hero), where it must read beige in both themes.
 */
export function ThemeToggle({ tone = 'ink', className }: { tone?: 'ink' | 'paper'; className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useMounted()
  const dark = mounted && resolvedTheme === 'dark'
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={label}
      title={label}
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-lg border transition-colors',
        tone === 'ink'
          ? 'border-ink/20 text-ink hover:border-ink hover:bg-ink/5'
          : 'border-paper/30 text-paper hover:border-paper hover:bg-paper/10',
        className,
      )}
    >
      {dark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
    </button>
  )
}
