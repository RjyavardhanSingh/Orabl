import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

import { AppNavbar } from '../components/layout/app-navbar'
import { useAuthStore } from '../lib/auth-state'

export function SettingsPage() {
  const user = useAuthStore((state) => state.user)

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-canvas text-ink">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-3 focus:text-black">Skip to content</a>
      <AppNavbar className="max-w-[80rem] px-[clamp(1.25rem,4vw,4rem)]" />

      <main id="main-content" className="scroll-area mx-auto min-h-0 w-full max-w-[80rem] flex-1 px-[clamp(1.25rem,4vw,4rem)] pb-10 pt-10 sm:pt-14">
        <Link to="/sessions" className="inline-flex items-center gap-2 text-sm text-ink-muted transition-colors hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden="true" /> Dashboard
        </Link>
        <div className="mt-8 max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Your account</p>
          <h1 className="mt-3 font-display text-2xl tracking-[-0.03em] sm:text-[1.8rem]">Settings</h1>
          <p className="mt-3 text-sm leading-6 text-ink-muted">Your Orabl account details.</p>

          <section className="mt-10 border-y border-line" aria-labelledby="account-heading">
            <h2 id="account-heading" className="py-5 font-display text-xl">Account</h2>
            <dl>
              <div className="flex items-start gap-4 border-t border-line py-5">
                <Mail className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden="true" />
                <div className="min-w-0">
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">Email</dt>
                  <dd className="mt-1 break-all text-sm text-ink">{user?.email ?? 'No email available'}</dd>
                </div>
              </div>
              <div className="flex items-start gap-4 border-t border-line py-5">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden="true" />
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">Sign-in method</dt>
                  <dd className="mt-1 text-sm text-ink">Google</dd>
                </div>
              </div>
            </dl>
          </section>
        </div>
      </main>
    </div>
  )
}
