import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../../lib/auth-state'
import { WorkflowModal } from '../workflow-modal'


export function PublicBrand() {
  return (
<<<<<<< HEAD
    <Link to="/" className="font-sans text-2xl font-extrabold tracking-[-0.08em] text-ink transition-colors hover:text-accent" aria-label="Orabl home">
      Orabl
    </Link>
=======
    <Link to="/" className="text-2xl font-extrabold tracking-[-0.06em] text-[#E61E32]" aria-label="Orabl home">Orabl</Link>
>>>>>>> f503cbc (feat: update UI components with new styles, add framer-motion dependency, and enhance landing page structure)
  )
}


export function PublicNav() {
  const navigate = useNavigate()
  const { user, status, signOut } = useAuth()
  const [workflowOpen, setWorkflowOpen] = useState(false)

<<<<<<< HEAD
  const goSignIn = () => navigate('/signin?next=%2Fsessions')
  const goDashboard = () => navigate('/sessions')

  return (
    <>
      <header className="z-40 mx-auto mt-3 w-[calc(100%-1.5rem)] max-w-3xl rounded-b-xs border-b bg-transparent">
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
            {status === 'in' && user ? (
              <>
                <button
                  type="button"
                  onClick={goDashboard}
                  className="rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-sunk"
                >
                  Dashboard
                </button>
                <button
                  type="button"
                  onClick={() => void signOut().then(() => navigate('/'))}
                  className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-black hover:bg-accent-hover"
                >
                  Sign out
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={goSignIn}
                className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-black hover:bg-accent-hover"
              >
                Let's Begin
=======
  return (
    <>
      {/* macOS-style frosted glass pill — fixed to global viewport.
          Stays at top-center regardless of scroll position. */}
      <header className="fixed left-1/2 top-6 z-[999] flex -translate-x-1/2 items-center justify-between gap-2 rounded-xs border-2 border-black bg-white/80 px-6 py-3 text-black backdrop-blur-md sm:gap-4">
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
>>>>>>> f503cbc (feat: update UI components with new styles, add framer-motion dependency, and enhance landing page structure)
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
