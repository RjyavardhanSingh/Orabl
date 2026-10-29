import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useRef, useState } from "react";

const MAROON = "#451017";
const BLACK = "#000000";

const steps = [
  {
    number: "01",
    title: "Bring Your Material",
    description: "Upload a PDF or paste your notes.",
  },
  {
    number: "02",
    title: "Explain It",
    description: "Answer questions in your own words.",
  },
  {
    number: "03",
    title: "See What Sticks",
    description: "Find strengths and gaps worth revisiting.",
  },
];

// Scroll progress (0 → 1 across the pinned run) is split into three equal
// phases. Each graphic owns its slice and hands off at the boundaries.
const PHASE_2 = 1 / 3;
const PHASE_3 = 2 / 3;

// Deterministic noise so the "document" lays out the same on every render.
const rand = (seed: number) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/* ---- Phase 1: redacted notes ------------------------------------------ */

const DOC_ROWS = Array.from({ length: 20 }, (_, row) => {
  // Every few rows a short line ends a "paragraph".
  const paragraphEnd = row % 5 === 4;
  const count = paragraphEnd ? 1 : 2 + Math.floor(rand(row + 1) * 3);
  const segments = Array.from(
    { length: count },
    (_, i) => 6 + Math.round(rand(row * 7 + i + 3) * 30),
  );
  return {
    segments,
    tail: paragraphEnd
      ? 35 + Math.round(rand(row + 50) * 30)
      : Math.round(rand(row + 90) * 12),
  };
});

function DocRow({
  progress,
  index,
  segments,
  tail,
}: {
  progress: MotionValue<number>;
  index: number;
  segments: number[];
  tail: number;
}) {
  // Rows tear off in a ragged order, alternating direction, just before phase 2.
  const start = PHASE_2 - 0.07 + rand(index + 200) * 0.04;
  const direction = index % 2 === 0 ? -1 : 1;
  const x = useTransform(
    progress,
    [start, start + 0.04],
    ["0%", `${direction * 115}%`],
  );
  const scaleY = useTransform(progress, [start, start + 0.04], [1, 0.2]);

  return (
    <motion.div
      style={{ x, scaleY }}
      className="flex h-[2.6%] w-full gap-[1.5%]"
    >
      {segments.map((width, i) => (
        <div
          key={i}
          className="h-full rounded-sm bg-black"
          style={{ flexGrow: width }}
        />
      ))}
      {tail > 0 ? <div style={{ flexGrow: tail }} /> : null}
    </motion.div>
  );
}

function RedactedDocument({
  progress,
  enter,
}: {
  progress: MotionValue<number>;
  enter: MotionValue<number>;
}) {
  const opacity = useTransform(enter, [0.35, 0.9], [0, 1]);
  const y = useTransform(enter, [0.35, 0.9], [32, 0]);

  return (
    <motion.div
      style={{ opacity, y }}
      className="absolute inset-8 flex flex-col justify-center gap-[2.2%]"
      aria-hidden="true"
    >
      {DOC_ROWS.map((row, index) => (
        <DocRow
          key={index}
          progress={progress}
          index={index}
          segments={row.segments}
          tail={row.tail}
        />
      ))}
    </motion.div>
  );
}

/* ---- Phase 2: mechanical waveform ------------------------------------- */

const BAR_COUNT = 36;
const BAR_CENTER = (BAR_COUNT - 1) / 2;
const LEVELS = 6;

function WaveBar({
  progress,
  index,
}: {
  progress: MotionValue<number>;
  index: number;
}) {
  // Bars rise from the center outward, then all snap away together.
  const spread = Math.abs(index - BAR_CENTER) / BAR_CENTER;
  const riseStart = PHASE_2 + spread * 0.035;
  const scaleY = useTransform(progress, (v) => {
    const envelope =
      v < riseStart
        ? 0
        : v < riseStart + 0.03
          ? (v - riseStart) / 0.03
          : v < PHASE_3 - 0.02
            ? 1
            : 0;
    if (envelope === 0) return 0;
    const raw =
      Math.abs(Math.sin(v * 90 + index * 0.55)) * 0.6 +
      Math.abs(Math.sin(v * 37 - index * 1.3)) * 0.4;
    // Quantized to hard steps so it reads as a machine, not a smooth wave.
    const level = Math.max(1, Math.round(raw * LEVELS)) / LEVELS;
    return envelope * level;
  });

  return (
    <motion.div
      style={{ scaleY, backgroundColor: MAROON }}
      className="h-full flex-1 origin-center"
    />
  );
}

