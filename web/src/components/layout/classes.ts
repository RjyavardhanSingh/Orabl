import { buttonVariants } from '../ui/button-variants'

/** Width and gutters shared by the navbar and every page body, so their edges line up. */
export const pageContainerClass = 'mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-12'

export const overlineClass = 'font-sans text-xs font-bold uppercase tracking-[0.2em] text-ink/65'

/* ---- Flow step fields and actions (see flow-step.tsx) ---- */
export const ledgerLabelClass = 'mb-2 block font-sans text-[11px] font-bold uppercase tracking-[0.18em] text-ink/65'
// The global :focus-visible outline in index.css is unlayered, so it beats Tailwind's layered
// outline-none; the trailing `!` forces it off here. Focus shows as a solid ink border instead.
export const ledgerFieldClass =
  'w-full rounded-lg border border-ink/25 bg-transparent px-4 py-3 text-sm text-ink shadow-none outline-none ring-offset-0! transition-colors placeholder:text-ink/40 hover:border-ink/45 focus:border-ink focus:bg-ink/[0.03] focus:outline-none focus:ring-0 focus-visible:outline-none! focus-visible:ring-0 aria-[invalid=true]:border-ink'
export const ledgerErrorClass = 'mt-2 text-xs font-bold text-ink'
export const ledgerAlertClass = 'rounded-lg border-ink/30 bg-ink/5 font-medium text-ink'
export const ledgerPrimaryButtonClass = buttonVariants({ size: 'lg' }, 'w-full md:w-auto')
export const ledgerSecondaryButtonClass = buttonVariants({ variant: 'secondary', size: 'lg' }, 'w-full md:w-auto')
export const ledgerBackLinkClass = buttonVariants({ variant: 'ghost' }, 'text-xs uppercase tracking-[0.14em]')
/** The closing row of a step: back on the left, the forward action on the right. */
export const ledgerActionsClass =
  'mt-10 flex w-full flex-col-reverse gap-4 border-t border-line pt-6 md:flex-row md:items-center md:justify-between'
/** A bordered, ruled list (materials, levels, questions). */
export const ledgerListClass = 'divide-y divide-line rounded-lg border border-line'
/** Thin scrollbar for lists that scroll inside a step. */
export const ledgerScrollClass = '[scrollbar-color:var(--color-line-strong)_transparent] [scrollbar-width:thin]'
