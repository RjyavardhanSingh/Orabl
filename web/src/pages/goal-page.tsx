import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, ArrowRight, BookOpen, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { AppShell, EmptyState, PageHeader } from '../components/layout/app-shell'
import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { api, ApiError, type Material } from '../lib/api'
import { cn } from '../lib/utils'
import { goalSchema, type GoalValues } from '../lib/validation'

const levels: Array<{ value: GoalValues['level']; title: string; text: string }> = [
  { value: 'beginner', title: 'New to This', text: 'I’m building the basics.' },
  { value: 'intermediate', title: 'Getting There', text: 'I know some of this already.' },
  { value: 'advanced', title: 'Going Deeper', text: 'I want to stretch my understanding.' },
]

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
      try {
        window.sessionStorage.removeItem(DRAFT_KEY)
      } catch {
        // already gone — harmless
      }
      toast.success('Your learning context is ready.')
      navigate('/preparing')
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
      <AppShell>
        <EmptyState
          icon={<BookOpen className="size-6" aria-hidden="true" />}
          title="Start With Your Material"
          description="We need something to learn from before we can shape your goal."
          action={
            <Button asChild>
              <Link to="/upload">
                Upload Material
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          }
        />
      </AppShell>
    )
  }

  function toggleMaterial(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((kept) => kept !== id) : [...prev, id],
    )
  }

  return (
    <AppShell>
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-4 pb-5 pt-5 sm:px-6 sm:pt-6 lg:px-8">
        <PageHeader
          title="What Do You Want to Understand?"
          description="A clear goal keeps every question relevant to you. Three details are enough to begin."
        />

        <Card className="mt-5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xs">
          <CardContent className="scroll-area min-h-0 flex-1 p-5">
            <form id="goal-form" onSubmit={submit} className="space-y-5" noValidate>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-ink-soft">
                  Materials in this session ({selectedIds.length} of {materials.length})
                </legend>
                <div className="space-y-2">
                  {materials.map((item) => {
                    const checked = selectedIds.includes(item.id)
                    return (
                      <label
                        key={item.id}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
                          checked
                            ? 'border-line-strong bg-surface'
                            : 'border-line bg-sunk text-ink-muted',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMaterial(item.id)}
                          className="size-4 shrink-0 accent-green-900"
                          aria-label={`Include ${item.name}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">
                            {item.name}
                          </span>
                          <span className="tabular block text-xs text-ink-faint">
                            {item.word_count.toLocaleString()} words
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
              <div className="space-y-2">
                <Label htmlFor="subject">What Are You Studying?</Label>
                <Input
                  id="subject"
                  autoComplete="off"
                  aria-invalid={subjectError ? true : undefined}
                  aria-describedby={subjectError ? 'subject-error' : undefined}
                  {...form.register('subject')}
                  placeholder="Biology · Cell respiration"
                />
                {subjectError ? (
                  <p id="subject-error" className="text-xs text-bad">
                    {subjectError.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="target">What Do You Want to Be Able to Do?</Label>
                <Input
                  id="target"
                  autoComplete="off"
                  aria-invalid={targetError ? true : undefined}
                  aria-describedby={targetError ? 'target-error' : undefined}
                  {...form.register('target')}
                  placeholder="Explain how cells create energy"
                />
                {targetError ? (
                  <p id="target-error" className="text-xs text-bad">
                    {targetError.message}
                  </p>
                ) : null}
              </div>

              <fieldset className="space-y-2.5">
                <legend className="mb-2 text-sm font-medium text-ink-soft">
                  How Familiar Is This?
                </legend>
                <div className="grid gap-2">
                  {levels.map((option) => {
                    const selected = level === option.value
                    return (
                      <label
                        key={option.value}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors duration-150',
                          selected
                            ? 'border-ink bg-sunk'
                            : 'border-line hover:border-ink-faint',
                        )}
                      >
                        <input
                          type="radio"
                          value={option.value}
                          {...form.register('level')}
                          className="size-4 shrink-0 accent-ink"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-ink">
                            {option.title}
                          </span>
                          <span className="mt-0.5 block text-xs text-ink-muted">{option.text}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="deadline">
                    Deadline <span className="font-normal text-ink-faint">(optional)</span>
                  </Label>
                  <Input id="deadline" type="date" {...form.register('deadline')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="language">Language</Label>
                  <Input
                    id="language"
                    autoComplete="off"
                    spellCheck={false}
                    inputMode="text"
                    {...form.register('language')}
                    placeholder="en"
                  />
                </div>
              </div>

              {error ? <Alert>{error}</Alert> : null}
            </form>
          </CardContent>

          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-sunk p-5 sm:flex-row sm:items-center sm:justify-between">
            <Button asChild variant="ghost">
              <Link to="/upload">
                <ArrowLeft className="size-4" aria-hidden="true" />
                Back
              </Link>
            </Button>
            <Button type="submit" form="goal-form" disabled={isSubmitting} className='bg-green-900 hover:bg-green-800 rounded-xl'>
              {isSubmitting ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  Preparing…
                </>
              ) : (
                <>
                  Create My Session
                  <ArrowRight className="size-4" aria-hidden="true" />
                </>
              )}
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  )
}
