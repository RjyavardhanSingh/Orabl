import { ThemeProvider } from 'next-themes'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.tsx'
import { ThemedToaster } from './components/theme/themed-toaster'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* `.dark` on <html>; follows the OS until the person picks a theme. */}
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <App />
      <ThemedToaster />
    </ThemeProvider>
  </StrictMode>,
)
