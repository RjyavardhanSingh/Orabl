import { useEffect, useRef, useState } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'

const steps = [
  { number: '01', title: 'Bring Your Material', description: 'Upload a PDF or paste your notes.' },
  { number: '02', title: 'Explain It', description: 'Answer questions in your own words.' },
  { number: '03', title: 'See What Sticks', description: 'Find strengths and gaps worth revisiting.' },
]

// Step 1: Messy redacted text blocks
function MessyTextVisual({ opacity }: { opacity: number }) {
  const blocks = [
    { x: 20, y: 30, w: 180, h: 12 },
    { x: 50, y: 50, w: 220, h: 12 },
    { x: 30, y: 70, w: 160, h: 12 },
    { x: 80, y: 95, w: 190, h: 12 },
    { x: 40, y: 115, w: 210, h: 12 },
    { x: 60, y: 140, w: 170, h: 12 },
    { x: 25, y: 165, w: 200, h: 12 },
    { x: 70, y: 190, w: 150, h: 12 },
    { x: 45, y: 215, w: 185, h: 12 },
    { x: 90, y: 240, w: 160, h: 12 },
  ]

  return (
    <div className="flex h-full w-full items-center justify-center">
      <motion.div
        className="relative h-[320px] w-[320px] rounded-xs border-2 border-zinc-900 bg-white p-6"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: opacity > 0.3 ? 1 : 0.8, opacity: opacity > 0.3 ? 1 : 0 }}
        transition={{ duration: 0.5 }}
      >
        {blocks.map((block, i) => (
          <motion.div
            key={i}
            className="absolute bg-black"
            style={{
              left: block.x,
              top: block.y,
              width: block.w,
              height: block.h,
            }}
            initial={{ x: -50, opacity: 0 }}
            animate={{ x: 0, opacity: opacity > 0.3 ? 1 : 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
          />
        ))}
      </motion.div>
    </div>
  )
}

// Step 2: Sliced text with recording indicator
function SlicedTextVisual({ opacity }: { opacity: number }) {
  const anchorWords = [
    { text: 'mitochondria', x: 40, y: 60 },
    { text: 'energy', x: 180, y: 110 },
    { text: 'ATP', x: 100, y: 160 },
    { text: 'cellular', x: 200, y: 200 },
  ]

  return (
    <div className="flex h-full w-full items-center justify-center">
      <motion.div
        className="relative h-[320px] w-[320px] rounded-xs border-2 border-zinc-900 bg-white p-6"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: opacity > 0.3 ? 1 : 0.8, opacity: opacity > 0.3 ? 1 : 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Crimson slash line */}
        <motion.svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 320 320"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: opacity > 0.5 ? 1 : 0 }}
          transition={{ duration: 0.8, ease: 'easeInOut' }}
        >
          <motion.line
            x1="10"
            y1="30"
            x2="310"
            y2="280"
            stroke="#E61E32"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </motion.svg>

        {/* Anchor words */}
        {anchorWords.map((word, i) => (
          <motion.div
            key={i}
            className="absolute text-lg font-bold text-black"
            style={{ left: word.x, top: word.y }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: opacity > 0.6 ? 1 : 0, scale: opacity > 0.6 ? 1 : 0.5 }}
            transition={{ delay: 0.8 + i * 0.1, duration: 0.3 }}
          >
            {word.text}
          </motion.div>
        ))}

        {/* Pulsing recording indicator */}
        <motion.div
          className="absolute bottom-8 left-8 flex items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: opacity > 0.7 ? 1 : 0 }}
          transition={{ delay: 1.2 }}
        >
          <motion.div
            className="h-3 w-3 rounded-full bg-[#E61E32]"
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <span className="text-xs font-medium text-[#E61E32]">Recording</span>
        </motion.div>
      </motion.div>
    </div>
  )
}

