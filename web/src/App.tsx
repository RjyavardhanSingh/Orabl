import { Suspense, lazy } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { RequireAuth, AuthProvider } from './lib/auth-state'
import { LedgerFlow } from './components/layout/ledger-flow'
import { SessionGate } from './components/layout/session-gate'

// Keep the public marketing animation out of the authenticated dashboard bundle.
import { SprintPlaceholderPage } from './pages/sprint-placeholder-page'

const LandingPage = lazy(() => import('./pages/landing-page').then((m) => ({ default: m.LandingPage })))

// The ledger steps slide between each other, so loading any one prefetches them all (plus the
// Results page the flow ends on): a chunk fetched mid-slide would suspend the whole app.
const loadUploadPage = () => import('./pages/upload-page')
const loadGoalPage = () => import('./pages/goal-page')
const loadPreparingPage = () => import('./pages/preparing-page')
const loadPracticePage = () => import('./pages/practice-page')
const loadResultsPage = () => import('./pages/results-page')
const prefetchLedgerSteps = () => {
  void loadUploadPage()
  void loadGoalPage()
  void loadPreparingPage()
  void loadPracticePage()
  void loadResultsPage()
}
const UploadPage = lazy(() => {
  prefetchLedgerSteps()
  return loadUploadPage().then((m) => ({ default: m.UploadPage }))
})
const GoalPage = lazy(() => {
  prefetchLedgerSteps()
  return loadGoalPage().then((m) => ({ default: m.GoalPage }))
})
const PreparingPage = lazy(() => {
  prefetchLedgerSteps()
  return loadPreparingPage().then((m) => ({ default: m.PreparingPage }))
})
const PracticePage = lazy(() => {
  prefetchLedgerSteps()
  return loadPracticePage().then((m) => ({ default: m.PracticePage }))
})
const ResultsPage = lazy(() => loadResultsPage().then((m) => ({ default: m.ResultsPage })))
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
              <Route element={<LedgerFlow />}>
                <Route path="upload" element={<UploadPage />} />
                <Route path="goal" element={<GoalPage />} />
                <Route path="preparing" element={<PreparingPage />} />
                <Route path="practice" element={<PracticePage />} />
              </Route>
              {/* Results is a full dashboard-style page, outside the sliding flow. */}
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
