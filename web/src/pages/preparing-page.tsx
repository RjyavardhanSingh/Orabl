import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Progress from '@radix-ui/react-progress'
import { ArrowLeft, ArrowRight, LoaderCircle, RefreshCw, Sparkles } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { AppShell, EmptyState, PageHeader } from '../components/layout/app-shell'
import { Alert } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { api, ApiError, type LearningContext, type QuestionList } from '../lib/api'
import { activeStudySessionId, sessionStepPath } from '../lib/study-session'

function readContext(): LearningContext | null {
  const stored = window.sessionStorage.getItem('recall.context')
  return stored ? (JSON.parse(stored) as LearningContext) : null
}

export function PreparingPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { studyId } = useParams()
  const currentStudyId = studyId || activeStudySessionId()
  const context = readContext()
  const { data, isLoading } = useQuery({
    queryKey: ['questions', context?.id],
    queryFn: () => api.getQuestions(context?.id ?? ''),
    enabled: Boolean(context?.id),
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.status === 'pending' || query.state.data?.status === 'running'
        ? 2000 : false,
  })

  const generate = useMutation({
    mutationFn: () => api.generateQuestions(context?.id ?? '', 5),
    onSuccess: (result) => {
      queryClient.setQueryData<QuestionList>(['questions', context?.id], result)
    },
    onError: (error) => {
      const message = error instanceof ApiError ? error.message : 'Question generation failed.'
      toast.error(message)
    },
  })

  const startPractice = useMutation({
    mutationFn: () => api.createSession(context?.id ?? ''),
    onSuccess: async (session) => {
      window.sessionStorage.setItem('recall.session', JSON.stringify(session))
      if (currentStudyId) {
        try { await api.updateStudySession(currentStudyId, { practice_id: session.id }) }
        catch { toast.error('Could not save practice progress. Please try again.'); return }
      }
      navigate(sessionStepPath('practice', currentStudyId))
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not start practice.')
    },
  })

  const visible = data?.status === 'ready' || !data?.status ? (data?.questions ?? []) : []
  const preparing = data?.status === 'pending' || data?.status === 'running'
  const busy = generate.isPending || startPractice.isPending || preparing

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
              <Link to={sessionStepPath('upload', currentStudyId)}>
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
      <div className="workflow-page mx-auto flex h-full min-h-0 w-full max-w-[52rem] flex-col px-5 pb-4 pt-5 sm:px-8 sm:pt-7">
        <PageHeader
          title="Let's Make This Yours"
          description="We turn your material and goal into a focused set of practice questions."
          action={
            visible.length > 0 ? (
              <Badge className="tabular">{visible.length} Ready</Badge>
            ) : null
          }
        />

        {busy || isLoading ? (
          <Progress.Root value={null} aria-label="Preparing questions" className="mt-6 h-1.5 w-full shrink-0 overflow-hidden rounded-full bg-sunk">
            <Progress.Indicator className="block h-full w-1/3 animate-pulse rounded-full bg-accent" />
          </Progress.Root>
        ) : null}

        <div className="mt-5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-sunk px-5 sm:px-7">
          <div className="scroll-area min-h-0 flex-1 py-6 pr-1">
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
              <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong p-8 text-center">
                <p className="text-pretty mt-4 text-sm font-semibold">
                  {preparing ? 'Preparing your questions…' : 'Your questions will appear here.'}
                </p>
                <p className="text-pretty mt-2 max-w-xs text-xs leading-5 text-ink-muted">
                  {preparing
                    ? 'You can leave this page and resume this session later. We’ll save the set when it’s ready.'
                    : 'Generate a small practice set based on your material and goal.'}
                </p>
              </div>
            ) : null}

            {visible.length > 0 ? (
              <ol className="divide-y divide-line border-t border-line">
                {visible.map((question, index) => (
                  <li
                    key={question.id ?? `${question.text}-${index}`}
                    className="flex min-w-0 gap-5 py-5"
                  >
                    <span className="tabular grid size-6 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-bold text-canvas">
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
            {data?.status === 'failed' ? (
              <Alert className="mt-4">{data.error || 'Question generation failed. Please try again.'}</Alert>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-line py-4 sm:flex-row sm:items-center sm:justify-between">
            <Button asChild variant="ghost" className="disabled:pointer-events-none disabled:opacity-50 rounded-xl">
              <Link to={sessionStepPath('goal', currentStudyId)} aria-disabled={busy || undefined}>
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
                className='bg-accent text-black hover:bg-accent-hover rounded-xl'
              >
                {startPractice.isPending ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    Starting…
                  </>
                ) : generate.isPending || preparing ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    Preparing…
                  </>
                ) : visible.length > 0 ? (
                  <>
                    Start Practice
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </>
                ) : (
                  <>
                    {data?.status === 'failed' ? 'Try Again' : 'Generate Questions'}
                    <Sparkles className="size-4" aria-hidden="true" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
