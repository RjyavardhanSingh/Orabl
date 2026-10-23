import { zodResolver } from '@hookform/resolvers/zod'
import * as Checkbox from '@radix-ui/react-checkbox'
import * as RadioGroup from '@radix-ui/react-radio-group'
import { ArrowLeft, ArrowRight, Check, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import {
  LedgerCard,
  ledgerAlertClass,
  ledgerBackLinkClass,
  ledgerErrorClass,
  ledgerFieldClass,
  ledgerLabelClass,
  ledgerPrimaryButtonClass,
} from '../components/layout/ledger-card'
import { Alert } from '../components/ui/alert'
import { api, ApiError, type Material } from '../lib/api'
import { activeStudySessionId, sessionStepPath } from '../lib/study-session'
import { cn } from '../lib/utils'
import { goalSchema, type GoalValues } from '../lib/validation'

const levels: Array<{ value: GoalValues['level']; title: string; text: string }> = [
  { value: 'beginner', title: 'New to This', text: 'I’m building the basics.' },
  { value: 'intermediate', title: 'Getting There', text: 'I know some of this already.' },
  { value: 'advanced', title: 'Going Deeper', text: 'I want to stretch my understanding.' },
]

/* Choice lists on the maroon card: ruled rows with square marks, beige when chosen. */
const listClass = 'divide-y divide-[#EBE5D9]/15 rounded-sm border border-[#EBE5D9] px-3'
const rowClass = 'flex min-w-0 items-center gap-2 py-2 transition-colors'
const rowOnClass = 'text-[#EBE5D9]'
const rowOffClass = 'text-[#EBE5D9]/60 hover:text-[#EBE5D9]'
const markClass =
  'grid size-5 shrink-0 place-items-center rounded-md border-2 border-[#EBE5D9]/40 text-[#451017] transition-colors data-[state=checked]:border-[#EBE5D9] data-[state=checked]:bg-[#EBE5D9]'

function readMaterials(): Material[] {
  try {
    const stored = window.sessionStorage.getItem('recall.materials')
    if (stored) {
      const parsed: unknown = JSON.parse(stored)
      if (Array.isArray(parsed)) return parsed as Material[];
    }
  } catch {
    // fall through to legacy key
  }
  try {
    const legacy = window.sessionStorage.getItem('recall.material')
    return legacy ? [JSON.parse(legacy) as Material] : []
  } catch {
    return []
  }
}

const DRAFT_KEY = 'recall.goal.draft'

type GoalDraft = Partial<Pick<GoalValues, 'subject' | 'target' | 'level' | 'deadline' | 'language'>>

function readDraft(): GoalDraft {
  try {
    const stored = window.sessionStorage.getItem(DRAFT_KEY)
    const parsed: unknown = stored ? JSON.parse(stored) : null
    return typeof parsed === 'object' && parsed !== null ? (parsed as GoalDraft) : {}
  } catch {
    return {}
  }
}

function readStoredContext(): { subject: string; target: string } | null {
  try {
    const stored = window.sessionStorage.getItem('recall.context')
    if (!stored) return null
    const parsed = JSON.parse(stored) as { subject?: unknown; target?: unknown }
    if (typeof parsed.subject === 'string' && typeof parsed.target === 'string') {
      return { subject: parsed.subject, target: parsed.target }
    }
    return null
  } catch {
    return null
  }
}

export function GoalPage() {
  const navigate = useNavigate()
  const { studyId } = useParams()
  const currentStudyId = studyId || activeStudySessionId()
  const materials = readMaterials()
  const [selectedIds, setSelectedIds] = useState<string[]>(() => materials.map((m) => m.id))
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Back-navigation survival: live draft wins, else the last submitted
  // context's subject/target (so re-entering never starts from blank).
  const form = useForm<GoalValues>({
    resolver: zodResolver(goalSchema),
    defaultValues: (() => {
      const draft = readDraft()
      const context = readStoredContext()
      return {
        subject: draft.subject ?? context?.subject ?? '',
        target: draft.target ?? context?.target ?? '',
        level: draft.level ?? 'intermediate',
        deadline: draft.deadline ?? '',
        language: draft.language ?? 'en',
      }
    })(),
    mode: 'onBlur',
  })

  // Persist every change (cheap JSON write); cleared on successful submit.
  const draftValues = useWatch({ control: form.control })
  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          subject: draftValues.subject ?? '',
          target: draftValues.target ?? '',
          level: draftValues.level ?? 'intermediate',
          deadline: draftValues.deadline ?? '',
          language: draftValues.language ?? 'en',
        }),
      )
    } catch {
      // storage full/blocked — session continues in memory
    }
  }, [draftValues])
  useEffect(() => {
    const id = currentStudyId
    if (!id) return
    const timer = window.setTimeout(() => {
      void api.updateStudySession(id, { goal_draft: {
        subject: draftValues.subject ?? '', target: draftValues.target ?? '',
        level: draftValues.level ?? 'intermediate', deadline: draftValues.deadline ?? '',
        language: draftValues.language ?? 'en',
      } }).catch(() => setError('Could not save your goal draft. Check your connection.'))
    }, 600)
    return () => window.clearTimeout(timer)
  }, [draftValues, currentStudyId])
  const level = useWatch({ control: form.control, name: 'level' })
  const subjectError = form.formState.errors.subject
  const targetError = form.formState.errors.target

  const submit = form.handleSubmit(async (values) => {
    if (materials.length === 0) {
      setError('Upload a material before setting your goal.')
      return
    }
    if (selectedIds.length === 0) {
      setError('Select at least one material for this session.')
      return
    }
    setError('')
    setIsSubmitting(true)
    try {
      const context = await api.createContext({
        material_ids: selectedIds,
        subject: values.subject,
        target: values.target,
        level: values.level,
        deadline: values.deadline || undefined,
        language: values.language,
      })
      window.sessionStorage.setItem('recall.context', JSON.stringify(context))
      for (const key of ['recall.questions', 'recall.session', 'recall.results']) {
        window.sessionStorage.removeItem(key)
      }
      if (currentStudyId) await api.updateStudySession(currentStudyId, { title: values.subject, context_id: context.id, practice_id: null, goal_draft: values })
      try {
        window.sessionStorage.removeItem(DRAFT_KEY)
      } catch {
        // already gone — harmless
      }
      toast.success('Your learning context is ready.')
      navigate(sessionStepPath('preparing', currentStudyId))
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setError(
          submitError.requestId
            ? `${submitError.message} · Request ${submitError.requestId}`
            : submitError.message,
        )
      } else {
        setError('We could not create your learning context. Check that the API is running, then retry.')
      }
    } finally {
      setIsSubmitting(false)
    }
  })

  if (materials.length === 0) {
    return (
      <LedgerCard
        step={2}
        label="Goal"
        title="Start With Your Material"
        description="We need something to learn from before we can shape your goal."
      >
        <div>
          <Link to={sessionStepPath('upload', currentStudyId)} className={ledgerPrimaryButtonClass}>
            Upload Material
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </LedgerCard>
    )
  }

  function toggleMaterial(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((kept) => kept !== id) : [...prev, id],
    )
  }

  return (
    <LedgerCard
      step={2}
      label="Goal"
      title="What Do You Want to Understand?"
      compact
      description="A clear goal keeps every question relevant to you. Three details are enough to begin."
    >
      <form id="goal-form" onSubmit={submit} noValidate>
        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
          {/* Left: context and topic. */}
          <div className="flex w-full min-w-0 flex-col gap-4 overflow-hidden">
            {/* Fieldsets default to min-inline-size: min-content, which let long filenames widen the column. */}
            <fieldset className="min-w-0">
              <legend className={ledgerLabelClass}>
                Materials in this session ({selectedIds.length} of {materials.length})
              </legend>
              <div className={cn(listClass, 'w-full min-w-0 overflow-hidden')}>
                {materials.map((item) => {
                  const checked = selectedIds.includes(item.id)
                  return (
                    <div
                      key={item.id}
                      className={cn(rowClass, 'w-full items-start overflow-hidden', checked ? rowOnClass : rowOffClass)}
                    >
                      <Checkbox.Root
                        id={`material-${item.id}`}
                        checked={checked}
                        onCheckedChange={() => toggleMaterial(item.id)}
                        className={markClass}
                        aria-label={`Include ${item.name}`}
                      >
                        <Checkbox.Indicator><Check className="size-3.5" strokeWidth={3} aria-hidden="true" /></Checkbox.Indicator>
                      </Checkbox.Root>
                      <label htmlFor={`material-${item.id}`} className="block min-w-0 flex-1 cursor-pointer overflow-hidden">
                        <span className="block w-full truncate text-sm font-medium text-[#EBE5D9]">{item.name}</span>
                        <span className="tabular block w-full truncate text-xs text-[#EBE5D9]/50">
                          {item.word_count.toLocaleString()} words
                        </span>
                      </label>
                    </div>
                  )
                })}
              </div>
            </fieldset>

            <div>
              <label htmlFor="subject" className={ledgerLabelClass}>What Are You Studying?</label>
              <input
                id="subject"
                autoComplete="off"
                aria-invalid={subjectError ? true : undefined}
                aria-describedby={subjectError ? 'subject-error' : undefined}
                {...form.register('subject')}
                placeholder="Biology · Cell respiration"
                className={ledgerFieldClass}
              />
              {subjectError ? (
                <p id="subject-error" className={ledgerErrorClass}>
                  {subjectError.message}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="deadline" className={ledgerLabelClass}>
                Deadline <span className="font-normal normal-case tracking-normal text-[#EBE5D9]/50">(optional)</span>
              </label>
              {/* Dark scheme so the native calendar icon reads on maroon. */}
              <input id="deadline" type="date" {...form.register('deadline')} className={cn(ledgerFieldClass, '[color-scheme:dark]')} />
            </div>
            <div>
              <label htmlFor="language" className={ledgerLabelClass}>Language</label>
              <input
                id="language"
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
                {...form.register('language')}
                placeholder="en"
                className={ledgerFieldClass}
              />
            </div>
          </div>

          {/* Right: what success looks like and how familiar it is. */}
          <div className="flex min-w-0 flex-col gap-4">
            <div>
              <label htmlFor="target" className={ledgerLabelClass}>What Do You Want to Be Able to Do?</label>
              <input
                id="target"
                autoComplete="off"
                aria-invalid={targetError ? true : undefined}
                aria-describedby={targetError ? 'target-error' : undefined}
                {...form.register('target')}
                placeholder="Explain how cells create energy"
                className={ledgerFieldClass}
              />
              {targetError ? (
                <p id="target-error" className={ledgerErrorClass}>
                  {targetError.message}
                </p>
              ) : null}
            </div>

            <fieldset className="min-w-0">
              <legend className={ledgerLabelClass}>How Familiar Is This?</legend>
              <RadioGroup.Root
                value={level}
                onValueChange={(value) => form.setValue('level', value as GoalValues['level'], { shouldDirty: true, shouldValidate: true })}
                className={listClass}
              >
                {levels.map((option) => (
                  <div key={option.value} className={cn(rowClass, level === option.value ? rowOnClass : rowOffClass)}>
                    {/* Square mark, never a dot: same shape as the material checkboxes. */}
                    <RadioGroup.Item id={`level-${option.value}`} value={option.value} className={markClass}>
                      <RadioGroup.Indicator>
                        <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
                      </RadioGroup.Indicator>
                    </RadioGroup.Item>
                    <label htmlFor={`level-${option.value}`} className="min-w-0 flex-1 cursor-pointer">
                      <span className="block font-serif text-sm italic leading-tight">{option.title}</span>
                      <span className="mt-0.5 block text-xs text-[#EBE5D9]/60">{option.text}</span>
                    </label>
                  </div>
                ))}
              </RadioGroup.Root>
            </fieldset>
          </div>
        </div>

        {error ? <Alert className={cn('mt-6', ledgerAlertClass)}>{error}</Alert> : null}
      </form>

      {/* Back stays left; the forward action sits right. */}
      <div className="mt-6 flex w-full flex-col-reverse gap-4 md:flex-row md:items-center md:justify-between">
        <Link to={sessionStepPath('upload', currentStudyId)} className={ledgerBackLinkClass}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back
        </Link>
        <button type="submit" form="goal-form" disabled={isSubmitting} className={ledgerPrimaryButtonClass}>
          {isSubmitting ? (
            <>
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Preparing…
            </>
          ) : (
            <>
              Prepare Questions
              <ArrowRight className="size-4" aria-hidden="true" />
            </>
          )}
        </button>
      </div>
    </LedgerCard>
  )
}