function Waveform({ progress }: { progress: MotionValue<number> }) {
  return (
    <div className="absolute inset-8 flex items-center" aria-hidden="true">
      <div className="flex h-[70%] w-full items-center gap-[0.6%]">
        {Array.from({ length: BAR_COUNT }, (_, index) => (
          <WaveBar key={index} progress={progress} index={index} />
        ))}
      </div>
    </div>
  );
}

/* ---- Phase 3: knowledge graph ----------------------------------------- */

const NODES = [
  { x: 60, y: 70, gap: false },
  { x: 200, y: 50, gap: false },
  { x: 340, y: 95, gap: true },
  { x: 105, y: 195, gap: false },
  { x: 250, y: 185, gap: false },
  { x: 345, y: 250, gap: false },
  { x: 60, y: 330, gap: true },
  { x: 190, y: 320, gap: false },
  { x: 315, y: 350, gap: true },
];

const EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [0, 3],
  [1, 4],
  [2, 4],
  [3, 4],
  [2, 5],
  [4, 5],
  [3, 6],
  [3, 7],
  [4, 7],
  [6, 7],
  [5, 8],
  [7, 8],
];

const NODE_SIZE = 18;
const DRAW_START = PHASE_3 + 0.02;
const DRAW_STAGGER = 0.012;
const DRAW_LENGTH = 0.06;
const GAPS_START =
  DRAW_START + EDGES.length * DRAW_STAGGER + DRAW_LENGTH - 0.02;

function Edge({
  progress,
  index,
  from,
  to,
}: {
  progress: MotionValue<number>;
  index: number;
  from: (typeof NODES)[number];
  to: (typeof NODES)[number];
}) {
  const start = DRAW_START + index * DRAW_STAGGER;
  // pathLength=1 normalizes every line, so dasharray 1 / dashoffset 1 → 0 draws it.
  const strokeDashoffset = useTransform(
    progress,
    [start, start + DRAW_LENGTH],
    [1, 0],
  );
  const opacity = useTransform(progress, [start - 0.001, start], [0, 1]);
  return (
    <motion.line
      x1={from.x}
      y1={from.y}
      x2={to.x}
      y2={to.y}
      stroke={BLACK}
      strokeWidth={2}
      pathLength={1}
      strokeDasharray="1"
      style={{ strokeDashoffset, opacity }}
    />
  );
}

function Node({
  progress,
  index,
  node,
}: {
  progress: MotionValue<number>;
  index: number;
  node: (typeof NODES)[number];
}) {
  // Solid nodes land as the lines reach them; gaps snap in once drawing ends.
  const gapOrder = NODES.filter((n, i) => n.gap && i < index).length;
  const at = node.gap
    ? GAPS_START + gapOrder * 0.025
    : DRAW_START + index * 0.018 + 0.03;
  const scale = useTransform(progress, [at, at + 0.008], [0, 1]);
  return (
    <motion.rect
      x={node.x - NODE_SIZE / 2}
      y={node.y - NODE_SIZE / 2}
      width={NODE_SIZE}
      height={NODE_SIZE}
      fill={node.gap ? MAROON : BLACK}
      style={{ scale, transformBox: "fill-box", transformOrigin: "center" }}
    />
  );
}

