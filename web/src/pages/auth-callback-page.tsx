import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { StatusScreen } from '../components/layout/page'
import { Alert } from '../components/ui/alert'
import { buttonVariants } from '../components/ui/button-variants'
import { ApiError } from '../lib/api'
import { exchangeCode, setAccessToken } from '../lib/auth'
import { useAuthStore } from '../lib/auth-state'

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
      .then(({ token, user }) => {
        setAccessToken(token)
        // Sync the store: it still says 'out' from boot (no token then),
        // and nothing else re-validates — without this, RequireAuth bounces
        // straight back to /signin. The profile ships with the exchange, so
        // no extra /me round-trip.
        useAuthStore.setState({ user, status: 'in' })
        const next = searchParams.get('next')
        const destination =
          next && next.startsWith('/') && !next.startsWith('//') && next !== '/' ? next : '/sessions'
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

  if (displayError) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas px-6 text-ink">
        <div className="w-full max-w-sm">
          <h1 className="border-b-2 border-rule pb-4 font-serif text-4xl italic">Sign-in stopped</h1>
          <Alert className="mt-6 rounded-lg border-ink/30 bg-ink/5 text-ink">{displayError}</Alert>
          <Link to="/signin" className={buttonVariants({}, 'mt-8')}>
            Back to Sign In
          </Link>
        </div>
      </div>
    )
  }

  return <StatusScreen>Signing you in…</StatusScreen>
}
