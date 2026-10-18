import { useMutation } from '@tanstack/react-query'
import * as Accordion from '@radix-ui/react-accordion'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  ChevronDown,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Target,
  Trophy,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { AppShell, EmptyState, PageHeader } from '../components/layout/app-shell'
import { Alert } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { api, ApiError, type Question, type SessionResults, type TopicBreakdown } from '../lib/api'
import { activeStudySessionId, sessionStepPath } from '../lib/study-session'
import { cn } from '../lib/utils'

const WEAK_THRESHOLD = 60

function readResults(): SessionResults | null {
  const stored = window.sessionStorage.getItem('recall.results')
  return stored ? (JSON.parse(stored) as SessionResults) : null
}

function scoreTone(score: number | null): string {
  if (score === null) return 'bg-sunk text-ink-muted'
  if (score > WEAK_THRESHOLD) return 'bg-ink text-canvas'
  return 'bg-warn-tint text-warn'
}

function isWeak(data: TopicBreakdown): boolean {
  return data.status === 'needs_work' || data.average_score <= WEAK_THRESHOLD
}

function ReportSection({
  icon,
  title,
  count,
  children,
  tone = 'default',
  className,
}: {
  icon: React.ReactNode
  title: string
  count?: number
  children: React.ReactNode
  tone?: 'default' | 'muted'
  className?: string
}) {
  return (
    <section className={cn('rounded-2xl border border-line bg-sunk p-5', className)}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              'shrink-0',
              tone === 'muted' ? 'text-ink-faint' : 'text-ink',
            )}
          >
            {icon}
          </span>
          <h2 className="text-pretty truncate text-sm font-semibold tracking-tight">{title}</h2>
        </div>
        {typeof count === 'number' ? (
          <Badge className="tabular shrink-0">{count}</Badge>
        ) : null}
      </div>
      <div className="pt-5">{children}</div>
    </section>
  )
}

