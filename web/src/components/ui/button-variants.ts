import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../../lib/utils'

/**
 * The one button for the whole app. Every action, on every page, takes its shape from here so
 * buttons read as one family: same radius, same type, same height per size. Use
 * `buttonVariants()` directly to style a <Link> without wrapping it.
 */
const variants = cva(
  // transition-colors (never transition-all): only paint animates.
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-sans font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        /** The main action of a page or step. Maroon on beige (beige on dark), deepening on hover. */
        primary: 'bg-primary text-on-primary hover:bg-primary-hover',
        /** A second, lesser action beside a primary one. */
        secondary: 'border border-ink/30 bg-transparent text-ink hover:border-ink hover:bg-ink/5',
        /** Quiet text action: Back, Skip, Retry. A rule under it, no box. */
        ghost: 'rounded-none border-b border-ink/25 px-0! text-ink/75 hover:border-ink hover:text-ink',
        /** Beige on a maroon block (landing hero, CTA), whatever the theme. */
        inverse: 'bg-paper text-maroon hover:bg-white',
        /** Outline on a maroon block, beside an inverse button. */
        'inverse-outline': 'border border-paper/35 bg-transparent text-paper hover:border-paper hover:bg-paper/10',
      },
      size: {
        sm: 'h-9 px-4 text-xs',
        default: 'h-11 px-5 text-sm',
        lg: 'h-13 px-7 text-base [&_svg]:size-5',
      },
    },
    compoundVariants: [{ variant: 'ghost', className: 'h-auto pb-0.5' }],
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
)

export type ButtonVariantProps = VariantProps<typeof variants>

/** Button classes, merged so a size's height never fights the ghost variant's `h-auto`. */
export function buttonVariants(props?: ButtonVariantProps, className?: string): string {
  return cn(variants(props), className)
}
