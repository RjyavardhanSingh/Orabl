import { Suspense, lazy } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { LoaderCircle } from 'lucide-react'

import { RequireAuth, AuthProvider } from './lib/auth-state'

// Route-level code splitting: each page (+ its heavy deps: gsap, motion,
// elevenlabs, animated canvases) loads on first visit instead of bloating
// the initial bundle. Landing is the only eager route.
import { LandingPage } from './pages/landing-page'
import { SprintPlaceholderPage } from './pages/sprint-placeholder-page'

const UploadPage = lazy(() =>
  import('./pages/upload-page').then((m) => ({ default: m.UploadPage })),
)
const GoalPage = lazy(() => import('./pages/goal-page').then((m) => ({ default: m.GoalPage })))
const PreparingPage = lazy(() =>
  import('./pages/preparing-page').then((m) => ({ default: m.PreparingPage })),
)
const PracticePage = lazy(() =>
  import('./pages/practice-page').then((m) => ({ default: m.PracticePage })),
)
const ResultsPage = lazy(() =>
  import('./pages/results-page').then((m) => ({ default: m.ResultsPage })),
)
const SignInPage = lazy(() =>
  import('./pages/sign-in-page').then((m) => ({ default: m.SignInPage })),
)
const AuthCallbackPage = lazy(() =>
  import('./pages/auth-callback-page').then((m) => ({ default: m.AuthCallbackPage })),
)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
})

function NotFoundPage() {
  return <SprintPlaceholderPage title="Page not found" description="Let’s get you back to your learning flow." />
}

function RouteFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas">
      <LoaderCircle className="size-6 animate-spin text-ink-muted" aria-hidden="true" />
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/upload" element={<RequireAuth><UploadPage /></RequireAuth>} />
            <Route path="/goal" element={<RequireAuth><GoalPage /></RequireAuth>} />
            <Route path="/preparing" element={<RequireAuth><PreparingPage /></RequireAuth>} />
            <Route path="/practice" element={<RequireAuth><PracticePage /></RequireAuth>} />
            <Route path="/results" element={<RequireAuth><ResultsPage /></RequireAuth>} />
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