export function ResultsPage() {
  const navigate = useNavigate()
  const { studyId } = useParams()
  const currentStudyId = studyId || activeStudySessionId()
  const [results, setResults] = useState<SessionResults | null>(readResults)
  const [expired, setExpired] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  async function handleSave() {
    if (!results || results.is_saved || isSaving) return
    setIsSaving(true)
    try {
      await api.saveSession(results.id)
      const saved = { ...results, is_saved: true }
      setResults(saved)
      try {
        window.sessionStorage.setItem('recall.results', JSON.stringify(saved))
      } catch {
        // storage full/blocked — session continues in memory
      }
      toast.success('Session saved. Find it under your profile.')
      navigate('/sessions')
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not save this session.')
    } finally {
      setIsSaving(false)
    }
  }

  const retest = useMutation({
    mutationFn: (weakOnly: boolean) =>
      api.createRetest(results?.id ?? '', { weak_only: weakOnly }),
    onSuccess: async (retestSession) => {
      window.sessionStorage.setItem(
        'recall.session',
        JSON.stringify({
          id: retestSession.id,
          context_id: retestSession.context_id,
          question_count: retestSession.question_count,
          current_index: 0,
          status: retestSession.status,
          pending_count: 0,
          scored_count: 0,
        }),
      )
      window.sessionStorage.setItem('recall.questions', JSON.stringify(retestSession.questions))
      if (currentStudyId) {
        try { await api.updateStudySession(currentStudyId, { practice_id: retestSession.id }) }
        catch { toast.error('Could not save retest progress. Try again.'); return }
      }
      navigate(sessionStepPath('practice', currentStudyId))
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 410) {
        setExpired(true)
        return
      }
      toast.error(error instanceof ApiError ? error.message : 'Could not start retest.')
    },
  })

  if (!results) {
    return (
      <AppShell>
        <EmptyState
          icon={<Trophy className="size-6" aria-hidden="true" />}
          title="No Results Yet"
          description="Complete a practice session to unlock your full report."
          action={
            <Button asChild className='rounded-xl'>
              <Link to={sessionStepPath('practice', currentStudyId)}>
                Back to Practice
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          }
        />
      </AppShell>
    )
  }

  const answersByIndex = new Map(results.answers.map((a) => [a.question_index, a]))
  const topics = Object.entries(results.topic_summary)
  const strongTopics = topics.filter(([, data]) => !isWeak(data))
  const weakTopics = topics.filter(([, data]) => isWeak(data))
  const mixUps = Array.from(
    new Set(topics.flatMap(([, data]) => data.misconceptions).map((m) => m.trim()).filter(Boolean)),
  )

  return (
    <AppShell>
      <div className="workflow-page mx-auto flex h-full min-h-0 w-full max-w-[80rem] flex-col px-5 pb-4 pt-5 sm:px-8 sm:pt-7 lg:px-12">
        <div className="mx-auto w-full max-w-6xl shrink-0">
          <PageHeader
            title="How You Did"
            description="Your readiness score, what to fix next, and the mix-ups that kept showing up."
            action={
              expired ? undefined : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="secondary"
                    disabled={retest.isPending || isSaving || results.is_saved}
                    onClick={handleSave}
                    className='rounded-xl'
                    title={results.is_saved ? 'Already saved' : 'Save this session'}
                  >
                    {isSaving ? (
                      <>
                        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                        Saving…
                      </>
                    ) : (
                      <>
                        <Bookmark className="size-4" aria-hidden="true" />
                        {results.is_saved ? 'Saved' : 'Save Session'}
                      </>
                    )}
                  </Button>
                  <Button
                    className="flex-1 bg-accent text-black hover:bg-accent-hover rounded-xl"
                    disabled={retest.isPending || weakTopics.length === 0}
                    onClick={() => retest.mutate(true)}
                  >
                    {retest.isPending ? (
                      <>
                        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                        Starting…
                      </>
                    ) : (
                      <>
                        <RotateCcw className="size-4" aria-hidden="true" />
                        Retest Weak Areas
                      </>
                    )}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={retest.isPending}
                    onClick={() => retest.mutate(false)}
                    className='rounded-xl'
                  >
                    <RefreshCw className="size-4" aria-hidden="true" />
                    Full Test Again
                  </Button>
                </div>
              )
            }
          />
          {expired ? (
            <Alert className="mt-4">
              This session’s 24-hour review window has closed. Generate a fresh practice set
              to keep going.
            </Alert>
          ) : null}
          {weakTopics.length === 0 && !expired ? (
            <p className="mt-3 text-xs text-ink-muted">
              No weak areas to retest — every topic cleared the bar.
            </p>
          ) : null}
          {retest.isError &&
          !(retest.error instanceof ApiError && retest.error.status === 410) ? (
            <Alert className="mt-4">
              {retest.error instanceof ApiError
                ? retest.error.message
                : 'Could not start retest. Try again in a moment.'}
            </Alert>
          ) : null}
        </div>

        <div className="scroll-area mx-auto mt-5 min-h-0 w-full max-w-6xl flex-1 lg:overflow-hidden">
          <div className="grid min-h-full items-start gap-4 pb-2 lg:h-full lg:min-h-0 lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)] lg:items-stretch">
            <div className="space-y-4 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pr-2">
              <section className="rounded-2xl border border-line bg-sunk p-5">
                <div className="flex items-center gap-5">
                  <span className="tabular grid size-20 shrink-0 place-items-center rounded-2xl bg-ink text-xl font-bold text-canvas">
                    {results.readiness_score}%
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <Trophy className="size-4 shrink-0" aria-hidden="true" />
                      Readiness Score
                    </p>
                    {results.next_review_suggestion ? (
                      <p className="text-pretty mt-1 text-sm leading-6 text-ink-muted">
                        {results.next_review_suggestion}
                      </p>
                    ) : null}
                  </div>
                </div>
              </section>

              <ReportSection
                icon={<CheckCircle2 className="size-4" aria-hidden="true" />}
                title="What’s Solid"
                count={strongTopics.length}
                tone={strongTopics.length === 0 ? 'muted' : 'default'}
              >
                {strongTopics.length === 0 ? (
                  <p className="text-sm text-ink-muted">
                    Nothing scored above {WEAK_THRESHOLD}% yet — everything needs work this round.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {strongTopics.map(([topic, data]) => (
                      <li
                        key={topic}
                        className="flex items-center justify-between gap-3 rounded-xl bg-surface px-3.5 py-2.5"
                      >
                        <span className="min-w-0 truncate text-sm font-medium">{topic}</span>
                        <span className="tabular shrink-0 text-sm font-semibold text-good">
                          {data.average_score}%
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </ReportSection>

              <ReportSection
                icon={<Target className="size-4" aria-hidden="true" />}
                title="What to Fix"
                count={weakTopics.length}
              >
                {weakTopics.length === 0 ? (
                  <p className="text-sm text-ink-muted">
                    Every topic cleared the {WEAK_THRESHOLD}% bar. Nice work.
                  </p>
                ) : (
                  <ul className="space-y-2.5">
                    {weakTopics.map(([topic, data]) => (
                      <li key={topic} className="rounded-xl bg-surface p-3.5">
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate text-sm font-medium text-ink-soft">
                            {topic}
                          </span>
                          <span className="tabular shrink-0 text-sm font-semibold text-warn">
                            {data.average_score}%
                          </span>
                        </div>
                        {data.concepts_missed.length > 0 ? (
                          <p className="text-pretty mt-2 text-xs leading-5 text-warn">
                            <span className="font-semibold">Missed: </span>
                            {data.concepts_missed.join(', ')}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </ReportSection>

              {mixUps.length > 0 ? (
                <ReportSection
                  icon={<AlertTriangle className="size-4" aria-hidden="true" />}
                  title="Common Mix-Ups We Noticed"
                  count={mixUps.length}
                >
                  <ul className="space-y-2">
                    {mixUps.map((mixUp) => (
                      <li
                        key={mixUp}
                        className="text-pretty rounded-xl bg-surface px-3.5 py-2.5 text-sm leading-6 text-ink-soft"
                      >
                        {mixUp}
                      </li>
                    ))}
                  </ul>
                </ReportSection>
              ) : null}
            </div>

            <div className="space-y-4 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pr-2">
              <section className="rounded-2xl border border-line bg-sunk p-5">
                <div>
                  <h2 className="text-sm font-semibold tracking-tight">Every Question</h2>
                  <p className="mt-1 text-xs text-ink-muted">
                    Open one to see what you said and the feedback.
                  </p>
                </div>
                <div className="pt-5">
                  {results.questions.length === 0 ? (
                    <p className="text-sm text-ink-muted">No questions were recorded.</p>
                  ) : (
                    <Accordion.Root type="multiple" className="space-y-2">
                      {results.questions.map((question: Question, position: number) => {
                        const answer = answersByIndex.get(position)
                        return (
                          <Accordion.Item key={question.id ?? position} value={String(question.id ?? position)} className="group rounded-xl border border-line bg-surface transition-colors data-[state=open]:border-line-strong">
                            <Accordion.Trigger className="flex w-full cursor-pointer items-center gap-3 p-3.5 text-left">
                              <span className="tabular grid size-6 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-bold text-canvas">
                                {position + 1}
                              </span>
                              <span className="text-pretty min-w-0 flex-1 text-sm font-medium leading-6">
                                {question.text}
                              </span>
                              <span
                                className={cn(
                                  'tabular shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold',
                                  scoreTone(answer?.score ?? null),
                                )}
                              >
                                {answer?.score === null || answer?.score === undefined
                                  ? '…'
                                  : `${answer.score}%`}
                              </span>
                              <ChevronDown className="size-4 shrink-0 text-ink-muted transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
                            </Accordion.Trigger>
                            <Accordion.Content className="border-t border-sunk p-3.5">
                              <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-muted">
                                You Said
                              </p>
                              <p className="text-pretty mt-1 text-sm leading-6 text-ink-soft">
                                {answer?.answer_text || 'Skipped.'}
                              </p>
                              {answer?.feedback ? (
                                <>
                                  <p className="mt-3 text-xs font-bold uppercase tracking-[0.16em] text-ink-muted">
                                    Feedback
                                  </p>
                                  <p className="text-pretty mt-1 text-sm leading-6 text-ink-soft">
                                    {answer.feedback}
                                  </p>
                                </>
                              ) : null}
                            </Accordion.Content>
                          </Accordion.Item>
                        )
                      })}
                    </Accordion.Root>
                  )}
                </div>
              </section>

              <Button asChild variant="ghost" size="sm" className="-ml-2 text-ink-muted rounded-xl">
                <Link to={sessionStepPath('preparing', currentStudyId)}>
                  <ArrowLeft className="size-3.5" aria-hidden="true" />
                  Back to Preparing
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
