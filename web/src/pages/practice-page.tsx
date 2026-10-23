import { useMutation, useQuery } from '@tanstack/react-query'
import * as Progress from '@radix-ui/react-progress'
import { ArrowLeft, ArrowRight, Clock, Edit3, LoaderCircle, Mic, RotateCcw, SkipForward, Square } from 'lucide-react'
import { Orb, type OrbTheme } from 'orb-ui'
import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import {
  LedgerCard,
  ledgerAlertClass,
  ledgerFieldClass,
  ledgerLabelClass,
  ledgerPrimaryButtonClass,
  ledgerSecondaryButtonClass,
} from '../components/layout/ledger-card'
import { useRegisterFlowResults } from '../components/layout/flow-results'
import { Alert } from '../components/ui/alert'
import { api, ApiError, type PracticeSession, type Question } from '../lib/api'
import { activeStudySessionId, sessionStepPath } from '../lib/study-session'
import { useMicLevelAdapter } from '../lib/use-mic-level-adapter'
import { formatClock, useVoiceAnswer } from '../lib/use-voice-answer'
import { cn } from '../lib/utils'

const BEIGE = '#EBE5D9'

/**
 * Live level bars while the mic is live: beige pill bars on maroon. orb-ui only parses 6-digit
 * hex colours, so every state uses the plain beige hex (no rgb()/alpha). Its bars already grow
 * from the vertical centre; these ratios (of the 72px size) give ~8px bars, ~6px gaps and caps
 * fully rounded, since the radius exceeds half the bar width.
 */
const LISTENING_BARS: OrbTheme = {
  name: 'bars',
  appearance: {
    colors: { idle: BEIGE, connecting: BEIGE, listening: BEIGE, thinking: BEIGE, speaking: BEIGE, error: BEIGE },
  },
  geometry: { barWidthRatio: 0.11, gapRatio: 0.085, borderRadiusRatio: 1 },
}

