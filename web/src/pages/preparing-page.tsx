import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, LoaderCircle, RefreshCw, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { MultiStepLoader } from '../components/ui/multi-step-loader'


import { AppShell, EmptyState, PageHeader } from '../components/layout/app-shell'
import { Alert } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { api, ApiError, type LearningContext, type Question } from '../lib/api'

const GENERATION_STEPS = ['Request sent', 'LLM working', 'Questions received']

const WAITING_TEXTS = [
  'Contacting the model…',
  'Still working — free-tier queues can take a minute.',
  'While you wait: picture one idea from your notes and say it back.',
]

type LoaderPhase = { status: 'loading' } | { status: 'success' } | { status: 'error'; message: string }

function readContext(): LearningContext | null {
  const stored = window.sessionStorage.getItem('recall.context')
  return stored ? (JSON.parse(stored) as LearningContext) : null
}

export function PreparingPage() {
  const navigate = useNavigate()
  const context = readContext()
  // No sessionStorage hydration: the GET below is the single source of
  // truth. Hydrating from storage resurrected questions the backend had
  // invalidated (e.g. after a goal edit), so the page showed a question
  // list while "Let's Go Champ" failed with 404 — a lying button.
  const [generated, setGenerated] = useState<Question[]>([])
  const [loader, setLoader] = useState<LoaderPhase | null>(null)
  // Fresh loader state per run (flip index resets via remount).
  const [runId, setRunId] = useState(0)
  // Minimum time the loading phase stays visible so each truth step is
  // perceivable — fast responses would otherwise flash past unreadably.
  // Only the success reveal is held; completions still fire on real events.
  const MIN_DWELL_MS = 2000
  const runStartedAt = useRef<number>(0)
  // Staging timer: step 0 ("Request sent") starts active (spinner) and
  // reveals its check shortly after — the dispatch already happened, the
  // beat only lets the eye witness it. Skipped if success lands first.
  const stepTimer = useRef<number | null>(null)
  // Truth-owned completion count: 1 on dispatch (request sent), all on
  // parsed response. Nothing else moves a checkmark.
  const [completedSteps, setCompletedSteps] = useState(0)
  const successTimer = useRef<number | null>(null)

  // Success auto-dismiss + staging cleanup on unmount.
  useEffect(
    () => () => {
      if (successTimer.current !== null) window.clearTimeout(successTimer.current)
      if (stepTimer.current !== null) window.clearTimeout(stepTimer.current)
    },
    [],
  )

  const { data, isLoading } = useQuery({
    queryKey: ['questions', context?.id],
    queryFn: () => api.getQuestions(context?.id ?? ''),
    enabled: Boolean(context?.id),
    retry: false,
  })

  const generate = useMutation({
    mutationFn: () => api.generateQuestions(context?.id ?? '', 5),
    onMutate: () => {
      if (successTimer.current !== null) window.clearTimeout(successTimer.current)
      if (stepTimer.current !== null) window.clearTimeout(stepTimer.current)
      setRunId((id) => id + 1)
      runStartedAt.current = Date.now()
      setCompletedSteps(0)
      stepTimer.current = window.setTimeout(() => {
        setCompletedSteps((done) => (done === 0 ? 1 : done))
      }, 700)
      setLoader({ status: 'loading' })
    },
    onSuccess: (result) => {
      const reveal = () => {
        setGenerated(result.questions)
        window.sessionStorage.setItem('recall.questions', JSON.stringify(result.questions))
        toast.success(
          `${result.questions.length} practice questions are ready.`,
        )
        setCompletedSteps(GENERATION_STEPS.length)
        setLoader({ status: 'success' })
        successTimer.current = window.setTimeout(() => setLoader(null), 1600)
      }
      const elapsed = Date.now() - runStartedAt.current
      if (elapsed < MIN_DWELL_MS) {
        successTimer.current = window.setTimeout(reveal, MIN_DWELL_MS - elapsed)
      } else {
        reveal()
      }
    },
    onError: (error) => {
      const message = error instanceof ApiError ? error.message : 'Question generation failed.'
      setLoader({ status: 'error', message })
      toast.error(message)
    },
  })

  const startPractice = useMutation({
    mutationFn: () => api.createSession(context?.id ?? ''),
    onSuccess: (session) => {
      window.sessionStorage.setItem('recall.session', JSON.stringify(session))
      navigate('/practice')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not start practice.')
    },
  })

  const visible = generated.length > 0 ? generated : (data?.questions ?? [])
  const busy = generate.isPending || startPractice.isPending

  if (!context) {
    return (
      <AppShell>
        <EmptyState
          // icon={
          //   <img
          //     src={AppLogoUrl}
          //     alt=""
          //     aria-hidden="true"
          //     className="size-8 rounded-lg object-cover"
          //   />
          // }
          title="Your Context Is Missing"
          description="Start again by uploading a material and setting your goal."
          action={
            <Button asChild>
              <Link to="/upload">
                Start Over
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          }
        />
      </AppShell>
    )
  }

  return (
    <AppShell>
      <MultiStepLoader
        key={runId}
        open={loader !== null}
        steps={GENERATION_STEPS}
        status={loader?.status ?? 'loading'}
        completedCount={completedSteps}
        waitingIndex={completedSteps === 0 ? 0 : 1}
        waitingTexts={WAITING_TEXTS}
        errorMessage={loader?.status === 'error' ? loader.message : undefined}
        successText={`${generated.length > 0 ? generated.length : 5} questions ready`}
        onRetry={() => generate.mutate()}
        onClose={() => setLoader(null)}
      />
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-4 pb-5 pt-5 sm:px-6 sm:pt-6 lg:px-8">
        <PageHeader
          title="Let's Make This Yours"
          description="We turn your material and goal into a focused set of practice questions."
          action={
            visible.length > 0 ? (
              <Badge className="tabular">{visible.length} Ready</Badge>
            ) : null
          }
        />

        <Card className="mt-5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xs">
          <CardContent className="scroll-area min-h-0 flex-1 p-5">
            {isLoading ? (
              <p
                className="flex items-center gap-2 text-sm text-ink-muted"
                role="status"
              >
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                Looking for saved questions…
              </p>
            ) : null}

            {!isLoading && visible.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong p-8 text-center">
                <p className="text-pretty mt-4 text-sm font-semibold">
                  Your questions will appear here.
                </p>
                <p className="text-pretty mt-2 max-w-xs text-xs leading-5 text-ink-muted">
                  Generate a small practice set based on your material and goal.
                </p>
              </div>
            ) : null}

            {visible.length > 0 ? (
              <ol className="space-y-2.5">
                {visible.map((question, index) => (
                  <li
                    key={question.id ?? `${question.text}-${index}`}
                    className="flex min-w-0 gap-3 rounded-xl border border-line p-4"
                  >
                    <span className="tabular grid size-6 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-bold text-white">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-pretty break-words text-sm font-medium leading-6 text-ink">
                        {question.text}
                      </p>
                      {question.topic ? (
                        <p className="mt-1.5 truncate text-xs text-ink-faint">{question.topic}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : null}

            {generate.isError ? (
              <Alert className="mt-4">
                {generate.error instanceof ApiError
                  ? generate.error.message
                  : 'Question generation failed. Check that the API is running, then retry.'}
              </Alert>
            ) : null}
          </CardContent>

          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-sunk p-5 sm:flex-row sm:items-center sm:justify-between">
            <Button asChild variant="ghost" className="disabled:pointer-events-none disabled:opacity-50 rounded-xl">
              <Link to="/goal" aria-disabled={busy || undefined}>
                <ArrowLeft className="size-4" aria-hidden="true" />
                Back to Goal
              </Link>
            </Button>
            <div className="flex flex-col gap-2 sm:flex-row">
              {visible.length > 0 ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => generate.mutate()}
                  disabled={busy}
                  className="rounded-xl"
                >
                  {generate.isPending ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                      Regenerating…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="size-4" aria-hidden="true" />
                      Regenerate
                    </>
                  )}
                </Button>
              ) : null}
              <Button
                type="button"
                onClick={() =>
                  visible.length > 0 ? startPractice.mutate() : generate.mutate()
                }
                disabled={busy}
                className='bg-green-900 hover:bg-green-800 rounded-xl'
              >
                {startPractice.isPending ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    Starting…
                  </>
                ) : generate.isPending ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    Creating…
                  </>
                ) : visible.length > 0 ? (
                  <>
                    Let’s Go, Champ
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </>
                ) : (
                  <>
                    Generate Questions
                    <Sparkles className="size-4" aria-hidden="true" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  )
}
