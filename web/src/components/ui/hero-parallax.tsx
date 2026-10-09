import { ClarityRail } from './clarity-rail'

export function Header() {
  return (
    <section className="grid w-full items-center gap-12 px-6 py-20 sm:px-10 lg:grid-cols-2 lg:gap-16 lg:px-16 lg:py-24 xl:px-24">
      {/* Left — strict 50%: static typographic anchor, vertically centered */}
      <div className="flex min-w-75 max-w-md flex-col justify-center">
        <h1 className="font-display text-6xl font-semibold italic leading-[0.95] tracking-tight text-black md:text-7xl lg:text-8xl">
          Know It.
        </h1>
        <p className="mt-8 font-sans text-lg leading-7 text-zinc-800 md:text-xl md:leading-8">
          Practice explaining your own material. Find the gaps, then learn what
          sticks.
        </p>
      </div>

      {/* Right — strict 50%: orbital marquee, massive focal point */}
      <div className="flex min-w-112.5 items-center justify-center overflow-visible p-6 pt-8 sm:min-w-125 sm:p-12 lg:pt-0">
        <div className="h-100 w-100 origin-center scale-125 overflow-visible sm:h-112.5 sm:w-112.5 sm:scale-150">
          <ClarityRail />
        </div>
      </div>
    </section>
  )
}
