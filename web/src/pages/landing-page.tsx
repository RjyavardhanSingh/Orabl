import { PublicNav } from '../components/layout/public-nav'
import { AnimatedFooter } from '../components/ui/animated-footer'
import { Header } from '../components/ui/hero-parallax'



export function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-canvas text-ink">

      <PublicNav />

      <main id="main-content">
        <div id="how-it-works" className="scroll-mt-16">
          <Header/>
        </div>
      </main>

      <div className="font-pt-serif relative h-[420px] w-full overflow-hidden sm:h-[520px]">
        <AnimatedFooter
          headingLines={['Abhyas']}
          leftImage="/animated-footer/hand-left.jpg"
          rightImage="/animated-footer/hand-right.jpg"
          background="transparent"
          textColor="#1e4d33"
          charColor="#803500"
          className="recall-heading-gradient"
        />
      </div>
      <div className="bg-transparent">
        <div className="mx-auto flex max-w-6xl justify-center px-4 py-6 text-xs text-ink-faint text-center sm:flex-row sm:items-center sm:px-8">
          <span>Focused practice for curious people.</span>
        </div>
      </div>
    </div>
  )
}
