import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

import { AppNavbar } from '../components/layout/app-navbar'
import { useAuthStore } from '../lib/auth-state'
import { cn } from '../lib/utils'

/* Editorial Ledger: beige canvas, maroon rules and type, no default grays, no pills. */
const overlineClass = 'font-sans text-xs font-bold uppercase tracking-[0.2em] text-[#451017]/70'
const sectionTitleClass = 'border-b-2 border-black pb-3 font-serif text-3xl text-[#451017]'
const rowClass = 'flex items-start gap-4 border-t border-[#451017]/20 py-5'
const labelClass = 'text-xs font-semibold uppercase tracking-[0.14em] text-[#451017]/60'
const valueClass = 'mt-1 break-all text-sm text-black'
const mutedValueClass = 'mt-1 text-sm text-[#451017]/60'
const backLinkClass =
  'inline-flex items-center gap-2 border-b border-[#451017]/20 pb-0.5 text-sm font-semibold text-black transition-colors hover:border-[#451017] hover:text-[#451017]'

export function SettingsPage() {
  const user = useAuthStore((state) => state.user)

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[#EBE5D9] text-[#451017]">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-[#451017] focus:p-3 focus:text-[#EBE5D9]">
        Skip to content
      </a>
      <AppNavbar className="max-w-[80rem] px-[clamp(1.25rem,4vw,4rem)]" />

      <main id="main-content" className="scroll-area mx-auto min-h-0 w-full max-w-[80rem] flex-1 px-[clamp(1.25rem,4vw,4rem)] pb-10 pt-10 sm:pt-14">
        <Link to="/sessions" className={backLinkClass}>
          <ArrowLeft className="size-4" aria-hidden="true" /> Dashboard
        </Link>
        <div className="mt-8 max-w-2xl">
          <p className={overlineClass}>Your account</p>
          <h1 className={cn(sectionTitleClass, 'mt-3 font-serif text-[clamp(1.4rem,2.5vw,1.9rem)] leading-[1.18] tracking-[-0.025em] text-[#451017] border-none pb-0')}>
            Settings
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#451017]/70">Your Orabl account details.</p>

          <section className="mt-10 border-y border-[#451017]/20" aria-labelledby="account-heading">
            <h2 id="account-heading" className="py-5 font-serif text-xl text-[#451017]">
              Account
            </h2>
            <dl>
              <div className={rowClass}>
                <Mail className="mt-0.5 size-5 shrink-0 text-[#451017]/40" aria-hidden="true" />
                <div className="min-w-0">
                  <dt className={labelClass}>Email</dt>
                  <dd className={valueClass}>{user?.email ?? 'No email available'}</dd>
                </div>
              </div>
              <div className={rowClass}>
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#451017]/40" aria-hidden="true" />
                <div>
                  <dt className={labelClass}>Sign-in method</dt>
                  <dd className={mutedValueClass}>Google</dd>
                </div>
              </div>
            </dl>
          </section>
        </div>
      </main>
    </div>
  )
}
