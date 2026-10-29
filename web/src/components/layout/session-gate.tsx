import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'

import { api } from '../../lib/api'
import { isStudySessionHydrated, restoreStudySession, sessionStepPath, setActiveStudySession } from '../../lib/study-session'
import { cn } from '../../lib/utils'
import { buttonVariants } from '../ui/button-variants'
import { StatusScreen } from './page'

export function SessionGate() {
  const { studyId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [state, setState] = useState<{ id: string; status: 'ready' | 'error' } | null>(() =>
    studyId && isStudySessionHydrated(studyId) ? { id: studyId, status: 'ready' } : null,
  )

  useEffect(() => {
    if (!studyId) return
    setActiveStudySession(studyId)
    const basePath =
      location.pathname === `/sessions/${studyId}` || location.pathname === `/sessions/${studyId}/`
    if (isStudySessionHydrated(studyId) && !basePath) {
      return
    }
    let active = true
    void api
      .getStudySession(studyId)
      .then(restoreStudySession)
      .then((step) => {
        if (!active) return
        setState({ id: studyId, status: 'ready' })
        const stages = ['upload', 'goal', 'preparing', 'practice', 'results']
        const segments = location.pathname.split('/').filter(Boolean)
        const requested = segments.at(-1) ?? ''
        if (stages.indexOf(requested) > stages.indexOf(step) || basePath) {
          navigate(sessionStepPath(step, studyId), { replace: true })
        }
      })
      .catch(() => {
        if (active) setState({ id: studyId, status: 'error' })
      })
    return () => {
      active = false
    }
  }, [studyId, location.pathname, navigate])

  if (!state || state.id !== studyId) return <StatusScreen>Opening your session…</StatusScreen>
  if (state.status === 'error') {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas px-6 text-ink">
        <div className="w-full max-w-md">
          <h1 className="border-b-2 border-rule pb-4 font-serif text-4xl italic">Session unavailable</h1>
          <p className="mt-4 text-ink/70">We couldn’t open this session right now. It may have been removed, or the connection dropped.</p>
          <Link to="/sessions" className={cn(buttonVariants(), 'mt-8')}>
            <ArrowLeft aria-hidden="true" /> Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }
  return <Outlet />
}
