import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'
import { overlineClass } from './classes'

/*
 * Editorial Ledger step: no card around it. The step opens with an overline, a large serif
 * title and a heavy rule; fields and lists sit straight on the canvas; the actions close it
 * over a hairline. Every colour is a theme role, so the flow follows light and dark mode.
 */
export function FlowStep({
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
  /** Smaller title, for dense forms. */
  compact?: boolean
  children?: ReactNode
}) {
  return (
    <div className="w-full pb-12">
      <header className={cn('border-b-2 border-rule', compact ? 'mb-7 pb-5' : 'mb-9 pb-7')}>
        <p className={overlineClass}>
          Step {String(step).padStart(2, '0')} / 05 · {label}
        </p>
        <h1
          className={cn(
            'text-balance mt-4 font-serif italic leading-[1.05] tracking-tight text-ink',
            compact ? 'text-4xl md:text-5xl' : 'text-4xl md:text-5xl lg:text-6xl',
          )}
        >
          {title}
        </h1>
        <p className="text-pretty mt-3 max-w-xl text-base leading-7 text-ink/70">{description}</p>
      </header>
      {children}
    </div>
  )
}
