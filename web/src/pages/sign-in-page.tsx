import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { LoaderCircle } from 'lucide-react'

import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { PublicBrand } from '../components/layout/public-nav'
import { ApiError } from '../lib/api'
import { getGoogleAuthUrl } from '../lib/auth'
import { useAuth } from '../lib/auth-state'

export function SignInPage() {
  const navigate = useNavigate()
  const { status } = useAuth()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [googlePending, setGooglePending] = useState(false)

  const next = searchParams.get('next')
  const destination =
    next && next.startsWith('/') && !next.startsWith('//') && next !== '/' ? next : '/sessions'

  useEffect(() => {
    if (status === 'in') {
      navigate(destination, { replace: true })
    }
  }, [status, destination, navigate])

  async function handleGoogle() {
    setError(null)
    setGooglePending(true)
    try {
      const url = await getGoogleAuthUrl(destination)
      window.location.href = url
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Google sign-in failed. Please try again.')
      setGooglePending(false)
    }
  }

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col justify-center px-4 py-10 sm:px-8">
        <div className="mx-auto flex w-full max-w-sm flex-col items-center">
          <PublicBrand />
          <div className="mt-10 w-full border-t border-line-strong pt-8">
            <h1 className="font-display text-4xl">Welcome to Orabl.</h1>
            <p className="mt-3 text-sm leading-6 text-ink-muted">Your ideas are worth saying out loud. Sign in to start a session.</p>
            <div className="mt-8">
              {error ? <Alert className="mb-4">{error}</Alert> : null}
              <Button
                type="button"
                variant="secondary"
                disabled={googlePending}
                onClick={handleGoogle}
                className="w-full rounded-xl bg-accent text-black hover:bg-accent-hover hover:text-white"
              >
                {googlePending ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <span aria-hidden="true" className="text-base font-bold leading-none">
                    G
                  </span>
                )}
                Continue with Google
              </Button>
            </div>
          </div>
          <p className="mt-6 text-center text-xs leading-5 text-ink-faint">
            Your study material stays private to your account.
          </p>
          <div className="mt-6 text-center">
            <Link to="/" className="text-xs text-ink-muted transition-colors hover:text-white">
              ← Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
