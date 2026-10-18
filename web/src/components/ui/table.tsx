import type { ComponentProps } from 'react'

import { cn } from '../../lib/utils'

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div data-slot="table-container" className="w-full overflow-x-auto">
      <table data-slot="table" className={cn('w-full caption-bottom border-collapse text-left text-sm', className)} {...props} />
    </div>
  )
}

export function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={className} {...props} />
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody data-slot="table-body" className={className} {...props} />
}

export function TableFooter({ className, ...props }: ComponentProps<'tfoot'>) {
  return <tfoot data-slot="table-footer" className={cn('border-t border-line bg-surface font-medium', className)} {...props} />
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return <tr data-slot="table-row" className={cn('border-b border-line transition-colors hover:bg-sunk', className)} {...props} />
}

export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return <th data-slot="table-head" className={cn('py-3 text-left align-middle font-semibold', className)} {...props} />
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td data-slot="table-cell" className={cn('py-3 align-middle', className)} {...props} />
}

export function TableCaption({ className, ...props }: ComponentProps<'caption'>) {
  return <caption data-slot="table-caption" className={cn('text-ink-muted', className)} {...props} />
}
