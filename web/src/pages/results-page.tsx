import { useMutation } from '@tanstack/react-query'
import * as Accordion from '@radix-ui/react-accordion'
import { ArrowLeft, ArrowRight, ChevronDown, LoaderCircle, RefreshCw, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { AppNavbar } from '../components/layout/app-navbar'
import { Alert } from '../components/ui/alert'
import { MetricCard } from '../components/ui/metric-card'
import { api, ApiError, type Question, type SessionResults, type TopicBreakdown } from '../lib/api'
import { activeStudySessionId, sessionStepPath } from '../lib/study-session'
import { cn } from '../lib/utils'

const WEAK_THRESHOLD = 60

/*
 * Dashboard theme, as on the sessions page: beige canvas, solid maroon metric cards, and every
 * other component transparent, ruled with maroon lines in black and maroon type.
 */
const containerClass = 'mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-12'
const overlineClass = 'font-sans text-xs font-bold uppercase tracking-[0.2em] text-[#451017]/70'
const sectionTitleClass = 'border-b-2 border-black pb-3 font-serif text-3xl text-[#451017]'
const ledgerRowClass = 'border-b border-[#451017]/20 py-3 transition-colors hover:bg-[#451017]/5'
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-sm bg-[#451017] px-5 py-2.5 font-sans text-[10px] font-bold uppercase tracking-widest text-[#EBE5D9] transition-colors hover:bg-[#451017]/85 disabled:cursor-not-allowed disabled:opacity-50 md:text-xs'
const outlineButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-sm border border-[#451017]/30 bg-transparent px-5 py-2.5 font-sans text-[10px] font-bold uppercase tracking-widest text-[#451017] transition-colors hover:border-[#451017] hover:bg-[#451017]/5 disabled:cursor-not-allowed disabled:opacity-50 md:text-xs'
const textActionClass =
  'inline-flex items-center gap-2 font-sans text-xs font-bold uppercase tracking-widest text-[#451017]/60 transition-colors hover:text-[#451017]'
const alertClass = 'border-[#451017]/30 bg-[#451017]/5 font-medium text-[#451017]'

function readResults(): SessionResults | null {
  const stored = window.sessionStorage.getItem('recall.results')
  return stored ? (JSON.parse(stored) as SessionResults) : null
}

/** Score tag: solid maroon when it cleared the bar, outlined when it needs work, faint while pending. */
function scoreTone(score: number | null): string {
  if (score === null) return 'border border-[#451017]/15 text-[#451017]/40'
  if (score > WEAK_THRESHOLD) return 'bg-[#451017] text-[#EBE5D9]'
  return 'border border-[#451017]/40 text-[#451017]'
}

function isWeak(data: TopicBreakdown): boolean {
  return data.status === 'needs_work' || data.average_score <= WEAK_THRESHOLD
}

/** Transparent ledger section: serif title over a black rule, with an optional count. */
function LedgerSection({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-end justify-between gap-4">
        <h2 className={cn(sectionTitleClass, 'flex-1')}>{title}</h2>
        {typeof count === 'number' ? (
          <span className="tabular border-b-2 border-black pb-3 font-mono text-sm text-[#451017]/60">
            {String(count).padStart(2, '0')}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function ResultsFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[#EBE5D9] text-[#451017]">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-3 focus:text-black">
        Skip to content
      </a>
      <AppNavbar className="max-w-7xl px-5 sm:px-8 lg:px-12" />
      <div className="flex flex-1 flex-col overflow-y-auto">
        <main id="main-content" className={cn(containerClass, 'pb-16 pt-8')}>
          {children}
        </main>
      </div>
    </div>
  )
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
      <ResultsFrame>
        <p className={overlineClass}>Step 05 / 05 · Results</p>
        <h1 className="mb-4 mt-3 font-serif text-5xl italic leading-tight tracking-tight text-[#451017] md:text-6xl">
          No Results Yet
        </h1>
        <p className="mb-8 max-w-xl text-sm leading-6 text-[#451017]/70">
          Complete a practice session to unlock your full report.
        </p>
        <Link to={sessionStepPath('practice', currentStudyId)} className={primaryButtonClass}>
          Back to Practice
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </ResultsFrame>
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
    <ResultsFrame>
      {/* Hero: overline, title, actions */}
      <section className="mb-8">
        <p className={overlineClass}>Step 05 / 05 · Results</p>
        <div className="mt-3 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="min-w-0">
            <h1 className="font-serif text-5xl italic leading-tight tracking-tight text-[#451017] md:text-6xl">How You Did</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#451017]/70">
              {results.next_review_suggestion ||
                'Your readiness score, what to fix next, and the mix-ups that kept showing up.'}
            </p>
          </div>
          {!expired ? (
            <div className="flex shrink-0 flex-wrap gap-3">
              <button
                type="button"
                className={primaryButtonClass}
                disabled={retest.isPending || weakTopics.length === 0}
                onClick={() => retest.mutate(true)}
              >
                {retest.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <RotateCcw className="size-4" aria-hidden="true" />
                )}
                Retest Weak Areas
              </button>
              <button type="button" className={outlineButtonClass} disabled={retest.isPending} onClick={() => retest.mutate(false)}>
                <RefreshCw className="size-4" aria-hidden="true" />
                Full Test Again
              </button>
            </div>
          ) : null}
        </div>

        {expired ? (
          <Alert className={cn('mt-6', alertClass)}>
            This session’s 24-hour review window has closed. Generate a fresh practice set to keep going.
          </Alert>
        ) : null}
        {weakTopics.length === 0 && !expired ? (
          <p className="mt-3 text-xs text-[#451017]/60">No weak areas to retest — every topic cleared the bar.</p>
        ) : null}
        {retest.isError && !(retest.error instanceof ApiError && retest.error.status === 410) ? (
          <Alert className={cn('mt-6', alertClass)}>
            {retest.error instanceof ApiError ? retest.error.message : 'Could not start retest. Try again in a moment.'}
          </Alert>
        ) : null}
      </section>

      {/* Solid metric cards, as on the dashboard */}
      <dl className="mb-12 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
        <MetricCard label="Readiness" value={`${results.readiness_score}%`} hint="Overall score" />
        <MetricCard
          label="Answered"
          value={`${String(answeredCount).padStart(2, '0')} / ${String(results.questions.length).padStart(2, '0')}`}
          hint={answeredCount < results.questions.length ? 'Some were skipped' : 'Every question'}
        />
        <MetricCard label="Solid" value={String(strongTopics.length).padStart(2, '0')} hint={`Topics above ${WEAK_THRESHOLD}%`} />
        <MetricCard label="To Fix" value={String(weakTopics.length).padStart(2, '0')} hint="Topics to revisit" />
      </dl>

      {/* Transparent ledgers: topics on the left, every question on the right */}
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
        <div className="space-y-12 lg:col-span-5">
          <LedgerSection title="What to Fix" count={weakTopics.length}>
            {weakTopics.length === 0 ? (
              <p className="py-6 text-sm text-[#451017]/70">Every topic cleared the {WEAK_THRESHOLD}% bar. Nice work.</p>
            ) : (
              <ul>
                {weakTopics.map(([topic, data]) => (
                  <li key={topic} className={ledgerRowClass}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate font-serif text-xl text-black">{topic}</span>
                      <span className="tabular shrink-0 font-sans text-sm font-bold text-[#451017]">{data.average_score}%</span>
                    </div>
                    {data.concepts_missed.length > 0 ? (
                      <p className="text-pretty mt-1 text-xs leading-5 text-black/60">
                        <span className="font-bold uppercase tracking-widest text-[#451017]/70">Missed · </span>
                        {data.concepts_missed.join(', ')}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </LedgerSection>

          <LedgerSection title="What’s Solid" count={strongTopics.length}>
            {strongTopics.length === 0 ? (
              <p className="py-6 text-sm text-[#451017]/70">
                Nothing scored above {WEAK_THRESHOLD}% yet — everything needs work this round.
              </p>
            ) : (
              <ul>
                {strongTopics.map(([topic, data]) => (
                  <li key={topic} className={cn(ledgerRowClass, 'flex items-center justify-between gap-3')}>
                    <span className="min-w-0 truncate font-serif text-xl text-black">{topic}</span>
                    <span className="tabular shrink-0 font-sans text-sm font-bold text-[#451017]">{data.average_score}%</span>
                  </li>
                ))}
              </ul>
            )}
          </LedgerSection>

          {mixUps.length > 0 ? (
            <LedgerSection title="Common Mix-Ups" count={mixUps.length}>
              <ul>
                {mixUps.map((mixUp) => (
                  <li key={mixUp} className={cn(ledgerRowClass, 'text-pretty text-sm leading-6 text-black/80')}>
                    {mixUp}
                  </li>
                ))}
              </ul>
            </LedgerSection>
          ) : null}
        </div>

        <div className="lg:col-span-7">
          <LedgerSection title="Every Question" count={results.questions.length}>
            <p className="pt-3 text-xs text-[#451017]/60">Open one to see what you said and the feedback.</p>
            {results.questions.length === 0 ? (
              <p className="py-6 text-sm text-[#451017]/70">No questions were recorded.</p>
            ) : (
              // Fixed-height ledger, like the dashboard's: opening answers scrolls inside it instead of growing the page.
              <Accordion.Root
                type="multiple"
                className="mt-2 max-h-[560px] overflow-y-auto pr-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {results.questions.map((question: Question, position: number) => {
                  const answer = answersByIndex.get(position)
                  return (
                    <Accordion.Item
                      key={question.id ?? position}
                      value={String(question.id ?? position)}
                      className="group border-b border-[#451017]/20"
                    >
                      <Accordion.Trigger className="flex w-full cursor-pointer items-start gap-4 py-4 text-left transition-colors hover:bg-[#451017]/5">
                        <span className="tabular w-8 shrink-0 pt-0.5 font-mono text-sm text-[#451017]/50">
                          {String(position + 1).padStart(2, '0')}.
                        </span>
                        <span className="text-pretty min-w-0 flex-1 text-sm font-medium leading-6 text-black">{question.text}</span>
                        <span className={cn('tabular shrink-0 rounded-sm px-2 py-0.5 text-[11px] font-bold', scoreTone(answer?.score ?? null))}>
                          {answer?.score === null || answer?.score === undefined ? '…' : `${answer.score}%`}
                        </span>
                        <ChevronDown
                          className="mt-0.5 size-4 shrink-0 text-[#451017]/60 transition-transform group-data-[state=open]:rotate-180"
                          aria-hidden="true"
                        />
                      </Accordion.Trigger>
                      <Accordion.Content className="pb-4 pl-12 pr-8">
                        <p className={overlineClass}>You Said</p>
                        <p className="text-pretty mt-1 text-sm leading-6 text-black/80">{answer?.answer_text || 'Skipped.'}</p>
                        {answer?.feedback ? (
                          <>
                            <p className={cn(overlineClass, 'mt-4')}>Feedback</p>
                            <p className="text-pretty mt-1 text-sm leading-6 text-black/80">{answer.feedback}</p>
                          </>
                        ) : null}
                      </Accordion.Content>
                    </Accordion.Item>
                  )
                })}
              </Accordion.Root>
            )}
          </LedgerSection>
        </div>
      </div>

      <div className="mt-12">
        <Link to={sessionStepPath('preparing', currentStudyId)} className={textActionClass}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Preparing
        </Link>
      </div>
    </ResultsFrame>
  )
}
