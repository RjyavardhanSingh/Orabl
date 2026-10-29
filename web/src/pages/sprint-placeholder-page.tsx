import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

import { ThemeToggle } from '../components/theme/theme-toggle'
import { pageContainerClass, overlineClass } from '../components/layout/classes'
import { buttonVariants } from '../components/ui/button-variants'
import { cn } from '../lib/utils'

/** Standalone page for dead ends (404): works signed in or out, so it has no profile menu. */
export function SprintPlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <header className="border-b border-line">
        <div className={cn(pageContainerClass, 'flex h-[72px] items-center justify-between')}>
          <Link to="/" className="text-2xl font-extrabold tracking-[-0.08em] text-strong transition-colors hover:text-ink">
            Orabl
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main id="main-content" className={cn(pageContainerClass, 'flex flex-1 flex-col justify-center py-20')}>
        <p className={overlineClass}>Error · 404</p>
        <h1 className="text-balance mt-5 max-w-4xl border-b-2 border-rule pb-8 font-serif text-6xl italic leading-[0.95] tracking-tighter text-ink md:text-8xl">
          {title}
        </h1>
        <div className="mt-8 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <p className="max-w-md text-base leading-7 text-ink/70">{description}</p>
          <div className="flex flex-wrap gap-3">
            <Link to="/" className={buttonVariants({ variant: 'secondary' })}>
              <ArrowLeft aria-hidden="true" /> Home
            </Link>
            <Link to="/sessions" className={buttonVariants()}>
              Go to Dashboard
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
