import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { LandingPage } from './pages/landing-page'
import { UploadPage } from './pages/upload-page'
import { GoalPage } from './pages/goal-page'
import { PreparingPage } from './pages/preparing-page'
import { PracticePage } from './pages/practice-page'
import { ResultsPage } from './pages/results-page'
import { SprintPlaceholderPage } from './pages/sprint-placeholder-page'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
})

function NotFoundPage() {
  return <SprintPlaceholderPage title="Page not found" description="Let’s get you back to your learning flow." />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/goal" element={<GoalPage />} />
          <Route path="/preparing" element={<PreparingPage />} />
          <Route path="/practice" element={<PracticePage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
