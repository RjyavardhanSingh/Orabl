import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

// Matched to the hero morph cycle (3 words × 2600ms): both animations share
// one full-cycle duration so the headline and the marquee move as one rhythm.
const LOOP_SECONDS = 7.8;

// Exit leg: leaves the machine, eases toward the lower right, and finishes
// inside the frame. The mask below fades it to nothing before the edge, so
// the ribbon dissolves into the dark instead of being clipped by the
// viewBox — the whole drawing now stays within its own bounds.
const LEG_CLEAR =
  "M 325 296 C 350 300, 380 305, 420 320 C 478 345, 528 373, 566 396";

// Entry leg: one open curl, not a knot. Drops in from the top, sweeps
// left in a gentle wave, rounds a single spacious bowl, and runs into the
// pill's left edge heading horizontally. No self-crossings, no closed
// rings — one continuous ribbon with clear air around every bend.
const LEG_FOG =
  "M 470 -30 C 460 50, 420 80, 370 92 " +
  "C 320 104, 270 95, 220 85 " +
  "C 170 78, 125 105, 112 155 " +
  "C 100 210, 115 260, 155 285 " +
  "C 195 310, 218 303, 242 306";

const FOG_UNIT = "I know my notes… but can I put it into words? • ";
const FOG_TILED = `${FOG_UNIT}${FOG_UNIT}${FOG_UNIT}${FOG_UNIT}${FOG_UNIT}`;
const FOG_TILED_LENGTH = 1800;
const FOG_TILE_UNIT = FOG_TILED_LENGTH / 5;

const FOG_STATIC = "Can I say it in my own words?";

const CLEAR_TEXT = "I said it in my own words. Now I know.";

// Tiled marquee math: one unit repeated 3× with textLength forcing exact
// equal units. Animating startOffset over exactly one unit (-350 → 0) is
// seamless because the window shows identical content on both sides of the
// jump, and the total (1050) always covers leg + one unit, so the ribbon
// is never empty.
const CLEAR_UNIT = `${CLEAR_TEXT} • `;
const CLEAR_TILED = `${CLEAR_UNIT}${CLEAR_UNIT}${CLEAR_UNIT}`;
const TILED_LENGTH = 1050;
const TILE_UNIT = TILED_LENGTH / 3;

// Spoken notes on the curve. Shantell's weight-only cut has an even stroke,
// so the glyphs stay intact when the path bends. 600 keeps that stroke solid.
const RAIL_FONT = { fontFamily: "var(--font-voice)", fontWeight: 600 } as const;

const STATUS_WORDS = ["Reading notes", "Finding gaps", "Getting clearer", "Ready to explain"];

const POP_IN_MS =600;
const HOLD_MS = 600;
const DROP_OUT_MS = 600;
const GAP_MS = 300;
// Travel distance: tucks just behind the robot pill's top edge on exit,
// so the pill reads as popping out from the robot area. Never reaches
// the robot face (head top sits ~18px below the lowest travel point).
const PILL_HIDDEN_DY = 22;

type PillPhase = "in" | "hold" | "out" | "gap";

