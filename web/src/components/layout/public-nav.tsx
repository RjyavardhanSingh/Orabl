import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../../lib/auth-state'
import { WorkflowModal } from '../workflow-modal'
import mainLogo from '../../assets/Main-logo-transparent.svg'

export function PublicBrand() {
  return (
    <Link to="/" className="flex items-center gap-3 text-ink">
      <img
        src={mainLogo}
        alt=""
        aria-hidden="true"
        className="size-12 shrink-0 rounded-xl"
      />
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
      <header className="z-40 mx-auto mt-3 w-[calc(100%-1.5rem)] max-w-3xl rounded-b-xs border-b  bg-transparent">
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
