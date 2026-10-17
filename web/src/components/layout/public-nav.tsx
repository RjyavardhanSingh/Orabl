import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../../lib/auth-state'
import { WorkflowModal } from '../workflow-modal'


export function PublicBrand() {
  return (
    <Link to="/" className="text-2xl font-extrabold tracking-[-0.06em] text-[#E61E32]" aria-label="Orabl home">Orabl</Link>
  )
}


export function PublicNav() {
  const navigate = useNavigate()
  const { user, status, signOut } = useAuth()
  const [workflowOpen, setWorkflowOpen] = useState(false)

  return (
    <>
      {/* macOS-style frosted glass pill — fixed to global viewport.
          Stays at top-center regardless of scroll position. */}
      <header className="fixed left-1/2 top-6 z-[100] flex -translate-x-1/2 items-center justify-between gap-2 rounded-xs  bg-mist-50 border border-zinc-200  px-6 py-3 text-black shadow-sm backdrop-blur-md sm:gap-4">
        <PublicBrand />
        <button
          type="button"
          onClick={() => setWorkflowOpen(true)}
          className="hidden text-sm font-medium text-zinc-800 transition-colors hover:text-black md:block"
        >
          How It Works
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {status === 'in' && user ? (
            <>
              <span className="hidden max-w-36 truncate text-xs font-medium text-zinc-800 sm:block">
                {user.email ?? 'Signed in'}
              </span>
              <button
                onClick={() => void signOut().then(() => navigate('/'))}
                className="rounded-xs px-4 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-900/5 hover:text-black"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link to="/signin" className="rounded-xs border border-[#E61E32]/30 px-4 py-2 text-sm font-bold text-[#E61E32] transition-colors hover:bg-[#E61E32]/5">
              Let's Begin
            </Link>
          )}
        </div>
      </header>
      <WorkflowModal open={workflowOpen} onClose={() => setWorkflowOpen(false)} />
    </>
  )
}
