import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, BookOpen, Clock, LoaderCircle, Mic, RotateCcw, SkipForward, Square } from 'lucide-react'
import { memo, useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { AppShell, EmptyState, PageHeader } from '../components/layout/app-shell'
import { Alert } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Label } from '../components/ui/label'
import { Waveform } from '../components/ui/waveform'
import { api, ApiError, type PracticeSession, type Question } from '../lib/api'
import { formatClock, useVoiceAnswer } from '../lib/use-voice-answer'

function readSession(): PracticeSession | null {
  const stored = window.sessionStorage.getItem('recall.session')
  return stored ? (JSON.parse(stored) as PracticeSession) : null
}

function readQuestions(): Question[] {
  const stored = window.sessionStorage.getItem('recall.questions')
  return stored ? (JSON.parse(stored) as Question[]) : []
}

const QuestionCard = memo(function QuestionCard({
  question,
  position,
  total,
}: {
  question: Question
  position: number
  total: number
}) {
  return (
    <div className="rounded-xs border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <p className="tabular text-xs font-bold uppercase tracking-[0.16em] text-ink-muted">
          Question {position} of {total}
        </p>
        {question.topic ? (
          <Badge className="shrink-0 normal-case tracking-normal">{question.topic}</Badge>
        ) : null}
      </div>
      <p className="text-pretty mt-3 text-lg font-medium leading-8 text-ink">
        {question.text}
      </p>
      {question.previous_attempt ? (
        <div className="mt-4 rounded-xl bg-warn-tint p-4 text-sm leading-6 text-warn">
          Last time you scored{' '}
          <span className="tabular font-semibold">{question.previous_attempt.score}%</span> — missed:{' '}
          {question.previous_attempt.concepts_missed.length > 0
            ? question.previous_attempt.concepts_missed.join(', ')
            : 'nothing specific, so tighten the explanation'}
          .
        </div>
      ) : null}
    </div>
  )
})

