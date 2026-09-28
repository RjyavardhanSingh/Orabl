import { LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { Alert } from '../components/ui/alert'
import { ApiError } from '../lib/api'
import { exchangeCode, setAccessToken } from '../lib/auth'

/** Landing point for our Google OAuth: redeem the one-time code for a session. */
export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  // Provider-side rejection arrives as ?error= (Google said no, or the
  // backend refused the callback). Derived during render so a doomed
  // exchange doesn't overwrite it with a generic message.
  const oauthError = searchParams.get('error')
  // No code and no provider error (e.g. landed here directly): derived
  // during render, not setState-in-effect.
  const code = oauthError ? null : searchParams.get('code')
  // One redemption attempt per mount. StrictMode remounts effects in dev
  // (same refs), which would otherwise redeem the single-use code twice
  // and log a spurious 401 for the loser. A genuine remount (new instance)
  // gets a fresh ref and may retry.
  const attemptedRef = useRef(false)

  useEffect(() => {
    if (!code || attemptedRef.current) return
    attemptedRef.current = true
    // NOTE: no `cancelled` early-return on success. StrictMode remounts
    // this effect (retiring the first run), so a cancelled check would drop
    // a successful redemption into an infinite spinner. Completing the
    // login must always store the token and navigate; setState-after-unmount
    // is a harmless no-op in React 18+.
    exchangeCode(code)
      .then(({ token }) => {
        setAccessToken(token)
        const next = searchParams.get('next')
        const destination =
          next && next.startsWith('/') && !next.startsWith('//') ? next : '/upload'
        navigate(destination, { replace: true })
      })
      .catch((err: unknown) => {
        setError(
          err instanceof ApiError ? err.message : 'Sign-in did not complete. Please try again.',
        )
      })
  }, [navigate, searchParams, code])

  const displayError =
    error ??
    (oauthError
      ? 'Google sign-in was rejected. Please try again.'
      : code
        ? null
        : 'Sign-in did not complete. Please try again.')

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center px-4 text-center">
        {displayError ? (
          <>
            <Alert>{displayError}</Alert>
            <Link
              to="/signin"
              className="mt-6 text-sm font-semibold text-ink underline-offset-4 hover:underline"
            >
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <LoaderCircle className="size-6 animate-spin text-ink-muted" aria-hidden="true" />
            <p className="mt-4 text-sm text-ink-muted">Finishing sign in…</p>
          </>
        )}
      </div>
    </div>
  )
}
