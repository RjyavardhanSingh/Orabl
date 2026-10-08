import { Link } from 'react-router-dom'

import { AnimatedFooter } from '../components/ui/animated-footer'
import { Header } from '../components/ui/hero-parallax'

export function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-canvas text-ink">
      <header className="mx-auto flex w-full max-w-7xl items-center px-6 py-6 sm:px-10 lg:px-12">
        <Link to="/" className="text-2xl font-extrabold tracking-[-0.06em] text-good" aria-label="Orabl home">
          Orabl
        </Link>
      </header>
      <main id="main-content">
        <div id="how-it-works" className="scroll-mt-16">
          <Header />
        </div>
      </main>

      <div className="font-display relative mt-10 h-[360px] w-full overflow-hidden border-y border-line-strong bg-[#eef1e7] sm:h-[430px]">
        <AnimatedFooter
          headingLines={['Orabl']}
          subtitle="Focused practice for curious people."
          leftImage="/animated-footer/hand-left.jpg"
          rightImage="/animated-footer/hand-right.jpg"
          background="transparent"
          textColor="#1e4d33"
          charColor="#916547"
          columns={56}
          parallaxStrength={6}
          className="orabl-heading-gradient"
        />
      </div>
    </div>
  )
}
