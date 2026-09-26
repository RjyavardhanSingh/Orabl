import { useReducedMotion } from "motion/react";

const LOOP_SECONDS = 14;

// Exit leg: leaves the loop and bleeds off the right edge (past the
// viewBox) so the ribbon touches the edge instead of dying mid-word.
// A black stroke under the same geometry doubles as its ribbon.
const LEG_CLEAR =
  "M 325 296 C 350 300, 380 305, 420 320 C 490 352, 570 395, 660 445";

// Entry leg: a single overhand-knot silhouette — one continuous open
// path, not a figure-eight. It descends the left, twists once (a vertical
// pass crossed by a horizontal pass near x=185,y=196), then hooks right
// into the pill's left edge heading horizontally. Touches the waveform
// nowhere except the entry point. Loosely tied: wide loop, clear gaps.
const LEG_FOG =
  "M 450 -30 C 440 55, 402 92, 350 108 " +
  "C 298 124, 240 126, 205 138 " +
  "C 190 143, 186 152, 185 165 " +
  "C 184 178, 184 190, 185 202 " +
  "C 186 214, 185 226, 184 238 " +
  "C 182 251, 155 262, 128 260 " +
  "C 100 258, 78 240, 75 214 " +
  "C 72 188, 82 168, 104 160 " +
  "C 130 152, 158 151, 184 156 " +
  "C 208 160, 226 171, 230 185 " +
  "C 234 199, 220 202, 204 200 " +
  "C 188 199, 180 199, 172 200 " +
  "C 156 201, 144 208, 138 220 " +
  "C 132 234, 134 250, 142 264 " +
  "C 152 280, 168 294, 186 300 " +
  "C 200 303, 216 305, 242 306";

const FOG_UNIT = "umm so like photosynthesis is umm when plants • ";
const FOG_TILED = `${FOG_UNIT}${FOG_UNIT}${FOG_UNIT}${FOG_UNIT}${FOG_UNIT}`;
const FOG_TILED_LENGTH = 1800;
const FOG_TILE_UNIT = FOG_TILED_LENGTH / 5;

const FOG_STATIC =
  "umm so like photosynthesis is umm when plants take in sunlight…";

const CLEAR_TEXT = "Light + water + CO₂ → glucose + oxygen.";

// Tiled marquee math: one unit repeated 3× with textLength forcing exact
// equal units. Animating startOffset over exactly one unit (-460 → 0) is
// seamless because the window shows identical content on both sides of the
// jump, and the total (1380) always covers leg + one unit, so the ribbon
// is never empty.
const CLEAR_UNIT = `${CLEAR_TEXT} • `;
const CLEAR_TILED = `${CLEAR_UNIT}${CLEAR_UNIT}${CLEAR_UNIT}`;
const TILED_LENGTH = 1380;
const TILE_UNIT = TILED_LENGTH / 3;

const BAR_COUNT = 14;

// Flowing rail text uses the hero voice. Story Script ships 400 only,
// so weight stays 400 everywhere here — never bold it.
const RAIL_FONT = { fontFamily: "var(--font-story)", fontWeight: 400 } as const;

function WaveformBars({ animated }: { animated: boolean }) {
  const bars = Array.from({ length: BAR_COUNT }, (_, i) => {
    const h = 10 + Math.round(22 * Math.abs(Math.sin(i * 1.7)));
    return (
      <rect
        key={i}
        x={262 + i * 5.6}
        y={306 - h / 2}
        width={3}
        height={h}
        rx={1.5}
        fill="var(--color-ink)"
        className={animated ? "rail-bar" : undefined}
        style={animated ? { animationDelay: `${(i % 7) * 0.18}s` } : undefined}
      />
    );
  });
  return <g>{bars}</g>;
}

export function ClarityRail() {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <div
      className="relative w-full overflow-hidden bg-transparent"
      role="img"
      aria-label="Rambling study notes flow into the practice machine and come out as a clear revision sentence."
    >
      <svg viewBox="0 0 600 560" className="block h-auto w-full bg-transparent">
        {/* Invisible geometry for the foggy textPath to reference. */}
        <path id="clarity-rail-fog" d={LEG_FOG} fill="none" stroke="none" />
        {/* Exit ribbon backdrop — the clear text below references this
            geometry, so glyphs always sit on the ribbon centerline. */}
        <path
          id="clarity-rail-clear"
          d={LEG_CLEAR}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth={38}
          strokeLinecap="round"
        />
        {/* Foggy study-speak: one continuous tiled rail looping into the
            machine — same seamless marquee math as the clear ribbon, so the
            stream never breaks or gaps. */}
        {reduceMotion ? (
          <text
            textAnchor="middle"
            fontSize={15}
            fill="var(--color-ink-faint)"
            opacity={0.65}
            transform="translate(400,60)"
            style={RAIL_FONT}
          >
            {FOG_STATIC}
          </text>
        ) : (
          <text
            fontSize={15}
            fill="var(--color-ink-faint)"
            opacity={0.65}
            textLength={FOG_TILED_LENGTH}
            lengthAdjust="spacing"
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
        {reduceMotion ? (
          <text
            textAnchor="middle"
            fontSize={20}
            fill="#ffffff"
            transform="translate(492,392) rotate(14)"
            style={RAIL_FONT}
          >
            {CLEAR_TEXT}
          </text>
        ) : (
          <text
            fontSize={20}
            fill="#ffffff"
            dy={7}
            textLength={TILED_LENGTH}
            lengthAdjust="spacing"
            style={RAIL_FONT}
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
            fill="#ffffff"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            ✓ No more Umms
          </text>
          <rect
            x={242}
            y={276}
            width={160}
            height={60}
            rx={30}
            fill="var(--color-surface)"
            stroke="var(--color-ink)"
            strokeWidth={2}
          />
          <WaveformBars animated={!reduceMotion} />
        </g>
      </svg>
    </div>
  );
}
