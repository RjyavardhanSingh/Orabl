import { useMutation } from '@tanstack/react-query'
import * as Accordion from '@radix-ui/react-accordion'
import { ArrowLeft, ArrowRight, ChevronDown, LoaderCircle, RefreshCw, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { overlineClass } from '../components/layout/classes'
import { AppPage, PageHeader, Section, SectionCount, Stat, StatStrip } from '../components/layout/page'
import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { buttonVariants } from '../components/ui/button-variants'
import { api, ApiError, type Question, type SessionResults, type TopicBreakdown } from '../lib/api'
import { activeStudySessionId, sessionStepPath } from '../lib/study-session'
import { cn } from '../lib/utils'

const WEAK_THRESHOLD = 60

/* Same open ledger as the dashboard: figures between rules, sections over a heavy rule, rows on hairlines. */
const ledgerRowClass = 'border-b border-line py-4 transition-colors hover:bg-ink/[0.035]'
const alertClass = 'rounded-lg border-ink/30 bg-ink/5 font-medium text-ink'

function readResults(): SessionResults | null {
  const stored = window.sessionStorage.getItem('recall.results')
  return stored ? (JSON.parse(stored) as SessionResults) : null
}

/** Score tag: solid maroon when it cleared the bar, outlined when it needs work, faint while pending. */
function scoreTone(score: number | null): string {
  if (score === null) return 'border border-ink/15 text-ink/40'
  if (score > WEAK_THRESHOLD) return 'bg-primary text-on-primary'
  return 'border border-ink/40 text-ink'
}

function isWeak(data: TopicBreakdown): boolean {
  return data.status === 'needs_work' || data.average_score <= WEAK_THRESHOLD
}

export function ResultsPage() {
  const navigate = useNavigate()
  const { studyId } = useParams()
  const currentStudyId = studyId || activeStudySessionId()
  // Sessions save themselves to the dashboard, so the report has no save action.
  const [results] = useState<SessionResults | null>(readResults)
  const [expired, setExpired] = useState(false)

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
      <AppPage>
        <PageHeader
          overline="Step 05 / 05 · Results"
          title="No Results Yet"
          description="Complete a practice session to unlock your full report."
          actions={
            <Link to={sessionStepPath('practice', currentStudyId)} className={buttonVariants()}>
              Back to Practice <ArrowRight aria-hidden="true" />
            </Link>
          }
        />
      </AppPage>
    )
  }

  const answersByIndex = new Map(results.answers.map((a) => [a.question_index, a]))
  const topics = Object.entries(results.topic_summary)
  const strongTopics = topics.filter(([, data]) => !isWeak(data))
  const weakTopics = topics.filter(([, data]) => isWeak(data))
  const mixUps = Array.from(
    new Set(topics.flatMap(([, data]) => data.misconceptions).map((m) => m.trim()).filter(Boolean)),
  )
  const answeredCount = results.answers.filter((answer) => answer.answer_text).length

  return (
    <AppPage>
      <PageHeader
        overline={<>Step 05 / 05 · Results{results.questions.length ? ` · ${results.questions.length} questions` : ''}</>}
        title="How You Did"
        description={
          results.next_review_suggestion ||
          'Your readiness score, what to fix next, and the mix-ups that kept showing up.'
        }
        actions={
          !expired ? (
            <>
              <Button variant="secondary" disabled={retest.isPending} onClick={() => retest.mutate(false)}>
                <RefreshCw aria-hidden="true" />
                Full Test Again
              </Button>
              <Button disabled={retest.isPending || weakTopics.length === 0} onClick={() => retest.mutate(true)}>
                {retest.isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
                Retest Weak Areas
              </Button>
            </>
          ) : null
        }
      >
        {expired ? (
          <Alert className={cn('mt-8', alertClass)}>
            This session’s 24-hour review window has closed. Generate a fresh practice set to keep going.
          </Alert>
        ) : null}
        {weakTopics.length === 0 && !expired ? (
          <p className="mt-4 text-sm text-ink/60">No weak areas to retest: every topic cleared the bar.</p>
        ) : null}
        {retest.isError && !(retest.error instanceof ApiError && retest.error.status === 410) ? (
          <Alert className={cn('mt-8', alertClass)}>
            {retest.error instanceof ApiError ? retest.error.message : 'Could not start retest. Try again in a moment.'}
          </Alert>
        ) : null}
      </PageHeader>

      <StatStrip className="mb-14 md:mb-20">
        <Stat label="Readiness" value={`${results.readiness_score}%`} hint="Overall score" />
        <Stat
          label="Answered"
          value={`${String(answeredCount).padStart(2, '0')}/${String(results.questions.length).padStart(2, '0')}`}
          hint={answeredCount < results.questions.length ? 'Some were skipped' : 'Every question'}
        />
        <Stat label="Solid" value={String(strongTopics.length).padStart(2, '0')} hint={`Topics above ${WEAK_THRESHOLD}%`} />
        <Stat label="To fix" value={String(weakTopics.length).padStart(2, '0')} hint="Topics to revisit" />
      </StatStrip>

      {/* Transparent ledgers: topics on the left, every question on the right */}
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
        <div className="space-y-12 lg:col-span-5">
          <Section title="What to Fix" aside={<SectionCount value={weakTopics.length} />}>
            {weakTopics.length === 0 ? (
              <p className="py-6 text-sm text-ink/70">Every topic cleared the {WEAK_THRESHOLD}% bar. Nice work.</p>
            ) : (
              <ul>
                {weakTopics.map(([topic, data]) => (
                  <li key={topic} className={ledgerRowClass}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate font-serif text-xl text-strong">{topic}</span>
                      <span className="tabular shrink-0 font-sans text-sm font-bold text-ink">{data.average_score}%</span>
                    </div>
                    {data.concepts_missed.length > 0 ? (
                      <p className="text-pretty mt-1 text-xs leading-5 text-ink/60">
                        <span className="font-bold uppercase tracking-widest text-ink/70">Missed · </span>
                        {data.concepts_missed.join(', ')}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="What’s Solid" aside={<SectionCount value={strongTopics.length} />}>
            {strongTopics.length === 0 ? (
              <p className="py-6 text-sm text-ink/70">
                Nothing scored above {WEAK_THRESHOLD}% yet — everything needs work this round.
              </p>
            ) : (
              <ul>
                {strongTopics.map(([topic, data]) => (
                  <li key={topic} className={cn(ledgerRowClass, 'flex items-center justify-between gap-3')}>
                    <span className="min-w-0 truncate font-serif text-xl text-strong">{topic}</span>
                    <span className="tabular shrink-0 font-sans text-sm font-bold text-ink">{data.average_score}%</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {mixUps.length > 0 ? (
            <Section title="Common Mix-Ups" aside={<SectionCount value={mixUps.length} />}>
              <ul>
                {mixUps.map((mixUp) => (
                  <li key={mixUp} className={cn(ledgerRowClass, 'text-pretty text-sm leading-6 text-ink/80')}>
                    {mixUp}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>

        <div className="lg:col-span-7">
          <Section title="Every Question" aside={<SectionCount value={results.questions.length} />}>
            <p className="pt-4 text-sm text-ink/60">Open one to see what you said and the feedback.</p>
            {results.questions.length === 0 ? (
              <p className="py-6 text-sm text-ink/70">No questions were recorded.</p>
            ) : (
              <Accordion.Root
                type="multiple"
              >
                {results.questions.map((question: Question, position: number) => {
                  const answer = answersByIndex.get(position)
                  return (
                    <Accordion.Item
                      key={question.id ?? position}
                      value={String(question.id ?? position)}
                      className="group border-b border-line"
                    >
                      <Accordion.Trigger className="flex w-full cursor-pointer items-start gap-4 py-4 text-left transition-colors hover:bg-ink/[0.035]">
                        <span className="tabular w-8 shrink-0 pt-0.5 font-mono text-sm text-ink/50">
                          {String(position + 1).padStart(2, '0')}.
                        </span>
                        <span className="text-pretty min-w-0 flex-1 text-sm font-medium leading-6 text-strong">{question.text}</span>
                        <span className={cn('tabular shrink-0 rounded-[4px] px-2 py-0.5 text-[11px] font-bold', scoreTone(answer?.score ?? null))}>
                          {answer?.score === null || answer?.score === undefined ? '…' : `${answer.score}%`}
                        </span>
                        <ChevronDown
                          className="mt-0.5 size-4 shrink-0 text-ink/60 transition-transform group-data-[state=open]:rotate-180"
                          aria-hidden="true"
                        />
                      </Accordion.Trigger>
                      <Accordion.Content className="pb-4 pl-12 pr-8">
                        <p className={overlineClass}>You Said</p>
                        <p className="text-pretty mt-1 text-sm leading-6 text-ink/80">{answer?.answer_text || 'Skipped.'}</p>
                        {answer?.feedback ? (
                          <>
                            <p className={cn(overlineClass, 'mt-4')}>Feedback</p>
                            <p className="text-pretty mt-1 text-sm leading-6 text-ink/80">{answer.feedback}</p>
                          </>
                        ) : null}
                      </Accordion.Content>
                    </Accordion.Item>
                  )
                })}
              </Accordion.Root>
            )}
          </Section>
        </div>
      </div>

      <div className="mt-16 flex flex-wrap items-center justify-between gap-6 border-t border-line pt-6">
        <Link to={sessionStepPath('preparing', currentStudyId)} className={buttonVariants({ variant: 'ghost' }, 'text-xs uppercase tracking-[0.14em]')}>
          <ArrowLeft aria-hidden="true" />
          Back to Preparing
        </Link>
        <Link to="/sessions" className={buttonVariants({ variant: 'secondary' })}>
          All Sessions <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </AppPage>
  )
}