/** Quiet text action used for Skip, Type Answer and Back. */
const textActionClass =
  'inline-flex items-center gap-2 font-sans text-sm font-medium text-[#EBE5D9]/60 transition-colors hover:text-[#EBE5D9] disabled:pointer-events-none disabled:opacity-50'

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
  position: number
  total: number
}) {
  return (
    <section className="border-b border-[#EBE5D9]/10 pb-5">
      <div className="flex items-start justify-between gap-4">
        <p className={cn(ledgerLabelClass, 'mb-0 tabular')}>
          Question {position} of {total}
        </p>
        {question.topic ? (
          <p className="max-w-[50%] truncate font-sans text-xs text-[#EBE5D9]/50">{question.topic}</p>
        ) : null}
      </div>
      <h2 className="text-pretty mt-3 font-serif text-xl italic leading-snug text-[#EBE5D9] sm:text-2xl">
        {question.text}
      </h2>
      {question.previous_attempt ? (
        <div className="mt-4 rounded-sm border border-[#EBE5D9]/30 bg-[#EBE5D9]/10 p-3 text-sm leading-6 text-[#EBE5D9]">
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
  const [questions] = useState<Question[]>(readQuestions)
  const [index, setIndex] = useState(() => readSession()?.current_index ?? 0)
  const [draft, setDraft] = useState<string | null>(null)
  const [awaitingAck, setAwaitingAck] = useState(false)

  const getToken = useCallback(() => api.mintSttToken().then((t) => t.token), [])
  const voice = useVoiceAnswer({ getToken })
  const micLevel = useMicLevelAdapter(voice.phase === 'recording')

  const total = questions.length
  const done = index >= total
  const question = !done ? questions[index] : null

  const { data: live } = useQuery({
    queryKey: ['session', session?.id],
    queryFn: () => api.getSession(session?.id ?? ''),
    enabled: Boolean(session?.id) && awaitingAck,
    // Poll only while background scores are outstanding; one final fetch
    // confirms the ack, then polling stops on its own.
    refetchInterval: (query) => (query.state.data?.pending_count ?? 1) > 0 ? 3000 : false,
  })
  const pendingCount = live?.pending_count ?? 0

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
      <LedgerCard
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
      </LedgerCard>
    )
  }

  const answered = Math.min(index, total)

  return (
    <LedgerCard
      step={4}
      label="Practice"
      title="Say It Out Loud"
      description="Read each question, answer by speaking, and move on. Scoring happens in the background."
      compact
    >
      <div className="mb-2 flex items-center justify-between gap-4">
        <p className={cn(ledgerLabelClass, 'mb-0')}>Progress</p>
        <p className="tabular flex items-center gap-1.5 font-sans text-xs font-bold text-[#EBE5D9]/70" role="status">
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
      <Progress.Root value={answered} max={total} aria-label="Questions answered" className="mb-5 h-1 w-full overflow-hidden rounded-sm bg-[#EBE5D9]/10">
        <Progress.Indicator
          className="block h-full w-full rounded-sm bg-[#EBE5D9] transition-transform duration-300"
          style={{ transform: `translateX(-${100 - (answered / total) * 100}%)` }}
        />
      </Progress.Root>

      {!done && question ? <QuestionPrompt question={question} position={index + 1} total={total} /> : null}

      {!done && question ? (
        <section className="pt-5">
          {voice.phase === 'idle' && draft === null && !submit.isPending ? (
            <div className="flex flex-col items-center text-center">
              <button
                type="button"
                className="grid size-16 place-items-center rounded-sm bg-[#EBE5D9] text-[#451017] transition-colors hover:bg-[#EBE5D9]/80"
                onClick={() => voice.start()}
              >
                <Mic className="size-6" aria-hidden="true" />
                <span className="sr-only">Answer by speaking</span>
              </button>
              <p className="mt-3 font-serif text-lg italic text-[#EBE5D9]">Answer It</p>
              <p className="mt-1 text-xs text-[#EBE5D9]/50">Tap the mic, speak your answer, then stop.</p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-6">
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
            <p className="flex items-center gap-2 text-sm text-[#EBE5D9]/70" role="status">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Saving…
            </p>
          ) : null}

          {voice.phase === 'connecting' ? (
            <p className="flex items-center gap-2 rounded-sm border border-[#EBE5D9]/30 p-3 text-sm text-[#EBE5D9]/70" role="status">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Connecting to transcription…
            </p>
          ) : null}

          {voice.phase === 'recording' ? (
            <div>
              <div className="flex items-center justify-between gap-4">
                <p className="flex items-center gap-2 font-sans text-sm font-bold text-[#EBE5D9]" role="status">
                  <Mic className="size-4 animate-pulse" aria-hidden="true" />
                  Listening…
                </p>
                <p className="tabular flex items-center gap-1.5 text-xs text-[#EBE5D9]/60">
                  <Clock className="size-3.5" aria-hidden="true" />
                  {formatClock(voice.elapsedSecs)} / {formatClock(voice.elapsedSecs + voice.remainingSecs)}
                </p>
              </div>
              <div className="mt-3 flex items-center justify-center" aria-hidden="true">
                <Orb adapter={micLevel} theme={LISTENING_BARS} size={72} interactive={false} />
              </div>
              <p
                className="mt-3 max-h-24 min-h-12 overflow-y-auto rounded-sm border border-[#EBE5D9]/30 p-3 text-sm leading-6 text-[#EBE5D9]"
                aria-live="polite"
                aria-atomic="true"
              >
                {voice.committed ? `${voice.committed} ` : null}
                <span className="text-[#EBE5D9]/50">{voice.partial}</span>
                {!voice.committed && !voice.partial ? <span className="text-[#EBE5D9]/50">Speak now…</span> : null}
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
                className={cn(ledgerFieldClass, 'h-28 resize-none leading-6')}
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

      {done ? (
        <section className="border-t border-[#EBE5D9]/10 pt-5">
          <h2 className="font-serif text-2xl italic text-[#EBE5D9]">All Questions Answered</h2>
          <p className="text-pretty mt-1.5 text-sm leading-6 text-[#EBE5D9]/70">
            {pendingCount > 0
              ? `Finishing ${pendingCount} background ${pendingCount === 1 ? 'score' : 'scores'}. Open Results in the tracker when you’re ready.`
              : 'Your full report is ready. Open Results in the tracker to see it.'}
          </p>
          {finish.isPending ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-[#EBE5D9]/70" role="status">
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

      <div className="mt-6 border-t border-[#EBE5D9]/10 pt-4">
        <Link to={sessionStepPath('preparing', currentStudyId)} className={textActionClass}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Preparing
        </Link>
      </div>
    </LedgerCard>
  )
}
