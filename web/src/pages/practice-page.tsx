import { useMutation, useQuery } from '@tanstack/react-query'
import * as Progress from '@radix-ui/react-progress'
import { ArrowLeft, ArrowRight, Clock, Edit3, LoaderCircle, Mic, RotateCcw, SkipForward, Square } from 'lucide-react'
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { FlowStep } from '../components/layout/flow-step'
import {
  ledgerAlertClass,
  ledgerFieldClass,
  ledgerLabelClass,
  ledgerPrimaryButtonClass,
  ledgerSecondaryButtonClass,
} from '../components/layout/classes'
import { useRegisterFlowResults } from '../components/layout/flow-results'
import { Alert } from '../components/ui/alert'
import { buttonVariants } from '../components/ui/button-variants'
import { api, ApiError, FOLLOW_UP_LABELS, type PracticeSession, type Question } from '../lib/api'
import { activeStudySessionId, sessionStepPath } from '../lib/study-session'
import { useMicLevelAdapter } from '../lib/use-mic-level-adapter'
import { formatClock, useVoiceAnswer } from '../lib/use-voice-answer'
import { cn } from '../lib/utils'

/** Quiet text action used for Skip, Type Answer and Back. */
const textActionClass = buttonVariants({ variant: 'ghost' }, 'text-xs uppercase tracking-[0.14em]')

/*
 * Each bar has its own weight (the centre reads tallest) and its own wobble speed and phase, so
 * the five move independently instead of scaling as one fixed shape. Silence leaves a short rest.
 */
const BARS = [
  { weight: 0.55, speed: 5.1, phase: 0.0 },
  { weight: 0.8, speed: 6.7, phase: 1.3 },
  { weight: 1.0, speed: 4.3, phase: 2.1 },
  { weight: 0.8, speed: 7.3, phase: 0.6 },
  { weight: 0.55, speed: 5.9, phase: 2.8 },
] as const
const REST = 0.12

/**
 * Live level bars, grown from the vertical centre. They animate in their own frame loop from the
 * mic level ref and write `transform: scaleY` directly: no React render and no layout per frame.
 */
function ListeningBars({ level }: { level: RefObject<number> }) {
  const bars = useRef<(HTMLSpanElement | null)[]>([])

  useEffect(() => {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    const tick = (now: number) => {
      const t = now / 1000
      const value = level.current ?? 0
      BARS.forEach(({ weight, speed, phase }, i) => {
        const wobble = still ? 1 : 0.7 + 0.3 * Math.sin(t * speed + phase)
        const scale = REST + (1 - REST) * value * weight * wobble
        const bar = bars.current[i]
        if (bar) bar.style.transform = `scaleY(${scale.toFixed(3)})`
      })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [level])

  return (
    <div className="flex h-[72px] w-[72px] items-center justify-center gap-[5px]" aria-hidden="true">
      {BARS.map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            bars.current[i] = el
          }}
          style={{ transform: `scaleY(${REST})` }}
          className="h-full w-[5px] origin-center rounded-lg bg-primary will-change-transform"
        />
      ))}
    </div>
  )
}

function readSession(): PracticeSession | null {
  const stored = window.sessionStorage.getItem('recall.session')
  return stored ? (JSON.parse(stored) as PracticeSession) : null
}

function readQuestions(): Question[] {
  const stored = window.sessionStorage.getItem('recall.questions')
  return stored ? (JSON.parse(stored) as Question[]) : []
}

