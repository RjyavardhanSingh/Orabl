import { useReducedMotion } from 'motion/react'

import { AnimatedFooter } from '../components/ui/animated-footer'
import { Header } from '../components/ui/hero-parallax'
import { PublicNav } from '../components/layout/public-nav'
import { HowItWorksInteractive } from '../components/ui/how-it-works-interactive'

// Strict isolationist palette — Crimson Red and Pure White only.
// Opacity variants of these two are the only tints allowed.
const CRIMSON = '#E61E32'
const WHITE = '#FFFFFF'

export function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-white text-[#E61E32]">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-60 focus:bg-white focus:px-4 focus:py-2 focus:text-[#E61E32]">
        Skip to Main Content
      </a>

      {/* Navigation Bar — Fixed to global viewport, floating above everything */}
      <PublicNav />

      {/* Hero card wrapper — adds thin padding for white frame */}
      <div className="flex min-h-screen flex-col p-4 pt-32 md:p-6 md:pt-36">
        {/* Floating editorial card — full viewport, warm off-white canvas */}
        <div className="relative flex flex-1 overflow-hidden rounded-xl border border-zinc-200 bg-[#FDFBF7] shadow-sm">
          {/* Hero — warm off-white. Rail theme vars overridden to crimson/white so the
              marquee is pure crimson-on-white with no other hues. */}
          <div
            className="mx-auto flex w-full max-w-7xl items-center"
            style={
              {
                '--color-ink': CRIMSON,
                '--color-accent': CRIMSON,
                '--color-good': CRIMSON,
                '--color-ink-faint': CRIMSON,
                '--color-canvas': WHITE,
              } as React.CSSProperties
            }
          >
            <Header />
          </div>
        </div>
      </div>

      {/* Main content sections */}
      <main id="main-content">
        {/* How It Works — Interactive scroll-driven experience */}
        <HowItWorksInteractive />
      </main>

      {/* Animated footer — black, edge-to-edge, crimson art that ignites on hover */}
      <footer className="w-full h-87.5 sm:h-110" style={{ backgroundColor: '#000000' }}>
        <AnimatedFooter
          headingLines={['Orabl']}
          subtitle="Focused practice for curious people."
          leftImage="/animated-footer/hand-left.jpg"
          rightImage="/animated-footer/hand-right.jpg"
          background="#000000"
          textColor={CRIMSON}
          charColor={CRIMSON}
          hoverColor={WHITE}
          hoverCharColor={CRIMSON}
          columns={56}
          parallaxStrength={6}
          className="orabl-heading-gradient"
        />
      </footer>
    </div>
  )
}
