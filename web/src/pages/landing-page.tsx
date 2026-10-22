import { ArrowUpRight } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { Link } from "react-router-dom";

import { AnimatedFooter } from "../components/ui/animated-footer";
import { ClarityRail } from "../components/ui/clarity-rail";
import { HowItWorksScroll } from "../components/ui/how-it-works-scroll";
import { useAuthStore } from "../lib/auth-state";

// Ghost watermark for the CTA: a braille-dot brain. Every row is the same
// width and blanks are the braille blank (U+2800), not spaces, so rows can't
// collapse or ragged-align under text-right — the drawing stays intact.
const BRAIN_ASCII = [
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣠⠤⠤⠤⠤⣄⠀⠀⠀⠀⠀⠀⢀⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣶⡊⠉⠉⣉⣱⡷⠶⢢⣠⢴⣶⡝⠒⠉⢉⣭⡽⠟⢉⣀⡀⠹⢭⠒⢤⣀⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡠⠔⢚⣩⡽⠿⠊⢉⣉⡂⣀⣩⠭⢴⠟⠋⠉⠉⠉⠛⠳⢦⣬⣤⡴⠞⠛⠁⠛⠳⣾⣧⠀⠟⠀⠉⠲⢄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡠⢚⠁⠀⠰⠋⢡⠄⠀⠞⣫⢟⡥⠒⠉⠹⣿⡀⠀⠀⢦⡀⠀⠀⠀⠈⠻⡧⡀⠀⠀⠀⠀⠈⠻⣗⡶⠶⠶⢤⡀⠱⣄⡀⠀⠀⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢮⣤⡾⠀⠀⣠⡴⠋⠀⡠⣚⠥⠒⢛⡲⠄⠀⠈⢻⡆⠀⠀⠻⣦⣀⠀⠀⠀⣿⠻⣦⣀⣴⠶⠂⠀⠘⣷⡄⠀⠀⢀⣴⡿⠈⠢⡀⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⡠⠖⣉⣁⡀⠀⢀⣾⠋⠴⢿⣽⠋⠀⠞⢉⣉⣽⣳⣄⣀⠀⠋⠀⠀⠀⠈⠙⣷⡄⠀⠁⠀⠙⢤⣯⡀⠀⠀⠀⣼⡇⠀⡾⠋⠁⠀⠳⣄⠘⢆⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⡰⠋⠰⠛⢻⡞⢉⣠⣼⡇⢀⣴⠟⠛⠒⣴⠟⠋⠉⠀⠀⢀⣀⣀⡀⠀⠀⠀⠀⠀⣸⡇⠀⠀⠳⣄⠀⠉⢿⣄⠀⢰⣿⣧⡀⠀⣴⠶⠶⣦⡼⢧⠈⢣⠀⠀⠀⠀",
  "⠀⠀⠀⢀⡞⣡⣶⡄⠀⡟⣳⠿⠋⠙⡍⡽⠁⣀⣤⣤⣿⡄⠀⠀⠀⠀⡿⡉⣀⣀⣤⣤⣤⣴⠾⠥⠽⣦⣄⠀⠉⠻⢶⡼⢻⠀⠈⠇⠘⡷⡄⠘⠂⠀⢀⡍⠻⣷⣄⡇⠀⠀⠀",
  "⠀⠀⠀⠘⣺⠏⢸⢃⣼⠟⢁⡤⠀⣠⢟⡷⠟⢋⣉⣤⡿⠇⠀⠀⠀⢰⣣⠞⠋⠉⠉⠁⡀⠀⠀⠀⠀⠀⠙⢷⣄⠀⠀⢹⣾⠀⠀⠀⠀⢸⡇⠀⣀⡀⣾⠀⠀⠈⢻⡁⢦⠀⠀",
  "⠀⠀⣠⢚⣵⣄⠈⣼⡇⠀⢸⠧⢞⡵⠋⠠⠚⠉⠉⠀⠀⢀⡇⠀⣰⣟⣁⣀⠀⠀⠀⠀⠉⠒⠶⣤⣤⣀⠀⠀⠙⠀⠀⢸⡇⢰⣟⠛⢶⡋⣇⠀⠉⠻⡟⡄⠀⢀⢀⣿⠀⢧⠀",
  "⠀⣰⠃⢸⠁⣿⠀⠸⣧⠀⢸⢣⠋⠀⣠⣤⠶⢶⢒⣤⣔⣻⠣⢼⠟⠁⠀⠙⢷⡄⠀⠀⢀⠀⠀⠀⠈⠓⢟⢦⠀⠀⠀⢸⡇⠈⠻⣦⡀⠈⠻⣷⣄⠀⠘⣿⠀⠸⣿⣇⣀⢸⠀",
  "⠀⡇⠀⠀⣼⠇⠀⢀⣿⠀⣇⣇⣴⠟⠋⢠⣾⠟⠉⠀⠀⠈⠳⣼⠀⠀⠀⠀⠀⠳⠀⠀⠈⢳⣄⠀⠀⠀⢸⣼⠀⠀⠀⠈⡟⢆⠀⠈⢻⡀⠀⠈⢻⣆⠀⣻⠃⠀⠀⢹⡟⠻⡀",
  "⠀⢧⡆⣼⠏⠀⣾⠟⠁⢰⠃⡵⠃⢀⣴⡿⠁⠀⡀⠀⠀⠀⠀⠹⣧⡀⠰⣦⡀⠀⠀⠀⠀⠀⣻⢦⣀⣠⡾⣇⠀⠀⢀⣰⠟⠙⢷⣄⠀⠀⠀⠀⠀⣿⠀⠉⢠⠄⠀⣼⡇⠀⢧",
  "⢀⠞⢡⡟⠀⠀⣿⠀⢀⡏⡼⠁⣴⠟⠁⠀⠀⠀⣿⠀⣀⣀⢀⣴⠘⣷⡀⠈⢻⣦⣀⠀⢀⣾⠟⠉⠀⠀⠉⠻⣷⣄⠀⠀⠀⠀⠀⠙⢷⡄⠀⠀⠀⠉⠀⣠⡟⠀⣼⣟⠀⠀⢸",
  "⢸⠀⠘⣧⠀⡴⠛⠳⢸⢰⠁⢰⠏⠀⠀⠀⢀⣼⡯⠟⠋⠙⠻⣷⡀⠘⠀⠀⠀⠈⠉⠻⣿⠁⠀⠀⢰⡟⠉⠀⠈⢻⣦⠀⠀⠀⣄⠀⠀⡗⠀⢸⡇⣠⣾⠟⢀⣾⠋⠹⣷⢀⡇",
  "⠈⢆⠀⠹⢷⣤⣀⣠⠎⡇⠀⠸⠀⠀⢀⣴⠟⠉⠀⠀⠀⢄⠀⠹⣧⡀⠀⠀⣀⡀⠀⠀⣿⠀⠀⠀⠘⣿⡄⠀⠀⠀⢹⣦⡀⠀⢿⣄⠀⢀⣠⡿⠽⣯⡁⠀⠸⠃⠀⠀⡏⠉⠀",
  "⠀⢠⢷⣄⠀⠈⣉⣉⢢⢳⡀⠀⠀⠀⣾⡏⠀⠀⠠⣀⡤⢿⠀⠀⠙⠷⠶⠛⠉⠈⠀⣰⠟⠀⠀⠀⠀⠘⣷⡀⠀⠠⠛⠉⠉⠀⢈⣯⠗⠛⠁⠀⠀⠈⠃⠀⢀⣴⠇⢠⠇⠀⠀",
  "⠀⢸⡀⠻⣧⠈⠉⠹⣏⢀⣑⠤⣀⣀⠼⠳⣄⠀⠀⠀⠙⠺⠖⣦⣤⠤⣀⡀⠀⠀⠘⠁⠀⠀⠀⠀⠀⠀⢸⢧⡀⠀⠀⢀⣀⢴⣿⣅⡀⠠⠶⢿⢦⣀⣠⣴⠟⠃⡠⠋⠀⠀⠀",
  "⠀⠀⠳⡀⠘⠃⠀⡤⠸⣼⠀⠉⠛⠋⠉⠉⠙⠻⣦⣄⠀⠀⠀⠀⠈⠉⠙⠻⣦⠀⠀⠀⠀⡀⠀⠀⠀⢀⣾⠖⠚⠛⠛⠛⠋⠁⠀⠙⣷⠀⠀⣸⡴⠛⠉⢁⡤⠊⠁⠀⠀⠀⠀",
  "⠀⠀⠀⠘⢦⡀⠸⣧⠀⢻⢇⠀⠳⡤⣤⠆⠀⠀⠈⢻⡇⠀⠀⠀⢰⡄⠀⠀⣿⡇⢀⡾⠛⠛⠻⡝⣲⠟⠋⠀⢀⡄⠀⠀⠀⣀⡄⠀⠋⢀⡴⣻⡄⣤⡶⡍⠀⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠈⠙⠁⠉⠉⠈⠣⡀⠹⣇⠀⠀⠀⠀⠘⠀⠀⠀⢀⡾⢳⡶⠾⠋⠀⠈⠃⠀⠀⣠⠟⢄⣀⣠⡴⠋⠀⠀⠀⣼⢻⣤⣴⠶⠟⠋⣡⡷⣏⢿⡧⠀⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠓⢫⣲⣤⣀⣀⣀⣀⣤⣶⣻⠋⠛⠷⣦⣤⣤⣄⡤⢤⣺⠕⠋⠉⠉⠁⠀⠀⣀⣤⣾⠏⢩⠀⠀⢀⣤⣾⠛⣧⢻⣼⠀⠀⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠓⠮⢭⣉⣉⡩⠥⠚⠈⢇⠀⢠⡄⠀⠉⠉⠙⣿⠀⢠⠶⠖⢫⣩⠟⠛⠛⠉⠀⣠⣿⣦⠶⠿⣭⣸⣇⡿⠞⠁⠀⠀⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠳⣌⡿⣄⠀⠒⠚⠋⠀⠀⠀⣠⡾⠃⠀⢀⣀⠴⠚⠉⠣⢍⣛⣶⡶⠝⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⠒⠂⠀⠒⠒⠉⠀⠉⠉⠉⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
].join("\n");

