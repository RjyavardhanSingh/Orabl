import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'
import { AppNavbar } from './app-navbar'
import { overlineClass, pageContainerClass } from './classes'

/*
 * Editorial Ledger page kit for every signed-in page. Nothing here is a card: content sits
 * straight on the canvas, and structure comes from type scale and rules: a heavy rule
 * (border-rule) opens a section, hairlines (border-line) separate its rows.
 */

/** A signed-in page: skip link, navbar, then a body that scrolls under the fixed navbar. */
export function AppPage({ children, navActions }: { children: ReactNode; navActions?: ReactNode }) {
  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-canvas text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-on-primary"
      >
        Skip to content
      </a>
      <AppNavbar actions={navActions} />
      <div className="scroll-area flex min-h-0 flex-1 flex-col">
        <main id="main-content" className={cn(pageContainerClass, 'pb-20 pt-10 md:pt-14')}>
          {children}
        </main>
      </div>
    </div>
  )
}

/** Page opener: overline, a large serif title, one line of context, and the page's actions. */
export function PageHeader({
  overline,
  title,
  description,
  actions,
  children,
}: {
  overline?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="mb-10 md:mb-14">
      {overline ? <p className={overlineClass}>{overline}</p> : null}
      <div className="mt-4 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div className="min-w-0 max-w-3xl">
          <h1 className="text-balance font-serif text-5xl italic leading-[1.02] tracking-tight text-ink md:text-6xl lg:text-7xl">
            {title}
          </h1>
          {description ? (
            <p className="text-pretty mt-4 max-w-xl text-base leading-7 text-ink/70">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
      {children}
    </header>
  )
}

/** A titled block: serif heading over a heavy rule, with an optional count or control on the right. */
export function Section({
  title,
  aside,
  id,
  className,
  children,
}: {
  title: ReactNode
  /** Right side of the heading row: a count, a filter, a link. */
  aside?: ReactNode
  id?: string
  className?: string
  children: ReactNode
}) {
  return (
    <section className={cn('min-w-0', className)} aria-labelledby={id}>
      <div className="flex items-end justify-between gap-4 border-b-2 border-rule pb-3">
        <h2 id={id} className="font-serif text-2xl text-ink md:text-3xl">
          {title}
        </h2>
        {aside ? <div className="shrink-0 pb-1">{aside}</div> : null}
      </div>
      {children}
    </section>
  )
}

/** A zero-padded count for a section heading's right side. */
export function SectionCount({ value }: { value: number }) {
  return <span className="tabular font-mono text-sm text-ink/55">{String(value).padStart(2, '0')}</span>
}

/**
 * A row of figures between two rules, divided by hairlines. Replaces the old solid metric
 * cards: the numbers carry the weight, not the boxes around them.
 */
export function StatStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl
      className={cn(
        'grid grid-cols-2 border-y border-line md:grid-cols-4',
        // Hairlines between cells: right edges inside each row, a top edge on the second row (mobile).
        '[&>div]:border-line [&>div:nth-child(odd)]:border-r md:[&>div]:border-r md:[&>div:last-child]:border-r-0',
        '[&>div:nth-child(n+3)]:border-t md:[&>div:nth-child(n+3)]:border-t-0',
        // The first cell of each row starts flush with the page edge.
        '[&>div:nth-child(odd)]:pl-0 md:[&>div:nth-child(odd)]:pl-6 md:[&>div:first-child]:pl-0',
        className,
      )}
    >
      {children}
    </dl>
  )
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-6 md:px-6 md:py-7">
      <dt className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-ink/60">{label}</dt>
      <dd className="tabular mt-3 truncate font-serif text-4xl leading-none text-ink md:text-5xl">{value}</dd>
      {hint ? <p className="mt-2 truncate text-sm text-ink/55">{hint}</p> : null}
    </div>
  )
}

/** Centred status line for loading and transitional states. */
export function StatusScreen({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-6 text-center text-sm text-ink/70" role="status">
      {children}
    </div>
  )
}
