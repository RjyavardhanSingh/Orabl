import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../../lib/auth-state'
import { WorkflowModal } from '../workflow-modal'

export function PublicBrand() {
  return (
    <Link to="/" className="flex items-center gap-3 text-ink">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-xl text-white transition-transform duration-200 hover:rotate-0 -rotate-6"
        style={{
          background:
            'black',
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


export function PublicNav() {
  const navigate = useNavigate()
  const { user, status, signOut } = useAuth()
  const [workflowOpen, setWorkflowOpen] = useState(false)

  // Auth screens live at /signin; both entries route there for now.
  const goSignIn = () => navigate('/signin')

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
            {status === 'in' && user ? (
              <>
                <span className="hidden max-w-36 truncate text-xs font-medium text-ink-muted sm:block">
                  {user.email ?? 'Signed in'}
                </span>
                <button
                  onClick={() => void signOut().then(() => navigate('/'))}
                  className="bg-green-900 text-white px-4 py-2 rounded-xl hover:bg-green-800"
                >
                  Sign out
                </button>
              </>
            ) : (
              <button onClick={goSignIn} className='bg-green-900 text-white px-4 py-2 rounded-xl hover:bg-green-800'>
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
