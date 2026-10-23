import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Progress from '@radix-ui/react-progress'
import { ArrowLeft, ArrowRight, LoaderCircle, RefreshCw, Sparkles } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import {
  LedgerCard,
  ledgerAlertClass,
  ledgerLabelClass,
  ledgerPrimaryButtonClass,
  ledgerSecondaryButtonClass,
} from '../components/layout/ledger-card'
import { Alert } from '../components/ui/alert'
import { api, ApiError, type LearningContext, type QuestionList } from '../lib/api'
import { activeStudySessionId, sessionStepPath } from '../lib/study-session'
import { cn } from '../lib/utils'

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
    // Practice reads both the session and its question list from storage; storing only the
    // session left it on "No Active Practice Session" until a reload re-hydrated the questions.
    mutationFn: async () => {
      const session = await api.createSession(context?.id ?? '')
      const { questions } = await api.getSessionQuestions(session.id)
      return { session, questions }
    },
    onSuccess: async ({ session, questions }) => {
      window.sessionStorage.setItem('recall.session', JSON.stringify(session))
      window.sessionStorage.setItem('recall.questions', JSON.stringify(questions))
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
      <LedgerCard
        step={3}
        label="Prepare"
        title="Your Context Is Missing"
        description="Start again by uploading a material and setting your goal."
        compact
      >
        <Link to={sessionStepPath('upload', currentStudyId)} className={ledgerPrimaryButtonClass}>
          Start Over
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </LedgerCard>
    )
  }

  return (
    <LedgerCard
      step={3}
      label="Prepare"
      title="Let's Make This Yours"
      description="We turn your material and goal into a focused set of practice questions."
      compact
    >
      {busy || isLoading ? (
        <Progress.Root value={null} aria-label="Preparing questions" className="mb-4 h-1 w-full overflow-hidden rounded-sm bg-[#EBE5D9]/10">
          <Progress.Indicator className="block h-full w-1/3 animate-pulse rounded-sm bg-[#EBE5D9]" />
        </Progress.Root>
      ) : null}

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-[#EBE5D9]/70" role="status">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Looking for saved questions…
        </p>
      ) : null}

      {!isLoading && visible.length === 0 ? (
        <div className="flex h-48 w-full flex-col items-center justify-center rounded-sm border border-dashed border-[#EBE5D9]/30 bg-[#EBE5D9]/5 px-6 text-center md:h-64">
          <p className="mb-1 font-sans text-sm font-bold text-[#EBE5D9]">
            {preparing ? 'Preparing your questions…' : 'Your questions will appear here.'}
          </p>
          <p className="max-w-xs text-center font-sans text-xs text-[#EBE5D9]/50">
            {preparing
              ? 'You can leave this page and resume this session later. We’ll save the set when it’s ready.'
              : 'Generate a small practice set based on your material and goal.'}
          </p>
        </div>
      ) : null}

      {visible.length > 0 ? (
        <>
          <p className={ledgerLabelClass}>
            <span className="tabular">{visible.length}</span> questions ready
          </p>
          {/* Same fixed-height footprint as the empty state; the set scrolls inside the locked card. */}
          <ol className="h-48 divide-y divide-[#EBE5D9]/15 overflow-y-auto rounded-sm border border-[#EBE5D9] px-4 [scrollbar-color:rgb(235_229_217/0.2)_transparent] [scrollbar-width:thin] md:h-64">
            {visible.map((question, index) => (
              <li key={question.id ?? `${question.text}-${index}`} className="flex min-w-0 gap-4 py-3">
                <span className="tabular grid size-6 shrink-0 place-items-center rounded-sm bg-[#EBE5D9] text-[11px] font-bold text-[#451017]">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-pretty break-words text-sm font-medium leading-6 text-[#EBE5D9]">{question.text}</p>
                  {question.topic ? (
                    <p className="mt-1 truncate text-xs text-[#EBE5D9]/50">{question.topic}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </>
      ) : null}

      {generate.isError ? (
        <Alert className={cn('mt-4', ledgerAlertClass)}>
          {generate.error instanceof ApiError
            ? generate.error.message
            : 'Question generation failed. Check that the API is running, then retry.'}
        </Alert>
      ) : null}
      {data?.status === 'failed' ? (
        <Alert className={cn('mt-4', ledgerAlertClass)}>{data.error || 'Question generation failed. Please try again.'}</Alert>
      ) : null}

      <div className="mt-6 flex w-full flex-col-reverse gap-4 border-t border-[#EBE5D9]/10 pt-4 md:flex-row md:items-center md:justify-between">
        <Link
          to={sessionStepPath('goal', currentStudyId)}
          aria-disabled={busy || undefined}
          className="flex items-center gap-2 font-sans text-sm font-medium text-[#EBE5D9]/60 transition-colors hover:text-[#EBE5D9] aria-disabled:pointer-events-none aria-disabled:opacity-50"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Goal
        </Link>
        <div className="flex flex-col gap-3 md:flex-row">
          {visible.length > 0 ? (
            <button
              type="button"
              onClick={() => generate.mutate()}
              disabled={busy}
              className={ledgerSecondaryButtonClass}
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
            </button>
          ) : null}
          <button
            type="button"
            onClick={() =>
              visible.length > 0 ? startPractice.mutate() : generate.mutate()
            }
            disabled={busy}
            className={ledgerPrimaryButtonClass}
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
          </button>
        </div>
      </div>
    </LedgerCard>
  )
}
