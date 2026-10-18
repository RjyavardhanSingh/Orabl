import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

import { ProfileMenu } from '../components/layout/profile-menu'
import { useAuthStore } from '../lib/auth-state'
import { nameFromEmail } from '../lib/profile'

export function SettingsPage() {
  const user = useAuthStore((state) => state.user)
  const displayName = nameFromEmail(user?.email)

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-3 focus:text-black">Skip to content</a>
      <header className="mx-auto flex w-full max-w-[80rem] items-center justify-between gap-4 border-b border-line px-[clamp(1.25rem,4vw,4rem)] py-4 sm:py-5">
        <Link to="/sessions" className="text-xl font-extrabold tracking-[-0.08em] hover:opacity-90">Orabl</Link>
        <ProfileMenu displayName={displayName} email={user?.email} />
      </header>

      <main id="main-content" className="mx-auto w-full max-w-[80rem] px-[clamp(1.25rem,4vw,4rem)] pb-20 pt-10 sm:pt-14">
        <Link to="/sessions" className="inline-flex items-center gap-2 text-sm text-ink-muted transition-colors hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden="true" /> Dashboard
        </Link>
        <div className="mt-8 max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Your account</p>
          <h1 className="mt-3 font-display text-4xl tracking-[-0.04em] sm:text-5xl">Settings</h1>
          <p className="mt-3 text-sm leading-6 text-ink-muted">Your Orabl account details.</p>

          <section className="mt-10 border-y border-line" aria-labelledby="account-heading">
            <h2 id="account-heading" className="py-5 font-display text-2xl">Account</h2>
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
