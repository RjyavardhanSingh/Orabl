import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../../lib/auth-state'
import { WorkflowModal } from '../workflow-modal'


export function PublicBrand() {
  return (
    <Link to="/" className="font-sans text-2xl font-extrabold tracking-[-0.08em] text-ink transition-colors hover:text-accent" aria-label="Orabl home">
      Orabl<span className="text-accent">.</span>
    </Link>
  )
}


export function PublicNav() {
  const navigate = useNavigate()
  const { user, status, signOut } = useAuth()
  const [workflowOpen, setWorkflowOpen] = useState(false)

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
              </button>
            )}
          </div>
        </div>
      </header>
      <WorkflowModal open={workflowOpen} onClose={() => setWorkflowOpen(false)} />
    </>
  )
}
