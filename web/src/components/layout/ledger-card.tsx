import type { ReactNode } from 'react'

/* Editorial Ledger card: beige on maroon, structural borders, no rings, no pills. */
export const ledgerLabelClass = 'mb-2 block font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-[#EBE5D9]/70'
// Thin editorial field. The global :focus-visible outline in index.css is unlayered, so it beats
// Tailwind's layered outline-none; the trailing `!` forces it off here. The border is already solid
// beige, so focus shows as a faint beige fill.
export const ledgerFieldClass =
  'w-full rounded-sm border border-[#EBE5D9] bg-transparent px-4 py-2 text-sm text-[#EBE5D9] shadow-none outline-none ring-offset-0! transition-colors placeholder:text-[#EBE5D9]/40 focus:bg-[#EBE5D9]/5 focus:outline-none focus:ring-0 focus-visible:outline-none! focus-visible:ring-0'
export const ledgerErrorClass = 'mt-2 text-xs font-bold text-[#EBE5D9]'
export const ledgerAlertClass = 'border-[#EBE5D9]/40 bg-[#EBE5D9]/10 font-medium text-[#EBE5D9]'
const buttonBase =
  'inline-flex w-full items-center justify-center gap-2 rounded-sm px-8 py-4 font-sans text-sm font-bold uppercase tracking-widest transition-colors disabled:pointer-events-none disabled:opacity-50 md:w-auto'
// Hover deepens the beige by letting the maroon card show through, rather than flipping to black.
export const ledgerPrimaryButtonClass = `${buttonBase} bg-[#EBE5D9] text-[#451017] hover:bg-[#EBE5D9]/80`
export const ledgerSecondaryButtonClass = `${buttonBase} border-2 border-[#EBE5D9]/30 bg-transparent text-[#EBE5D9] hover:border-[#EBE5D9]`
export const ledgerBackLinkClass =
  'inline-flex items-center gap-2 font-sans text-xs font-bold uppercase tracking-widest text-[#EBE5D9]/60 transition-colors hover:text-[#EBE5D9]'

export function LedgerCard({
  step,
  label,
  title,
  description,
  compact = false,
  children,
}: {
  step: number
  label: string
  title: string
  description: string
  /** Smaller title and header gap, for dense forms that must fit one screen. */
  compact?: boolean
  children?: ReactNode
}) {
  return (
    // Focus outlines inside the maroon card read in beige.
    <div className="w-full rounded-sm border border-[#451017] bg-[#451017] p-6 text-[#EBE5D9] shadow-2xl shadow-[#451017]/20 [--color-accent:#EBE5D9] md:px-8 md:py-6">
      <div className={compact ? 'mb-5' : 'mb-8 md:mb-10'}>
        <p className="mb-4 font-sans text-xs font-bold uppercase tracking-[0.2em] text-[#EBE5D9]/70">
          Step {String(step).padStart(2, '0')}/05 · {label}
        </p>
        <h1
          className={
            compact
              ? 'mb-2 font-serif text-3xl italic leading-tight text-[#EBE5D9] md:text-4xl'
              : 'mb-4 font-serif text-4xl italic leading-tight text-[#EBE5D9] md:text-5xl'
          }
        >
          {title}
        </h1>
        <p className="max-w-xl text-sm leading-6 text-[#EBE5D9]/70">{description}</p>
      </div>
      {children}
    </div>
  )
}
