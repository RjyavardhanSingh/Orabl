import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LoaderCircle } from 'lucide-react'

import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { PublicBrand } from '../components/layout/public-nav'
import { ApiError } from '../lib/api'
import { getGoogleAuthUrl } from '../lib/auth'

export function SignInPage() {
  const [searchParams] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [googlePending, setGooglePending] = useState(false)

  async function handleGoogle() {
    setError(null)
    setGooglePending(true)
    try {
      const next = searchParams.get('next')
      const destination =
        next && next.startsWith('/') && !next.startsWith('//') ? next : '/upload'
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
          <Card className="mt-8 w-full">
            <CardHeader>
              <CardTitle>Welcome</CardTitle>
              <CardDescription>Sign in with Google to start learning out loud.</CardDescription>
            </CardHeader>
            <CardContent>
              {error ? <Alert className="mb-4">{error}</Alert> : null}
              <Button
                type="button"
                variant="secondary"
                disabled={googlePending}
                onClick={handleGoogle}
                className="w-full rounded-xl bg-green-900 text-canvas hover:bg-green-800 hover:text-surface"
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
            </CardContent>
          </Card>
          <p className="mt-6 text-center text-xs leading-5 text-ink-faint">
            Your study material stays private to your account.
          </p>
        </div>
      </div>
    </div>
  )
}
