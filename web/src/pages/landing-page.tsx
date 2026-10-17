import { ArrowUpRight } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { Link } from 'react-router-dom'

import { AnimatedFooter } from '../components/ui/animated-footer'
import { Header } from '../components/ui/hero-parallax'
import { useAuthStore } from '../lib/auth-state'

const steps = [
  { number: '01', title: 'Bring Your Material', description: 'Upload a PDF or paste your notes.' },
  { number: '02', title: 'Explain It', description: 'Answer questions in your own words.' },
  { number: '03', title: 'See What Sticks', description: 'Find strengths and gaps worth revisiting.' },
]

export function LandingPage() {
  const reduceMotion = useReducedMotion() ?? false
  const status = useAuthStore((s) => s.status)
  const signOut = useAuthStore((s) => s.signOut)
  const learningPath = status === 'in' ? '/sessions' : '/signin?next=%2Fsessions'

  return (
    <div className="min-h-dvh overflow-x-clip bg-canvas text-ink">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-cream focus:px-4 focus:py-2 focus:text-black">
        Skip to Main Content
      </a>
      <header className="flex h-[88px] items-center justify-between border-b border-line px-6 sm:px-10 lg:px-16 xl:px-24">
        <Link to="/" translate="no" className="font-sans text-2xl font-extrabold tracking-[-0.08em] text-white transition-colors hover:text-accent" aria-label="Orabl home">
          Orabl
        </Link>
        <nav aria-label="Main" className="flex items-center gap-4 sm:gap-7">
          <a href="#how-it-works" className="hidden text-sm font-medium text-ink-muted transition-colors hover:text-white sm:inline">How It Works</a>
          {status === 'in' ? (
            <>
              <Link to="/sessions" className="inline-flex items-center gap-2 text-sm font-semibold text-ink transition-colors hover:text-accent">
                Dashboard <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
              <button
                type="button"
                onClick={() => void signOut()}
                className="hidden text-sm font-medium text-ink-muted transition-colors hover:text-white sm:inline"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link to="/signin" className="text-sm font-semibold text-ink underline decoration-accent decoration-2 underline-offset-[6px] transition-colors hover:text-accent">
              Sign In
            </Link>
          )}
        </nav>
      </header>

      <main id="main-content">
        <Header />

        <section id="how-it-works" className="scroll-mt-8 bg-slate px-6 py-20 text-white sm:px-10 lg:px-16 lg:py-28 xl:px-24" aria-labelledby="how-title">
          <div className="mx-auto max-w-7xl">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-cream">How It Works</p>
            <h2 id="how-title" className="mt-7 max-w-[13ch] font-sans text-[clamp(2.75rem,5vw,5.5rem)] font-bold leading-[1.04] tracking-[-0.065em] text-balance">
              From Notes to Knowing.
            </h2>
            <ol className="mt-14 border-t border-white/30">
              {steps.map((step) => (
                <li key={step.number} className="grid gap-3 border-b border-white/30 py-7 sm:grid-cols-[5rem_minmax(0,0.9fr)_minmax(0,1fr)] sm:items-baseline sm:gap-8 sm:py-9">
                  <span className="tabular text-sm font-bold text-cream">{step.number}</span>
                  <h3 className="text-balance text-xl font-semibold tracking-[-0.035em] sm:text-2xl">{step.title}</h3>
                  <p className="max-w-md text-pretty text-sm leading-6 text-white/90 sm:text-base sm:leading-7">{step.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bg-accent px-6 py-20 text-black sm:px-10 lg:px-16 lg:py-28 xl:px-24" aria-labelledby="cta-title">
          <div className="mx-auto flex max-w-7xl flex-col gap-9 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em]">Your Turn</p>
              <h2 id="cta-title" className="mt-5 max-w-[11ch] font-sans text-[clamp(3rem,6vw,6.5rem)] font-bold leading-[1] tracking-[-0.07em] text-balance">
                Put It Into Words.
              </h2>
            </div>
            <Link to={learningPath} className="inline-flex min-h-12 w-fit items-center gap-5 border-b-2 border-black text-sm font-bold text-black transition-[border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-white focus-visible:outline-black active:translate-y-0">
              {status === 'in' ? 'Go to Dashboard' : 'Start Learning'} <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <div className="h-[350px] border-b border-line bg-black sm:h-[440px]">
        <AnimatedFooter
          headingLines={['Orabl']}
          subtitle="Thoughts become understanding."
          leftImage="/animated-footer/hand-left.jpg"
          rightImage="/animated-footer/hand-right.jpg"
          background="#000000"
          textColor="#ffffff"
          charColor="#9aabc2"
          hoverColor="#f3701e"
          hoverCharColor="#000000"
          columns={56}
          parallaxStrength={reduceMotion ? 0 : 4}
          revealOnScroll={!reduceMotion}
        />
      </div>
    </div>
  )
}
