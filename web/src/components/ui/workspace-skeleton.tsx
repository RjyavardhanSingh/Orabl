import { cn } from '../../lib/utils'

/**
 * Neutral skeleton primitives + full-page workspace skeleton for the
 * post-auth transition (callback → app). Mirrors the real AppShell +
 * upload destination structurally (same containers, widths, radii) so
 * content swaps in with (almost) no layout shift.
 *
 * Notes:
 * - Blocks are shapes only — never fake text or user data.
 * - `motion-safe:animate-pulse` + the global prefers-reduced-motion rule
 *   in index.css keep this static when the OS asks for less motion.
 * - The app uses a dark color scheme throughout.
 */

function Bar({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('motion-safe:animate-pulse rounded-md bg-line', className)}
    />
  )
}

function SidebarSkeleton() {
  return (
    <aside className="flex h-full w-full flex-col overflow-hidden bg-surface px-4 py-5 text-ink lg:w-[248px] lg:shrink-0 xl:w-[264px]">
      {/* brand row: logo mark only */}
      <div className="flex items-center">
        <div aria-hidden="true" className="motion-safe:animate-pulse h-14 w-32 rounded-xl bg-ink/10" />
      </div>

      {/* step nav: label + 4 pills */}
      <div className="mt-9 flex-1">
        <div aria-hidden="true" className="motion-safe:animate-pulse mb-3 ml-3 h-2.5 w-24 rounded-md bg-ink/10" />
        <ul className="space-y-1">
          {[0, 1, 2, 3].map((index) => (
            <li
              key={index}
              aria-hidden="true"
              className={cn(
                'motion-safe:animate-pulse flex items-center gap-3 rounded-full px-3.5 py-2.5',
                index === 0 ? 'bg-surface' : 'bg-ink/5',
              )}
            >
              <span className={cn('size-4 shrink-0 rounded-md', index === 0 ? 'bg-line' : 'bg-ink/10')} />
              <span className={cn('h-3.5 flex-1 rounded-md', index === 0 ? 'bg-line' : 'bg-ink/10')} />
            </li>
          ))}
        </ul>
      </div>

      {/* footer: profile block */}
      <div className="mt-8 border-t border-ink/10 pt-5">
        <div aria-hidden="true" className="motion-safe:animate-pulse flex items-center gap-3 rounded-2xl bg-ink/5 px-3 py-2.5">
          <span className="size-8 shrink-0 rounded-full bg-ink/10" />
          <span className="h-3.5 flex-1 rounded-md bg-ink/10" />
          <span className="size-4 rounded-md bg-ink/10" />
        </div>
      </div>
    </aside>
  )
}

function UploadContentSkeleton() {
  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-4 pb-5 pt-5 sm:px-6 sm:pt-6 lg:px-8">
      {/* PageHeader: title + description */}
      <div className="max-w-2xl space-y-2">
        <Bar className="h-7 w-3/4 rounded-lg sm:h-8" />
        <Bar className="h-4 w-full" />
        <Bar className="h-4 w-2/3" />
      </div>

      {/* Card: segmented mode control + form */}
      <div className="mt-5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-[0_12px_30px_rgba(22,20,27,0.12)]">
        <div aria-hidden="true" className="grid shrink-0 grid-cols-2 gap-1 rounded-full bg-sunk p-1">
          <span className="motion-safe:animate-pulse rounded-full bg-surface px-4 py-2 shadow-sm">
            <span className="mx-auto block h-4 w-16 rounded-md bg-line" />
          </span>
          <span className="px-4 py-2">
            <span className="mx-auto block h-4 w-16 rounded-md bg-line/70" />
          </span>
        </div>

        <div className="mt-5 space-y-2">
          <Bar className="h-3.5 w-24" />
          <Bar className="h-10 w-full rounded-xl border border-line bg-surface" />
        </div>

        <div className="mt-5 min-h-0 flex-1 space-y-2">
          <Bar className="h-3.5 w-20" />
          <div
            aria-hidden="true"
            className="motion-safe:animate-pulse min-h-40 flex-1 rounded-xl bg-sunk"
          />
        </div>

        <Bar className="mt-5 h-11 w-full shrink-0 rounded-xl bg-ink/70 sm:w-48" />
      </div>
    </div>
  )
}

export function WorkspaceSkeleton() {
  return (
    <div className="h-dvh overflow-hidden bg-canvas text-ink" role="status" aria-label="Loading your workspace">
      <div className="flex h-dvh">
        <div className="hidden lg:block" aria-hidden="true">
          <SidebarSkeleton />
        </div>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* mobile header (lg:hidden in the real shell) */}
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-line/80 bg-canvas/90 px-4 sm:px-6 lg:hidden" aria-hidden="true">
            <div className="motion-safe:animate-pulse flex items-center gap-3">
              <span className="size-9 rounded-xl bg-line" />
              <span className="h-4 w-16 rounded-md bg-line" />
            </div>
            <span className="motion-safe:animate-pulse size-10 rounded-xl bg-line" />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden" aria-hidden="true">
            <UploadContentSkeleton />
          </div>
        </main>
      </div>
    </div>
  )
}