// Step 3: Network graph with gaps
function NetworkGraphVisual({ opacity }: { opacity: number }) {
  const nodes = [
    { id: 1, x: 100, y: 80, complete: true },
    { id: 2, x: 220, y: 90, complete: false },
    { id: 3, x: 160, y: 150, complete: true },
    { id: 4, x: 80, y: 200, complete: true },
    { id: 5, x: 240, y: 180, complete: false },
    { id: 6, x: 160, y: 240, complete: true },
  ]

  const connections = [
    { from: 1, to: 3 },
    { from: 1, to: 2 },
    { from: 3, to: 4 },
    { from: 3, to: 5 },
    { from: 3, to: 6 },
    { from: 2, to: 5 },
  ]

  return (
    <div className="flex h-full w-full items-center justify-center">
      <motion.div
        className="relative h-[320px] w-[320px] rounded-xs border-2 border-zinc-900 bg-white p-6"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: opacity > 0.3 ? 1 : 0.8, opacity: opacity > 0.3 ? 1 : 0 }}
        transition={{ duration: 0.5 }}
      >
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 320 320">
          {/* Connection lines */}
          {connections.map((conn, i) => {
            const fromNode = nodes.find((n) => n.id === conn.from)!
            const toNode = nodes.find((n) => n.id === conn.to)!
            return (
              <motion.line
                key={i}
                x1={fromNode.x}
                y1={fromNode.y}
                x2={toNode.x}
                y2={toNode.y}
                stroke="#000000"
                strokeWidth="2"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: opacity > 0.5 ? 1 : 0 }}
                transition={{ delay: i * 0.1, duration: 0.4 }}
              />
            )
          })}

          {/* Nodes */}
          {nodes.map((node, i) => (
            <motion.g
              key={node.id}
              initial={{ scale: 0 }}
              animate={{ scale: opacity > 0.6 ? 1 : 0 }}
              transition={{ delay: 0.5 + i * 0.08, duration: 0.3 }}
            >
              <circle
                cx={node.x}
                cy={node.y}
                r="12"
                fill={node.complete ? '#000000' : '#E61E32'}
                stroke={node.complete ? '#000000' : '#E61E32'}
                strokeWidth="2"
              />
              {!node.complete && (
                <motion.circle
                  cx={node.x}
                  cy={node.y}
                  r="18"
                  fill="none"
                  stroke="#E61E32"
                  strokeWidth="2"
                  opacity="0.4"
                  animate={{ scale: [1, 1.4, 1] }}
                  transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
                />
              )}
            </motion.g>
          ))}
        </svg>

        {/* Gap indicator */}
        <motion.div
          className="absolute bottom-8 right-8 rounded-xs bg-[#E61E32] px-3 py-1.5 text-xs font-bold text-white"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: opacity > 0.8 ? 1 : 0, y: opacity > 0.8 ? 0 : 10 }}
          transition={{ delay: 1.2 }}
        >
          2 gaps found
        </motion.div>
      </motion.div>
    </div>
  )
}

export function HowItWorksInteractive() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [activeStep, setActiveStep] = useState(0)
  const [stepOpacities, setStepOpacities] = useState([1, 0, 0])

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  })

  // Individual step opacities
  const step1Opacity = useTransform(scrollYProgress, [0, 0.2, 0.33], [0, 1, 0.3])
  const step2Opacity = useTransform(scrollYProgress, [0.3, 0.45, 0.66], [0, 1, 0.3])
  const step3Opacity = useTransform(scrollYProgress, [0.6, 0.75, 1], [0, 1, 1])

  // Map scroll progress to active step and update opacities
  useEffect(() => {
    const unsubscribe = scrollYProgress.on('change', (latest) => {
      if (latest < 0.33) {
        setActiveStep(0)
        setStepOpacities([step1Opacity.get(), 0, 0])
      } else if (latest < 0.66) {
        setActiveStep(1)
        setStepOpacities([0, step2Opacity.get(), 0])
      } else {
        setActiveStep(2)
        setStepOpacities([0, 0, step3Opacity.get()])
      }
    })
    return unsubscribe
  }, [scrollYProgress, step1Opacity, step2Opacity, step3Opacity])

  return (
    <section
      ref={containerRef}
      id="how-it-works"
      className="relative bg-white"
      style={{ height: '250vh' }}
      aria-labelledby="how-title"
    >
      <div className="sticky top-0 flex h-screen items-center">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-16 px-6 lg:grid-cols-2 lg:px-16 xl:px-24">
          {/* Left: Text content that changes */}
          <div className="space-y-12">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#E61E32]/70">
              How It Works
            </p>

            {steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0.3 }}
                animate={{ opacity: activeStep === i ? 1 : 0.3 }}
                transition={{ duration: 0.5 }}
                className="space-y-4"
              >
                <div className="flex items-baseline gap-6">
                  <span className={`tabular text-2xl font-bold ${activeStep === i ? 'text-[#E61E32]/60' : 'text-zinc-300'}`}>
                    {step.number}
                  </span>
                  <div>
                    <h3 className={`text-balance text-3xl font-semibold tracking-[-0.035em] ${activeStep === i ? 'text-[#E61E32]' : 'text-zinc-400'}`}>
                      {step.title}
                    </h3>
                    <p className={`mt-3 max-w-md text-pretty text-lg leading-7 ${activeStep === i ? 'text-[#E61E32]/70' : 'text-zinc-400'}`}>
                      {step.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Right: Sticky visual container */}
          <div className="relative h-[500px] w-full">
            <div className="absolute inset-0">
              {activeStep === 0 && <MessyTextVisual opacity={stepOpacities[0]} />}
              {activeStep === 1 && <SlicedTextVisual opacity={stepOpacities[1]} />}
              {activeStep === 2 && <NetworkGraphVisual opacity={stepOpacities[2]} />}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