function KnowledgeGraph({ progress }: { progress: MotionValue<number> }) {
  const legendOpacity = useTransform(
    progress,
    [GAPS_START + 0.06, GAPS_START + 0.07],
    [0, 1],
  );
  return (
    <div className="absolute inset-8 flex flex-col" aria-hidden="true">
      <svg viewBox="20 20 360 360" className="block min-h-0 w-full flex-1">
        {EDGES.map(([a, b], index) => (
          <Edge
            key={`${a}-${b}`}
            progress={progress}
            index={index}
            from={NODES[a]}
            to={NODES[b]}
          />
        ))}
        {NODES.map((node, index) => (
          <Node key={index} progress={progress} index={index} node={node} />
        ))}
      </svg>
      <motion.div
        style={{ opacity: legendOpacity }}
        className="flex gap-6 pt-4 text-xs font-bold uppercase tracking-[0.18em] text-black"
      >
        <span className="inline-flex items-center gap-2">
          <span className="size-3 bg-black" />
          Solid
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-3" style={{ backgroundColor: MAROON }} />
          Gap
        </span>
      </motion.div>
    </div>
  );
}

/* ---- Section ---------------------------------------------------------- */

export function HowItWorksScroll() {
  const reduceMotion = useReducedMotion() ?? false;
  const runRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: runRef,
    offset: ["start start", "end end"],
  });
  // Separate lead-in so the notes are already fading up while the card scrolls into place.
  const { scrollYProgress: enterProgress } = useScroll({
    target: runRef,
    offset: ["start end", "start start"],
  });
  // Reduced motion: no pinning, everything parked on the finished graph.
  const settled = useMotionValue(1);
  const progress = reduceMotion ? settled : scrollYProgress;
  const enter = reduceMotion ? settled : enterProgress;

  const [active, setActive] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setActive(v < PHASE_2 ? 0 : v < PHASE_3 ? 1 : 2);
  });

  return (
    <section
      id="how-it-works"
      className="bg-canvas text-ink"
      aria-labelledby="how-title"
    >
      <div
        ref={runRef}
        className={reduceMotion ? "relative" : "relative h-[400vh]"}
      >
        <div
          className={
            reduceMotion
              ? "flex w-full items-center py-24"
              : "sticky top-0 flex h-screen w-full items-center"
          }
        >
          <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-8 px-6 lg:grid-cols-2 lg:gap-16 lg:px-12">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em]">
                How It Works
              </p>
              <h2
                id="how-title"
                className="mt-4 max-w-[13ch] font-serif text-4xl italic leading-[1] tracking-[-0.04em] text-balance md:text-6xl lg:mt-6 xl:text-7xl"
              >
                From Notes to Knowing.
              </h2>
              <ol className="mt-8 flex flex-col gap-5 lg:mt-14 lg:gap-10">
                {steps.map((step, index) => (
                  <motion.li
                    key={step.number}
                    initial={false}
                    animate={{
                      opacity: reduceMotion || active === index ? 1 : 0.3,
                    }}
                    transition={{ duration: 0.2, ease: "linear" }}
                    aria-current={
                      !reduceMotion && active === index ? "step" : undefined
                    }
                    className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-baseline gap-x-4 lg:grid-cols-[5rem_minmax(0,1fr)]"
                  >
                    <span className="tabular font-serif text-2xl lg:text-3xl">
                      {step.number}
                    </span>
                    <div>
                      <h3 className="text-balance text-xl font-semibold tracking-[-0.035em] lg:text-3xl">
                        {step.title}
                      </h3>
                      <p className="mt-1 hidden max-w-md text-pretty text-base leading-7 text-ink/80 sm:block lg:mt-2 lg:text-lg">
                        {step.description}
                      </p>
                    </div>
                  </motion.li>
                ))}
              </ol>
            </div>

            <div className="relative h-[42vh] w-full overflow-hidden rounded-3xl bg-white p-8 dark:bg-paper lg:h-[min(600px,calc(100vh-8rem))] xl:h-[min(700px,calc(100vh-8rem))]">
              <RedactedDocument progress={progress} enter={enter} />
              <Waveform progress={progress} />
              <KnowledgeGraph progress={progress} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