function QuestionPrompt({
  question,
  position,
  total,
}: {
  question: Question
  /** 1-based position within its round: the main questions, or the follow-ups. */
  position: number
  total: number
}) {
  const followUp = question.follow_up
  return (
    <section className="border-b border-line pb-7">
      <div className="flex items-start justify-between gap-4">
        <p className={cn(ledgerLabelClass, 'mb-0 tabular')}>
          {followUp
            ? `Follow-up ${position} of ${total} · ${FOLLOW_UP_LABELS[followUp.kind]}`
            : `Question ${position} of ${total}`}
        </p>
        {question.topic ? (
          <p className="max-w-[50%] truncate font-sans text-xs text-ink/50">{question.topic}</p>
        ) : null}
      </div>
      {followUp ? (
        <p className="mt-3 text-sm leading-6 text-ink/70">
          <span className="font-bold text-ink">On question {followUp.parent_index + 1}.</span>{' '}
          {followUp.rationale}
        </p>
      ) : null}
      <h2 className="text-pretty mt-4 font-serif text-2xl italic leading-snug text-strong sm:text-3xl">
        {question.text}
      </h2>
      {question.previous_attempt ? (
        <div className="mt-5 rounded-lg border border-ink/30 bg-ink/5 p-4 text-sm leading-6 text-ink">
          Last time you scored{' '}
          <span className="tabular font-bold">{question.previous_attempt.score}%</span> — missed:{' '}
          {question.previous_attempt.concepts_missed.length > 0
            ? question.previous_attempt.concepts_missed.join(', ')
            : 'nothing specific, so tighten the explanation'}
          .
        </div>
      ) : null}
    </section>
  )
}

