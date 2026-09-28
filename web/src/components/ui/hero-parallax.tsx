import { useNavigate } from "react-router-dom";

import { ClarityRail } from "./clarity-rail";
import { RadialGlowButton } from "@/components/ui/radial-glow-button";

export const Header = () => {
  const navigate = useNavigate();
  return (
    <div className="max-w-7xl relative mx-auto px-4 w-full left-0 top-0 grid items-center content-center gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-6 min-h-[calc(100svh-4rem)] py-12">
      <div className="-translate-y-8 md:-translate-y-12">
        <p className="font-pt-serif text-xs font-normal uppercase tracking-[0.2em] text-ink-muted">
          Recall · Learn out loud
        </p>
        <h1 className="font-story mt-6 text-4xl font-normal md:text-6xl">
          Turn what you study into what you remember.
        </h1>
        <p className="font-pt-serif mt-8 max-w-2xl text-base md:text-xl text-ink-muted">
          Bring your material, say what you need to achieve, then practice
          answering out loud. Finish with a clear report on what you know and
          what to fix.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <RadialGlowButton
            onClick={() => navigate("/signin")}
            className="w-full sm:w-auto"
          >
            Start a Session
          </RadialGlowButton>
        </div>
      </div>
      <div className="relative bg-transparent lg:-mr-[max(0px,calc((100vw-80rem)/2+2rem))]">
        <ClarityRail />
      </div>
    </div>
  );
};
