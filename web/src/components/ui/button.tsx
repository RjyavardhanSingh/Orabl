import { Slot } from '@radix-ui/react-slot'
import type { ButtonHTMLAttributes } from 'react'

import { buttonVariants, type ButtonVariantProps } from './button-variants'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & ButtonVariantProps & { asChild?: boolean }

export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      className={buttonVariants({ variant, size }, className)}
      // A bare <button> inside a form submits it; make that opt-in.
      type={asChild ? undefined : (type ?? 'button')}
      {...props}
    />
  )
}