export function PracticePage() {
  const navigate = useNavigate()
  const { studyId } = useParams()
  const currentStudyId = studyId || activeStudySessionId()
  const [session] = useState<PracticeSession | null>(readSession)
  // Grows during the session: Orabl appends adaptive follow-ups as answers are scored.
  const [questions, setQuestions] = useState<Question[]>(readQuestions)
  const [index, setIndex] = useState(() => readSession()?.current_index ?? 0)
  const [draft, setDraft] = useState<string | null>(null)
  const [awaitingAck, setAwaitingAck] = useState(false)

  const getToken = useCallback(() => api.mintSttToken().then((t) => t.token), [])
  const voice = useVoiceAnswer({ getToken })
  const micLevel = useMicLevelAdapter(voice.phase === 'recording')

  const total = questions.length
  const atEnd = index >= total
  const question = !atEnd ? questions[index] : null
  // The main questions come first; follow-ups form a short round after them.
  const mainCount = questions.filter((q) => !q.follow_up).length
  const inFollowUps = Boolean(question?.follow_up)

  const { data: live } = useQuery({
    // Keyed by position, so reaching the end always fetches fresh state, never a stale count.
    queryKey: ['session', session?.id, index],
    queryFn: () => api.getSession(session?.id ?? ''),
    enabled: Boolean(session?.id) && awaitingAck,
    // Poll only while background scores are outstanding; one final fetch
    // confirms the ack, then polling stops on its own.
    refetchInterval: (query) => (query.state.data?.pending_count ?? 1) > 0 ? 3000 : false,
  })
  const pendingCount = live?.pending_count ?? 0
  // The server's list has grown: follow-ups were promoted. Pull them in.
  const hasNewQuestions = (live?.question_count ?? 0) > questions.length
  useEffect(() => {
    if (!hasNewQuestions || !session?.id) return
    let cancelled = false
    void api.getSessionQuestions(session.id).then(({ questions: next }) => {
      if (cancelled) return
      setQuestions(next)
      try {
        window.sessionStorage.setItem('recall.questions', JSON.stringify(next))
      } catch {
        // private mode
      }
    })
    return () => {
      cancelled = true
    }
  }, [hasNewQuestions, session?.id])

  const submit = useMutation({
    mutationFn: (payload: { answer_text: string; skipped?: boolean }) =>
      api.submitAnswer(session?.id ?? '', { question_index: index, ...payload }),
    onSuccess: (record) => {
      if (record.status === 'pending') setAwaitingAck(true)
      voice.reset()
      setDraft(null)
      const nextIndex = index + 1
      setIndex(nextIndex)
      try {
        const stored = readSession()
        if (stored) {
          window.sessionStorage.setItem('recall.session', JSON.stringify({ ...stored, current_index: nextIndex }))
        }
      } catch {
        // private mode
      }
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not submit answer.')
    },
  })

  // Finished only when nothing can still arrive: every answer scored and no follow-up waiting.
  const done =
    atEnd &&
    !submit.isPending &&
    (!awaitingAck || (live !== undefined && pendingCount === 0 && !hasNewQuestions))
  // Main questions answered, but Orabl may still be preparing follow-ups.
  const reviewing = atEnd && !done

  const finish = useMutation({
    mutationFn: () => api.completeSession(session?.id ?? ''),
    onSuccess: async (result) => {
      window.sessionStorage.setItem('recall.results', JSON.stringify(result))
      if (currentStudyId && session?.id) {
        try {
          await api.updateStudySession(currentStudyId, { practice_id: session.id })
        } catch {
          // non-blocking sync
        }
      }
      navigate(sessionStepPath('results', currentStudyId))
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not finish session.')
    },
  })

  // Once every question is answered, the tracker's Results step opens the report.
  const { mutate: finishSession } = finish
  const openResults = useCallback(() => finishSession(), [finishSession])
  useRegisterFlowResults(done && session ? { pending: finish.isPending, open: openResults } : null)

  const handleStop = useCallback(async () => {
    const text = await voice.stop()
    if (!text) {
      toast.error('We didn’t catch that — record again.')
      voice.reset()
      return
    }
    setDraft(text)
  }, [voice])

  if (!session || questions.length === 0) {
    return (
      <FlowStep
        step={4}
        label="Practice"
        title="No Active Practice Session"
        description="Generate questions first, then start a practice session."
        compact
      >
        <Link to={sessionStepPath('preparing', currentStudyId)} className={ledgerPrimaryButtonClass}>
          Back to Preparing
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </FlowStep>
    )
  }

  const answered = Math.min(index, total)

  return (
    <FlowStep
      step={4}
      label="Practice"
      title="Say It Out Loud"
      description="Read each question, answer by speaking, and move on. Scoring happens in the background."
      compact
    >
      <div className="mb-2 flex items-center justify-between gap-4">
        <p className={cn(ledgerLabelClass, 'mb-0')}>Progress</p>
        <p className="tabular flex items-center gap-1.5 font-sans text-xs font-bold text-ink/70" role="status">
          {pendingCount > 0 ? (
            <>
              <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
              Scoring {pendingCount}
            </>
          ) : (
            `${answered} of ${total}`
          )}
        </p>
      </div>
      <Progress.Root value={answered} max={total} aria-label="Questions answered" className="mb-8 h-0.5 w-full overflow-hidden bg-ink/10">
        <Progress.Indicator
          className="block h-full w-full bg-primary transition-transform duration-300"
          style={{ transform: `translateX(-${100 - (answered / total) * 100}%)` }}
        />
      </Progress.Root>

      {question ? (
        <QuestionPrompt
          question={question}
          position={inFollowUps ? index - mainCount + 1 : index + 1}
          total={inFollowUps ? total - mainCount : mainCount}
        />
      ) : null}

      {question ? (
        <section className="pt-8">
          {voice.phase === 'idle' && draft === null && !submit.isPending ? (
            <div className="flex flex-col items-center text-center">
              <button
                type="button"
                className="grid size-20 place-items-center rounded-xl bg-primary text-on-primary transition-colors hover:bg-primary-hover"
                onClick={() => voice.start()}
              >
                <Mic className="size-7" aria-hidden="true" />
                <span className="sr-only">Answer by speaking</span>
              </button>
              <p className="mt-4 font-serif text-xl italic text-ink">Answer It</p>
              <p className="mt-1 text-sm text-ink/55">Tap the mic, speak your answer, then stop.</p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-8">
                <button type="button" className={textActionClass} onClick={() => submit.mutate({ answer_text: '', skipped: true })}>
                  <SkipForward className="size-3.5" aria-hidden="true" />
                  Skip for Now
                </button>
                <button type="button" className={textActionClass} onClick={() => setDraft('')}>
                  <Edit3 className="size-3.5" aria-hidden="true" />
                  Type Answer
                </button>
              </div>
            </div>
          ) : null}

          {voice.phase === 'idle' && draft === null && submit.isPending ? (
            <p className="flex items-center gap-2 text-sm text-ink/70" role="status">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Saving…
            </p>
          ) : null}

          {voice.phase === 'connecting' ? (
            <p className="flex items-center gap-2 rounded-lg border border-ink/30 p-3 text-sm text-ink/70" role="status">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Connecting to transcription…
            </p>
          ) : null}

          {voice.phase === 'recording' ? (
            <div>
              <div className="flex items-center justify-between gap-4">
                <p className="flex items-center gap-2 font-sans text-sm font-bold text-ink" role="status">
                  <Mic className="size-4 animate-pulse" aria-hidden="true" />
                  Listening…
                </p>
                <p className="tabular flex items-center gap-1.5 text-xs text-ink/60">
                  <Clock className="size-3.5" aria-hidden="true" />
                  {formatClock(voice.elapsedSecs)} / {formatClock(voice.elapsedSecs + voice.remainingSecs)}
                </p>
              </div>
              <div className="mt-3 flex items-center justify-center" aria-hidden="true">
                <ListeningBars level={micLevel} />
              </div>
              <p
                className="mt-3 max-h-40 min-h-16 overflow-y-auto rounded-lg border border-ink/30 p-4 text-sm leading-6 text-ink"
                aria-live="polite"
                aria-atomic="true"
              >
                {voice.committed ? `${voice.committed} ` : null}
                <span className="text-ink/50">{voice.partial}</span>
                {!voice.committed && !voice.partial ? <span className="text-ink/50">Speak now…</span> : null}
              </p>
              <button type="button" className={cn(ledgerPrimaryButtonClass, 'mt-4 md:w-full')} onClick={handleStop}>
                <Square className="size-4" aria-hidden="true" />
                Stop &amp; Review
              </button>
            </div>
          ) : null}

          {voice.phase === 'error' ? (
            <div className="space-y-3">
              <Alert className={ledgerAlertClass}>
                {voice.error ?? 'Transcription failed. Check your microphone, then try recording again.'}
              </Alert>
              <button type="button" className={cn(ledgerSecondaryButtonClass, 'md:w-full')} onClick={() => voice.reset()}>
                <RotateCcw className="size-4" aria-hidden="true" />
                Try Recording Again
              </button>
            </div>
          ) : null}

          {draft !== null && voice.phase !== 'recording' ? (
            <div>
              <label htmlFor="answer-draft" className={ledgerLabelClass}>Your Answer — Edit If Needed</label>
              <textarea
                id="answer-draft"
                name="answer"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={4}
                maxLength={12000}
                className={cn(ledgerFieldClass, 'h-40 resize-y leading-6')}
              />
              <div className="mt-4 flex flex-col gap-3 md:flex-row">
                <button
                  type="button"
                  className={ledgerPrimaryButtonClass}
                  disabled={submit.isPending || draft.trim().length === 0}
                  onClick={() => submit.mutate({ answer_text: draft.trim() })}
                >
                  {submit.isPending ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                      Sending…
                    </>
                  ) : (
                    <>
                      Submit Answer
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className={ledgerSecondaryButtonClass}
                  disabled={submit.isPending}
                  onClick={() => {
                    setDraft(null)
                    voice.reset()
                  }}
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Re-record
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {reviewing ? (
        <section className="border-t border-line pt-7" role="status">
          <h2 className="flex items-center gap-3 font-serif text-3xl italic text-ink">
            <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
            Orabl is reviewing your answers
          </h2>
          <p className="text-pretty mt-1.5 text-sm leading-6 text-ink/70">
            Follow-ups may be on the way: up to three questions on what your answers revealed.
          </p>
        </section>
      ) : null}

      {done ? (
        <section className="border-t border-line pt-7">
          <h2 className="font-serif text-3xl italic text-ink">All Questions Answered</h2>
          <p className="text-pretty mt-1.5 text-sm leading-6 text-ink/70">
            Your full report is ready. Open Results in the tracker to see it.
          </p>
          {finish.isPending ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-ink/70" role="status">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Compiling your report…
            </p>
          ) : null}
          {finish.isError ? (
            <Alert className={cn('mt-4', ledgerAlertClass)}>
              {finish.error instanceof ApiError ? finish.error.message : 'Could not finish session. Try again in a moment.'}
            </Alert>
          ) : null}
        </section>
      ) : null}

      <div className="mt-10 border-t border-line pt-6">
        <Link to={sessionStepPath('preparing', currentStudyId)} className={textActionClass}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Preparing
        </Link>
      </div>
    </FlowStep>
  )
}