export function LandingPage() {
  const reduceMotion = useReducedMotion() ?? false;
  const status = useAuthStore((s) => s.status);
  const signOut = useAuthStore((s) => s.signOut);
  const learningPath =
    status === "in" ? "/sessions" : "/signin?next=%2Fsessions";

  return (
    <div className="min-h-dvh overflow-x-clip bg-[#EBE5D9] font-sans text-[#EBE5D9]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-[#EBE5D9] focus:px-4 focus:py-2 focus:text-[#451017]"
      >
        Skip to Main Content
      </a>

      <main>
        {/* The navbar and hero share one full-bleed maroon block, flush to the
          top and sides; only its bottom corners curve into the beige canvas. */}
        <div className="flex min-h-dvh w-full flex-col overflow-hidden rounded-b-[2rem] bg-[#451017] md:rounded-b-[3rem]">
          <header className="relative z-10 flex h-[88px] shrink-0 items-center pt-6 justify-between px-6 sm:px-10 lg:px-16 xl:px-24">
            <Link
              to="/"
              translate="no"
              className="font-sans text-2xl font-extrabold tracking-[-0.08em] text-[#EBE5D9] transition-colors duration-75 hover:text-white"
              aria-label="Orabl home"
            >
              Orabl
            </Link>
            <nav aria-label="Main" className="flex items-center gap-4 sm:gap-7">
              <a
                href="#how-it-works"
                className="hidden text-sm font-medium text-[#EBE5D9] transition-colors duration-75 hover:text-white sm:inline"
              >
                How It Works
              </a>
              {status === "in" ? (
                <>
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="hidden text-sm font-medium text-[#EBE5D9] transition-colors duration-75 hover:text-white sm:inline"
                  >
                    Sign out
                  </button>
                  <Link
                    to="/sessions"
                    className="inline-flex items-center gap-2 rounded-lg bg-[#EBE5D9] px-5 py-2.5 text-sm font-bold text-[#451017] transition-colors duration-75 hover:bg-white"
                  >
                    Dashboard{" "}
                    <ArrowUpRight className="size-4" aria-hidden="true" />
                  </Link>
                </>
              ) : (
                <Link
                  to="/signin"
                  className="inline-flex items-center rounded-lg bg-[#EBE5D9] px-5 py-2.5 text-sm font-bold text-[#451017] transition-colors duration-75 hover:bg-white"
                >
                  Sign In
                </Link>
              )}
            </nav>
          </header>

          <section
            id="main-content"
            tabIndex={-1}
            className="flex flex-1 items-center focus:outline-none"
            aria-labelledby="hero-title"
          >
            <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-12 px-6 py-12 lg:grid-cols-2 lg:gap-8 lg:px-12">
              <div className="flex h-full flex-col justify-center text-left">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#EBE5D9]/80">
                  Orabl / Learn Out Loud
                </p>
                <h1
                  id="hero-title"
                  className="mt-6 font-serif text-6xl italic leading-[1.05] tracking-tight text-[#EBE5D9] lg:text-7xl xl:text-8xl"
                >
                  Learn It.
                  <br />
                  Say It.
                  <br />
                  Prove It.
                </h1>
                <p className="mt-6 max-w-md text-pretty text-base leading-7 text-[#EBE5D9]/85 sm:text-lg sm:leading-8">
                  Practice explaining your own material. Find the gaps, then
                  learn what sticks.
                </p>
              </div>

              {/* No backing card: the rail floats on the maroon itself. It scales
                  up from its left edge on desktop so the overflow bleeds off the
                  right of the screen (clipped by the hero block), never back
                  over the headline. The radial mask dissolves its edges. */}
              <div className="relative flex aspect-square w-full items-center justify-center overflow-visible lg:aspect-auto lg:h-[600px] xl:h-[700px]">
                <div
                  className="h-full w-full origin-center scale-125 lg:origin-left lg:scale-150"
                  style={{
                    maskImage:
                      "radial-gradient(circle at center, black 40%, transparent 80%)",
                    WebkitMaskImage:
                      "radial-gradient(circle at center, black 40%, transparent 80%)",
                  }}
                >
                  <ClarityRail />
                </div>
              </div>
            </div>
          </section>
        </div>

        <HowItWorksScroll />

        <section
          className="bg-[#EBE5D9] px-6 pb-24 pt-24 sm:px-10 lg:px-16 lg:pb-32 xl:px-24"
          aria-labelledby="cta-title"
        >
          {/* Corner-anchored spread: label pinned top-left, headline and
              action share the bottom edge, ghost ASCII brain behind on the right. */}
          <div className="relative mx-auto flex min-h-[500px] w-full max-w-7xl flex-col justify-between overflow-hidden rounded-3xl bg-[#451017] p-8 md:min-h-[600px] md:p-12 lg:min-h-[70vh] lg:p-16">
            {/* Confined to the right half and pushed past the card edge, with a
                left-to-right mask so the brain emerges from the maroon instead
                of running into the headline. */}
            <div
              className="pointer-events-none absolute right-0 top-0 z-0 flex h-full w-[60%] select-none items-center justify-end overflow-hidden lg:w-1/2"
              style={{
                maskImage: "linear-gradient(to right, transparent, black 30%)",
                WebkitMaskImage:
                  "linear-gradient(to right, transparent, black 30%)",
              }}
              aria-hidden="true"
            >
              <pre className="pointer-events-none shrink-0 translate-x-12 scale-110 select-none whitespace-pre text-right font-mono text-[8px] leading-none text-[#EBE5D9] opacity-15 md:translate-x-24 md:text-[13px] lg:scale-125 lg:text-[18px]">
                {BRAIN_ASCII}
              </pre>
            </div>

            <div className="relative z-10 font-sans text-sm font-medium uppercase tracking-[0.2em] text-[#EBE5D9]/70 md:text-base">
              Your Turn
            </div>
            <div className="relative z-10 mt-auto flex w-full flex-col items-start justify-between gap-8 lg:flex-row lg:items-end">
              <h2
                id="cta-title"
                className="font-serif text-7xl italic leading-[0.95] tracking-tighter text-[#EBE5D9] md:text-8xl lg:text-[10rem]"
              >
                Put It
                <br />
                Into Words.
              </h2>
              <Link
                to={learningPath}
                className="inline-flex shrink-0 items-center gap-3 rounded-xl bg-[#EBE5D9] px-8 py-4 font-sans text-lg font-semibold text-[#451017] transition-colors duration-75 hover:bg-black hover:text-white focus-visible:outline-[#EBE5D9]"
              >
                {status === "in" ? "Go to Dashboard" : "Start Learning"}{" "}
                <ArrowUpRight className="size-5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <div className="h-[350px] bg-black sm:h-[440px]">
        <AnimatedFooter
          headingLines={["Orabl"]}
          subtitle="Thoughts become understanding."
          leftImage="/animated-footer/hand-left.jpg"
          rightImage="/animated-footer/hand-right.jpg"
          background="#000000"
          textColor="#EBE5D9"
          charColor="rgba(235, 229, 217, 0.4)"
          hoverColor="#EBE5D9"
          hoverCharColor="#000000"
          columns={56}
          parallaxStrength={reduceMotion ? 0 : 4}
          revealOnScroll={!reduceMotion}
        />
      </div>
    </div>
  );
}