export function PracticePage() {
  const navigate = useNavigate()
  const [session] = useState<PracticeSession | null>(readSession)
  const [questions] = useState<Question[]>(readQuestions)
  const [index, setIndex] = useState(0)
  const [draft, setDraft] = useState<string | null>(null)
  const [awaitingAck, setAwaitingAck] = useState(false)

  const getToken = useCallback(() => api.mintSttToken().then((t) => t.token), [])
  const voice = useVoiceAnswer({ getToken })

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
      setIndex((i) => i + 1)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not submit answer.')
    },
  })

  const finish = useMutation({
    mutationFn: () => api.completeSession(session?.id ?? ''),
    onSuccess: (result) => {
      window.sessionStorage.setItem('recall.results', JSON.stringify(result))
      navigate('/results')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not finish session.')
    },
  })

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
      <AppShell>
        <EmptyState
          icon={<BookOpen className="size-6" aria-hidden="true" />}
          title="No Active Practice Session"
          description="Generate questions first, then start a practice session."
          action={
            <Button asChild className='rounded-xl'>
              <Link to="/preparing">
                Back to Preparing
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
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-4 pb-5 pt-5 sm:px-6 sm:pt-6 lg:px-8">
        <PageHeader
          title="Say It Out Loud"
          description="Read each question, answer by speaking, and move on. Scoring happens in the background."
          action={
            pendingCount > 0 ? (
              <Badge className="normal-case tracking-normal">
                <LoaderCircle className="mr-1 size-3 animate-spin" aria-hidden="true" />
                Scoring {pendingCount}
              </Badge>
            ) : (
              <Badge className="tabular normal-case tracking-normal">
                {Math.min(index, total)} of {total}
              </Badge>
            )
          }
        />

        <Card className="mt-5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xs">
          <CardContent className="scroll-area min-h-0 flex-1 space-y-4 p-5">
            {!done && question ? <QuestionCard question={question} position={index + 1} total={total} /> : null}

            {!done && question ? (
              <div className="rounded-xs bg-stone-100 p-5">
                {voice.phase === 'idle' && draft === null && !submit.isPending ? (
                  <div className="flex flex-col items-center py-4 text-center">
                    <Button
                      variant="accent"
                      size="icon"
                      className="size-20"
                      onClick={() => voice.start()}
                    >
                      <Mic className="size-7" aria-hidden="true" />
                      <span className="sr-only">Answer by speaking</span>
                    </Button>
                    <p className="mt-5 text-base font-semibold">Answer It</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      Tap the mic, speak your answer, then stop.
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-4 text-ink-muted"
                      onClick={() => submit.mutate({ answer_text: '', skipped: true })}
                    >
                      <SkipForward className="size-3.5" aria-hidden="true" />
                      Skip for Now
                    </Button>
                  </div>
                ) : null}

                {voice.phase === 'connecting' ? (
                  <p
                    className="flex items-center gap-2 rounded-xs bg-surface p-4 text-sm text-ink-muted"
                    role="status"
                  >
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    Connecting to transcription…
                  </p>
                ) : null}

                {voice.phase === 'recording' ? (
                  <div>
                    <div className="flex items-center justify-between gap-4">
                      <p
                        className="flex items-center gap-2 text-sm font-semibold text-bad"
                        role="status"
                      >
                        <span className="size-2 animate-pulse rounded-full bg-bad" aria-hidden="true" />
                        Listening…
                      </p>
                      <p className="tabular flex items-center gap-1.5 text-xs text-ink-muted">
                        <Clock className="size-3.5" aria-hidden="true" />
                        {formatClock(voice.elapsedSecs)} /{' '}
                        {formatClock(voice.elapsedSecs + voice.remainingSecs)}
                      </p>
                    </div>
                    {/* Signature voice mark, from the reference. Decorative:
                        the transcript below carries the real announcement. */}
                    <div className="mt-4 flex h-14 items-center justify-center text-bad">
                      <Waveform active className="h-full w-40" />
                    </div>
                    <p
                      className="mt-4 min-h-16 text-sm leading-6 text-ink-soft"
                      aria-live="polite"
                      aria-atomic="true"
                    >
                      {voice.committed ? `${voice.committed} ` : null}
                      <span className="text-ink-faint">{voice.partial}</span>
                      {!voice.committed && !voice.partial ? 'Speak now…' : null}
                    </p>
                    <Button className="mt-4 w-full rounded-xl bg-green-900 hover:bg-green-800" onClick={handleStop}>
                      <Square className="size-4" aria-hidden="true" />
                      Stop &amp; Review
                    </Button>
                  </div>
                ) : null}

                {voice.phase === 'error' ? (
                  <div className="space-y-3">
                    <Alert>
                      {voice.error ??
                        'Transcription failed. Check your microphone, then try recording again.'}
                    </Alert>
                    <Button variant="secondary" className="w-full" onClick={() => voice.reset()}>
                      <RotateCcw className="size-4" aria-hidden="true" />
                      Try Recording Again
                    </Button>
                  </div>
                ) : null}

                {draft !== null && voice.phase !== 'recording' ? (
                  <div className="space-y-3">
                    <Label htmlFor="answer-draft">Your Answer — Edit If Needed</Label>
                    <textarea
                      id="answer-draft"
                      name="answer"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      rows={5}
                      maxLength={12000}
                      className="w-full resize-y rounded-xl border border-line bg-surface p-4 text-sm leading-6 text-ink transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10"
                    />
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        className="flex-1 bg-green-900 text-white hover:bg-green-800 rounded-xl"
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
                      </Button>
                      <Button
                        className="rounded-xl"
                        variant="secondary"
                        disabled={submit.isPending}
                        onClick={() => {
                          setDraft(null)
                          voice.reset()
                        }}
                      >
                        <RotateCcw className="size-" aria-hidden="true" />
                        Re-record
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {done ? (
              <div className="rounded-2xl border border-line bg-surface p-5">
                <h2 className="text-base font-semibold tracking-tight">All Questions Answered</h2>
                <p className="text-pretty mt-1.5 text-sm leading-6 text-ink-muted">
                  {pendingCount > 0
                    ? `Finishing ${pendingCount} background ${
                        pendingCount === 1 ? 'score' : 'scores'
                      }, then your full report is ready.`
                    : 'Your full report with readiness score and per-question feedback is ready.'}
                </p>
                <Button
                  className="mt-5 w-full bg-green-900 hover:bg-green-800 rounded-xl"
                  size="lg"
                  disabled={finish.isPending}
                  onClick={() => finish.mutate()}
                >
                  {finish.isPending ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                      Compiling Your Report…
                    </>
                  ) : (
                    <>
                      See My Results
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </>
                  )}
                </Button>
                {finish.isError ? (
                  <Alert className="mt-4">
                    {finish.error instanceof ApiError
                      ? finish.error.message
                      : 'Could not finish session. Try again in a moment.'}
                  </Alert>
                ) : null}
              </div>
            ) : null}
          </CardContent>

          <div className="shrink-0 border-t border-sunk p-5">
            <Button asChild variant="ghost" size="sm" className="-ml-2 text-ink-muted rounded-xl">
              <Link to="/preparing">
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                Back to Preparing
              </Link>
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  )
}
