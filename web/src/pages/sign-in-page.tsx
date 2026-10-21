import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { LoaderCircle } from 'lucide-react'

import bustImage from '../assets/ascii-bust.png'
import { Alert } from '../components/ui/alert'
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
    <div className="flex min-h-screen w-full flex-col lg:flex-row">
      {/* Left: the poster. Desktop only; the form stands alone on mobile. */}
      <div
        className="relative hidden w-full items-center justify-center overflow-hidden bg-[#451017] p-12 lg:flex lg:w-1/2"
        aria-hidden="true"
      >
        <div className="flex h-full w-full items-center justify-center">
          {/* Light glyphs on a transparent ground, so the bust sits straight on
              the maroon. Capped to the viewport height so it never crops. */}
          <img
            src={bustImage}
            alt=""
            width={1122}
            height={1402}
            className="pointer-events-none max-h-[calc(100vh-6rem)] w-auto max-w-full select-none object-contain opacity-80"
            draggable={false}
          />
        </div>
        <div className="absolute bottom-12 left-12 font-serif text-2xl text-[#EBE5D9]">Orabl</div>
      </div>

      {/* Right: the form. */}
      <div className="flex min-h-screen w-full items-center justify-center bg-[#EBE5D9] p-8 lg:w-1/2 lg:p-24">
        <div className="flex w-full max-w-md flex-col gap-8">
          <div className="flex flex-col gap-4">
            <h1 className="font-serif text-5xl leading-tight tracking-tight text-[#451017] lg:text-6xl">
              Welcome to Orabl.
            </h1>
            <p className="font-sans text-sm text-[#451017]/70">
              Your ideas are worth saying out loud. Sign in to start a session.
            </p>
          </div>

          <div className="border-t border-[#451017]/20" />

          <div>
            {error ? <Alert className="mb-4">{error}</Alert> : null}
            <button
              type="button"
              disabled={googlePending}
              onClick={handleGoogle}
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-black px-6 py-4 font-sans font-medium text-white transition-colors duration-150 hover:bg-[#451017] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#451017] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {googlePending ? (
                <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
              ) : (
                <GoogleIcon />
              )}
              Continue with Google
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <p className="font-sans text-xs uppercase tracking-wider text-[#451017]/60">
              Your study material stays private to your account.
            </p>
            <Link
              to="/"
              className="self-start font-sans text-xs uppercase tracking-wider text-[#451017]/60 transition-colors hover:text-[#451017]"
            >
              ← Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

// Standard multi-color Google "G", sized to sit beside the button label.
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  )
}