function StatusPill({ reduceMotion }: { reduceMotion: boolean }) {
  const [[wordIndex, phase], setState] = useState<[number, PillPhase]>([0, "in"]);

  useEffect(() => {
    if (reduceMotion) return;
    const delay =
      phase === "in"
        ? POP_IN_MS
        : phase === "hold"
          ? HOLD_MS
          : phase === "out"
            ? DROP_OUT_MS
            : GAP_MS;
    const timer = setTimeout(() => {
      setState(([w, p]) => {
        if (p === "in") return [w, "hold"];
        if (p === "hold") return [w, "out"];
        if (p === "out") return [w, "gap"];
        return [(w + 1) % STATUS_WORDS.length, "in"];
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [wordIndex, phase, reduceMotion]);

  const visible = reduceMotion || phase === "in" || phase === "hold";
  return (
    <g
      style={{
        transform: `translateY(${visible ? 0 : PILL_HIDDEN_DY}px)`,
        opacity: visible ? 1 : 0,
        transition:
          phase === "in"
            ? "transform 200ms cubic-bezier(0.34, 1.4, 0.64, 1), opacity 160ms ease-out"
            : "transform 200ms cubic-bezier(0.5, 0, 0.75, 0), opacity 160ms ease-in",
      }}
    >
      <rect
        x={247}
        y={224}
        width={150}
        height={34}
        rx={17}
        fill="var(--color-good)"
      />
      <text
        x={322}
        y={246}
        textAnchor="middle"
        fontSize={14}
        fontWeight={600}
        fill="var(--color-canvas)"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        {reduceMotion ? STATUS_WORDS[3] : STATUS_WORDS[wordIndex]}
      </text>
    </g>
  );
}

function RobotFace() {
  return (
    <g strokeLinecap="round">
      {/* ears behind the head edge */}
      <rect
        x={301}
        y={303}
        width={8}
        height={11}
        rx={4}
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth={2.5}
      />
      <rect
        x={335}
        y={303}
        width={8}
        height={11}
        rx={4}
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth={2.5}
      />
      {/* head */}
      <circle
        cx={322}
        cy={309}
        r={15}
        fill="var(--color-ink)"
        stroke="var(--color-canvas)"
        strokeWidth={3}
      />
      {/* antenna stem + tip */}
      <line
        x1={322}
        y1={294}
        x2={322}
        y2={287}
        stroke="var(--color-ink)"
        strokeWidth={2.5}
      />
      <circle cx={322} cy={284} r={2.8} fill="var(--color-ink)" />
      {/* eyes — vertical scale only, synced via shared class */}
      <rect
        className="robot-eye"
        x={312.5}
        y={302.5}
        width={5}
        height={11}
        rx={2.5}
        fill="var(--color-canvas)"
      />
      <rect
        className="robot-eye"
        x={326.5}
        y={302.5}
        width={5}
        height={11}
        rx={2.5}
        fill="var(--color-canvas)"
      />
    </g>
  );
}

export function ClarityRail() {
  const reduceMotion = useReducedMotion() ?? false;
  const [paused, setPaused] = useState(false);
  const staticView = reduceMotion || paused;

  return (
<<<<<<< HEAD
    <div className={paused ? 'motion-paused w-full min-w-0' : 'w-full min-w-0'}>
      <div role="img" aria-label="Your notes flow into Orabl and come back as your own words." className="relative w-full overflow-hidden">
      <svg viewBox="80 30 515 390" className="block h-auto w-full bg-transparent">
=======
    <div className="min-w-0">
      <div role="img" aria-label="An uncertain thought flows into Orabl and becomes a clear spoken explanation." className="relative w-full overflow-hidden">
      <svg viewBox="70 25 530 470" className="block h-auto w-full bg-transparent" overflow="visible">
>>>>>>> f503cbc (feat: update UI components with new styles, add framer-motion dependency, and enhance landing page structure)
        <defs>
          <linearGradient id="clarity-ribbon-fade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="white" />
            <stop offset="74%" stopColor="white" />
            <stop offset="95%" stopColor="white" stopOpacity="0" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          {/* Top fade for the looping narration: the marquee's wrap point
              sits just under the top edge, so this dissolves it there rather
              than letting glyphs pop in or get sliced by the frame. */}
          <linearGradient id="clarity-fog-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="5%" stopColor="white" stopOpacity="0" />
            <stop offset="16%" stopColor="white" />
          </linearGradient>
          <mask id="clarity-ribbon-mask" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="0" y="0" width="600" height="560">
            <rect width="600" height="560" fill="url(#clarity-ribbon-fade)" />
          </mask>
          <mask id="clarity-fog-mask" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="0" y="0" width="600" height="560">
            <rect width="600" height="560" fill="url(#clarity-fog-fade)" />
          </mask>
        </defs>
        {/* Invisible geometry for the foggy textPath to reference. */}
        <path id="clarity-rail-fog" d={LEG_FOG} fill="none" stroke="none" />
        {/* Exit ribbon backdrop — the clear text below references this
            geometry, so glyphs always sit on the ribbon centerline. */}
        <path
          id="clarity-rail-clear"
          d={LEG_CLEAR}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={38}
          strokeLinecap="round"
          mask="url(#clarity-ribbon-mask)"
        />
        {/* Foggy study-speak: one continuous tiled rail looping into the
            machine — same seamless marquee math as the clear ribbon, so the
            stream never breaks or gaps. */}
        {staticView ? (
          <text
            textAnchor="middle"
            fontSize={15}
            fill="#000000"
            opacity={0.9}
            transform="translate(400,60)"
            style={RAIL_FONT}
          >
            {FOG_STATIC}
          </text>
        ) : (
          <text
            fontSize={15}
            fill="#000000"
            opacity={0.9}
            textLength={FOG_TILED_LENGTH}
            lengthAdjust="spacing"
            mask="url(#clarity-fog-mask)"
            style={RAIL_FONT}
          >
            <textPath href="#clarity-rail-fog">
              {FOG_TILED}
              <animate
                attributeName="startOffset"
                values={`${-FOG_TILE_UNIT};0`}
                keyTimes="0;1"
                dur={`${LOOP_SECONDS}s`}
                repeatCount="indefinite"
              />
            </textPath>
          </text>
        )}
        {/* Clear revision sentence riding out. textPath lays every glyph
            on the ribbon curve itself (dy centers it on the stroke), so it
            can never drift off the line. startOffset stays in [0,100%] with
            opacity doing the enter/exit — both loop ends are invisible. */}
        {staticView ? (
          <text
            textAnchor="middle"
            fontSize={20}
            fill="var(--color-canvas)"
            transform="translate(497,356) rotate(27)"
            style={RAIL_FONT}
            mask="url(#clarity-ribbon-mask)"
          >
            {CLEAR_TEXT}
          </text>
        ) : (
          <text
            fontSize={20}
            fill="var(--color-canvas)"
            dy={7}
            textLength={TILED_LENGTH}
            lengthAdjust="spacing"
            style={RAIL_FONT}
            mask="url(#clarity-ribbon-mask)"
          >
            <textPath href="#clarity-rail-clear">
              {CLEAR_TILED}
              <animate
                attributeName="startOffset"
                values={`${-TILE_UNIT};0`}
                keyTimes="0;1"
                dur={`${LOOP_SECONDS}s`}
                repeatCount="indefinite"
              />
            </textPath>
          </text>
        )}
        {/* The machine */}
        <g>
          <StatusPill reduceMotion={staticView} />
          <rect
            x={242}
            y={276}
            width={160}
            height={60}
            rx={30}
            fill="var(--color-canvas)"
            stroke="var(--color-ink)"
            strokeWidth={2}
          />
          <RobotFace />
        </g>
      </svg>
      </div>
<<<<<<< HEAD
      {!reduceMotion ? (
        <button
          type="button"
          onClick={() => setPaused((value) => !value)}
          className="mt-2 text-[11px] font-bold uppercase tracking-[0.2em] text-ink-muted underline decoration-line-strong underline-offset-[6px] transition-colors hover:text-accent"
        >
          {paused ? 'Play Animation' : 'Pause Animation'}
        </button>
      ) : null}
=======
>>>>>>> f503cbc (feat: update UI components with new styles, add framer-motion dependency, and enhance landing page structure)
    </div>
  );
}
