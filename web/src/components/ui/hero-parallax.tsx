import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { ClarityRail } from './clarity-rail'

const steps = ['Bring your material', 'Practice out loud', 'See what to fix']

export function Header() {
  return (
    <section className="relative mx-auto w-full max-w-7xl px-6 pb-12 pt-12 sm:px-10 lg:px-12 lg:pb-16 lg:pt-8">
      <div aria-hidden="true" className="orabl-hero-texture pointer-events-none absolute inset-0" />
      <div className="relative grid items-center gap-8 lg:min-h-[590px] lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] lg:gap-12">
        <div className="relative z-10 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-faint">
            Learn out loud
          </p>
          <h1 className="mt-6 max-w-[680px] text-balance text-[clamp(3rem,4.2vw,4.4rem)] leading-[1.1] tracking-[-0.045em]">
            Turn what you study into what you <span className="text-good">remember.</span>
          </h1>
          <p className="mt-7 max-w-xl text-base leading-[1.7] text-ink-muted sm:text-lg">
            Bring your material and a goal. Practice answering out loud, then
            get a clear report on what you know and what to fix.
          </p>
          <div className="mt-9">
            <Link
              to="/upload"
              className="group inline-flex min-h-14 items-center justify-center gap-5 rounded-full bg-good px-7 text-base font-semibold text-white shadow-[0_8px_22px_rgba(46,106,78,0.16)] transition-[background-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:bg-[#245b41] hover:shadow-[0_12px_26px_rgba(46,106,78,0.2)] active:translate-y-0 active:shadow-none"
            >
              Start a Session
              <ArrowRight aria-hidden="true" className="size-5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[570px] lg:max-w-none">
          <ClarityRail />
        </div>
      </div>

      <div className="relative mt-6 grid gap-4 border-t border-line-strong pt-6 sm:grid-cols-3 lg:mt-2">
        {steps.map((step, index) => (
          <div key={step} className="flex items-baseline gap-3">
            <span className="text-xs font-semibold tabular text-good">0{index + 1}</span>
            <span className="text-sm font-medium text-ink-soft">{step}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
