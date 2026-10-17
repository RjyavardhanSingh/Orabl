import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { ClarityRail } from './clarity-rail'
import { useAuthStore } from '../../lib/auth-state'

export function Header() {
  const status = useAuthStore((s) => s.status)
  const learningPath = status === 'in' ? '/sessions' : '/signin?next=%2Fsessions'

  return (
    <section className="mx-auto grid min-h-[610px] max-w-7xl items-center gap-12 px-6 py-20 sm:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:gap-16 lg:px-16 lg:py-24 xl:px-24">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent">Orabl / Learn Out Loud</p>
        <h1 className="mt-8 max-w-[12ch] font-sans text-[clamp(3.15rem,6.6vw,7rem)] font-bold leading-[1] tracking-[-0.075em] text-balance">
          Learn It.<br />Say It.<br /><span className="text-cream">Prove It.</span>
        </h1>
        <p className="mt-8 max-w-md text-pretty text-base leading-7 text-ink-muted sm:text-lg sm:leading-8">
          Practice explaining your own material. Find the gaps, then learn what sticks.
        </p>
        <Link
          to={learningPath}
          className="mt-10 inline-flex items-center gap-2 text-sm font-bold text-accent underline decoration-accent decoration-2 underline-offset-[6px] transition-colors hover:text-accent-hover hover:decoration-accent-hover"
        >
          {status === 'in' ? 'Go to Dashboard' : 'Start Learning'}
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="min-w-0 border-t border-line pt-8 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0">
        <div className="mx-auto w-full max-w-[560px]">
          <ClarityRail />
        </div>
      </div>
    </section>
  )
}
