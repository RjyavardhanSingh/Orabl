import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { RadialGlowButton } from '../ui/radial-glow-button'
import { WorkflowModal } from '../workflow-modal'

export function PublicBrand() {
  return (
    <Link to="/" className="flex items-center gap-3 text-ink">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-xl text-white transition-transform duration-200 hover:rotate-0 -rotate-6"
        style={{
          background:
            'radial-gradient(circle at 30% 20%, #469396 0%, #1f3f6d 55%, #101828 100%)',
        }}
      >
        <Sparkles className="size-4" strokeWidth={2.5} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold tracking-tight">recall</span>
        <span className="block text-[10px] font-medium uppercase tracking-[0.2em] text-ink-faint">
          Learn out loud
        </span>
      </span>
    </Link>
  )
}

const COMPACT_GLOW = {
  minWidth: 0,
  minHeight: 0,
  padding: '9px 18px',
  fontSize: 13,
  borderRadius: 999,
} as const

export function PublicNav() {
  const navigate = useNavigate()
  const [workflowOpen, setWorkflowOpen] = useState(false)

  // Auth screens land in a later sprint; both entries route into the
  // workspace for now.
  const enterWorkspace = () => navigate('/upload')

  return (
    <>
      <header className="sticky top-3 z-40 mx-auto mt-3 w-[calc(100%-1.5rem)] max-w-3xl rounded-xl border bg-transparent">
        <div className="flex h-14 items-center justify-between gap-2 px-4 sm:gap-4 sm:px-5">
          <PublicBrand />
          <button
            type="button"
            onClick={() => setWorkflowOpen(true)}
            className="hidden text-sm font-medium text-ink transition-opacity hover:opacity-70 md:block"
          >
            How It Works
          </button>
          <div className="flex shrink-0 items-center gap-2">
            <RadialGlowButton onClick={enterWorkspace} style={COMPACT_GLOW}>
              Login
            </RadialGlowButton>
            <RadialGlowButton onClick={enterWorkspace} style={COMPACT_GLOW}>
              Sign up
            </RadialGlowButton>
          </div>
        </div>
      </header>
      <WorkflowModal open={workflowOpen} onClose={() => setWorkflowOpen(false)} />
    </>
  )
}
