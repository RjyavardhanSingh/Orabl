import { ClarityRail } from './clarity-rail'

export function Header() {
  return (
    <section className="mx-auto grid min-h-[610px] max-w-7xl items-center gap-12 px-6 py-20 sm:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:gap-16 lg:px-16 lg:py-24 xl:px-24">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent">Orabl / Learn Out Loud</p>
        <h1 className="mt-8 max-w-[12ch] font-sans text-[clamp(3.15rem,6.6vw,7rem)] font-bold leading-[1] tracking-[-0.075em] text-balance">
          Learn It.<br />Say It.<br /><span className="text-cream">Know It.</span>
        </h1>
        <p className="mt-8 max-w-md text-pretty text-base leading-7 text-ink-muted sm:text-lg sm:leading-8">
          Practice explaining your own material. Find the gaps, then learn what sticks.
        </p>
      </div>

      <div className="min-w-0 border-t border-line pt-8 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0">
        <div className="flex items-center justify-between gap-4 text-[11px] font-bold uppercase tracking-[0.2em] text-ink-muted">
          <span>Thought → Understanding</span>
          <span className="text-accent">01 / 03</span>
        </div>
        <ClarityRail />
      </div>
    </section>
  )
}
