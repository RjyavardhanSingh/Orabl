import { useTheme } from 'next-themes'
import { Toaster } from 'sonner'

/** Toasts follow the app theme. */
export function ThemedToaster() {
  const { resolvedTheme } = useTheme()
  return (
    <Toaster
      position="bottom-right"
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      toastOptions={{ classNames: { toast: 'font-sans rounded-lg!' } }}
    />
  )
}
