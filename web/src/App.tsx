import { Suspense, lazy } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { RequireAuth, AuthProvider } from './lib/auth-state'
import { SessionGate } from './components/layout/session-gate'

// Keep the public marketing animation out of the authenticated dashboard bundle.
import { SprintPlaceholderPage } from './pages/sprint-placeholder-page'

const LandingPage = lazy(() => import('./pages/landing-page').then((m) => ({ default: m.LandingPage })))

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
const SessionsPage = lazy(() =>
  import('./pages/sessions-page').then((m) => ({ default: m.SessionsPage })),
)
const SettingsPage = lazy(() =>
  import('./pages/settings-page').then((m) => ({ default: m.SettingsPage })),
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
  return <div className="grid min-h-dvh place-items-center bg-canvas px-6 text-sm text-ink-muted" role="status">Opening Orabl…</div>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/about" element={<LandingPage />} />
            <Route path="/sessions" element={<RequireAuth><SessionsPage /></RequireAuth>} />
            <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
            <Route path="/sessions/:studyId" element={<RequireAuth><SessionGate /></RequireAuth>}>
              <Route index element={<div className="grid h-dvh place-items-center bg-canvas text-sm text-ink-muted" role="status">Opening your session…</div>} />
              <Route path="upload" element={<UploadPage />} />
              <Route path="goal" element={<GoalPage />} />
              <Route path="preparing" element={<PreparingPage />} />
              <Route path="practice" element={<PracticePage />} />
              <Route path="results" element={<ResultsPage />} />
            </Route>
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
