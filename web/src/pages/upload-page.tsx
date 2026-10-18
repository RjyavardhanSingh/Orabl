import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, Check, FileText, LoaderCircle, UploadCloud, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { AppShell, PageHeader } from '../components/layout/app-shell'
import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Input, Textarea } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { api, ApiError, type Material } from '../lib/api'
import { activeStudySessionId, sessionStepPath } from '../lib/study-session'
import { cn } from '../lib/utils'
import { uploadTextSchema, type UploadTextValues } from '../lib/validation'

type UploadMode = 'text' | 'pdf'

const CHARACTER_LIMIT = 50_000

const MAX_FILES = 3
const MATERIALS_KEY = 'recall.materials'

function readStoredMaterials(): Material[] {
  try {
    const stored = window.sessionStorage.getItem(MATERIALS_KEY)
    const parsed: unknown = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed) ? (parsed as Material[]) : []
  } catch {
    return []
  }
}

function readUploadDraft(): UploadTextValues {
  try {
    const stored = window.sessionStorage.getItem('recall.upload.draft')
    if (stored) {
      const value = JSON.parse(stored) as Partial<UploadTextValues>
      return { name: value.name || 'pasted-notes.txt', content: value.content || '', kind: value.kind === 'markdown' ? 'markdown' : 'text' }
    }
  } catch { /* use defaults */ }
  return { content: '', name: 'pasted-notes.txt', kind: 'text' }
}

export function UploadPage() {
  const navigate = useNavigate()
  const { studyId } = useParams()
  const currentStudyId = studyId || activeStudySessionId()
  const fileInput = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<UploadMode>('text')
  const [files, setFiles] = useState<File[]>([])
  const [materials, setMaterials] = useState<Material[]>(readStoredMaterials)
  const [error, setError] = useState('')
  const [isUploading, setIsUploading] = useState(false)

  const textForm = useForm<UploadTextValues>({
    resolver: zodResolver(uploadTextSchema),
    defaultValues: readUploadDraft(),
    mode: 'onBlur',
  })
  const content = useWatch({ control: textForm.control, name: 'content' }) ?? ''
  const name = useWatch({ control: textForm.control, name: 'name' }) ?? 'pasted-notes.txt'
  const kind = useWatch({ control: textForm.control, name: 'kind' })
  const nameError = textForm.formState.errors.name
  const contentError = textForm.formState.errors.content

  useEffect(() => {
    const draft = { name, content, kind: kind === 'markdown' ? 'markdown' as const : 'text' as const }
    try { window.sessionStorage.setItem('recall.upload.draft', JSON.stringify(draft)) } catch { /* private browsing */ }
    const id = currentStudyId
    if (!id) return
    const timer = window.setTimeout(() => {
      void api.updateStudySession(id, { upload_draft: draft }).catch(() => setError('Could not save your draft. Check your connection.'))
    }, 700)
    return () => window.clearTimeout(timer)
  }, [name, content, kind, currentStudyId])

  const selectMode = (nextMode: UploadMode) => {
    setMode(nextMode)
    setError('')
    setFiles([])
  }

  async function persistMaterials(next: Material[]) {
    setMaterials(next)
    for (const key of ['recall.context', 'recall.questions', 'recall.session', 'recall.results']) {
      try { window.sessionStorage.removeItem(key) } catch { /* private browsing */ }
    }
    try {
      window.sessionStorage.setItem(MATERIALS_KEY, JSON.stringify(next))
    } catch {
      // storage full/blocked — session continues in memory
    }
    const id = currentStudyId
    if (id) {
      try { await api.updateStudySession(id, { material_ids: next.map((item) => item.id), context_id: null, practice_id: null }) }
      catch { setError('Material uploaded, but session progress could not be saved. Please retry before leaving.'); return }
    }
  }

  function isPdf(candidate: File): boolean {
    if (candidate.type && candidate.type !== 'application/pdf') return false
    return candidate.name.toLowerCase().endsWith('.pdf')
  }

  const selectFiles = (incoming: File[]) => {
    const valid = incoming.filter(isPdf)
    if (valid.length < incoming.length) {
      setError('Only PDF files can be added. Others were skipped.')
    }
    const slots = MAX_FILES - materials.length - files.length
    if (slots <= 0) {
      setError(`You can upload up to ${MAX_FILES} files per session. Remove one to add another.`)
      return
    }
    const accepted = valid.slice(0, slots)
    if (valid.length > accepted.length) {
      setError(`You can upload up to ${MAX_FILES} files per session — added the first ${accepted.length}.`)
    } else if (valid.length === incoming.length) {
      setError('')
    }
    if (accepted.length === 0) return
    if (files.length === 0) textForm.setValue('name', accepted[0].name)
    setFiles((prev) => [...prev, ...accepted])
  }

  function removePendingFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  function removeMaterial(id: string) {
    void persistMaterials(materials.filter((m) => m.id !== id))
  }

  const saveMaterials = async (next: Material[]) => {
    await persistMaterials([...materials, ...next])
    for (const item of next) {
      toast.success(`${item.name} is ready to learn from.`)
    }
  }

  const handleUploadError = (uploadError: unknown) => {
    if (uploadError instanceof ApiError) {
      setError(
        uploadError.requestId
          ? `${uploadError.message} · Request ${uploadError.requestId}`
          : uploadError.message,
      )
    } else {
      setError('We could not upload your material. Check that the API is running, then retry.')
    }
  }

  const uploadPdf = async () => {
    if (files.length === 0) {
      setError('Choose a PDF before uploading.')
      return
    }
    setError('')
    setIsUploading(true)
    try {
      const uploaded: Material[] = []
      const failed: string[] = []
      const remaining: File[] = []
      let firstError: unknown = null
      for (const candidate of files) {
        try {
          uploaded.push(await api.uploadPdf(candidate))
        } catch (uploadError) {
          if (firstError === null) firstError = uploadError
          failed.push(candidate.name)
          remaining.push(candidate)
        }
      }
      if (uploaded.length > 0) await saveMaterials(uploaded)
      setFiles(remaining)
      if (failed.length > 0) {
        if (uploaded.length === 0 && files.length === 1) {
          handleUploadError(firstError)
        } else {
          setError(
            `These files failed to upload and are still selected: ${failed.join(', ')}.`,
          )
        }
      }
    } finally {
      setIsUploading(false)
    }
  }

  const submitText = textForm.handleSubmit(async (values) => {
    if (materials.length >= MAX_FILES) {
      setError(`You can upload up to ${MAX_FILES} files per session. Remove one to add another.`)
      return
    }
    setError('')
    setIsUploading(true)
    try {
      await saveMaterials([await api.uploadText(values)])
    } catch (uploadError) {
      handleUploadError(uploadError)
    } finally {
      setIsUploading(false)
    }
  })

  const hasAnyMaterial = materials.length > 0

  return (
    <AppShell>
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col px-4 pb-5 pt-5 sm:px-6 sm:pt-6 lg:px-8">
        <PageHeader
          title="Bring Something Worth Learning"
          description="Start with a PDF or paste your notes. This material shapes every question you get."
        />

        <div className="mt-8 flex min-h-0 flex-1 flex-col overflow-hidden border-t border-line-strong">
          <div className="shrink-0 border-b border-line py-4">
            <div className="flex gap-6">
              {(['text', 'pdf'] as UploadMode[]).map((option) => {
                const selected = mode === option
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => selectMode(option)}
                    className={cn(
                      'border-b-2 px-1 py-2 text-sm font-semibold transition-colors duration-150',
                      selected
                        ? 'border-accent text-accent'
                        : 'border-transparent text-ink-muted hover:text-ink',
                    )}
                  >
                    {option === 'text' ? 'Paste Text' : 'Upload PDF'}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="scroll-area min-h-0 flex-1 py-6">
            {mode === 'text' ? (
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="material-name">Source Name</Label>
                  <Input
                    id="material-name"
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={nameError ? true : undefined}
                    aria-describedby={nameError ? 'material-name-error' : undefined}
                    {...textForm.register('name')}
                    placeholder="biology-notes.md"
                    className="bg-sunk"
                  />
                  {nameError ? (
                    <p id="material-name-error" className="text-xs text-bad">
                      {nameError.message}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="material-content">Your Notes</Label>
                    <span className="tabular text-xs text-ink-faint">
                      {content.length.toLocaleString()} / {CHARACTER_LIMIT.toLocaleString()}
                    </span>
                  </div>
                  <Textarea
                    id="material-content"
                    maxLength={CHARACTER_LIMIT}
                    aria-invalid={contentError ? true : undefined}
                    aria-describedby={contentError ? 'material-content-error' : undefined}
                    {...textForm.register('content')}
                    placeholder="Paste a chapter, lecture notes, or an article…"
                    className="h-full min-h-40 resize-none bg-sunk"
                  />
                  {contentError ? (
                    <p id="material-content-error" className="text-xs text-bad">
                      {contentError.message}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() =>
                      textForm.setValue('kind', kind === 'text' ? 'markdown' : 'text', {
                        shouldDirty: true,
                      })
                    }
                    className="text-xs font-semibold text-ink-muted underline underline-offset-4 transition-colors hover:text-ink"
                  >
                    {kind === 'text' ? 'Save as Markdown' : 'Save as Plain Text'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col">
                <input
                  ref={fileInput}
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  className="sr-only"
                  aria-label="Choose PDF files (up to 3)"
                  onChange={(event) => {
                    selectFiles(Array.from(event.target.files ?? []))
                    event.target.value = ''
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    selectFiles(Array.from(event.dataTransfer.files ?? []))
                  }}
                  className="flex min-h-48 flex-1 flex-col items-center justify-center border border-dashed border-line-strong bg-sunk px-5 py-8 text-center transition-colors hover:border-accent"
                >
                  <span className="grid size-12 place-items-center rounded-2xl bg-sunk shadow-sm">
                    <UploadCloud className="size-5 text-ink-muted" aria-hidden="true" />
                  </span>
                  <span className="mt-5 text-sm font-semibold text-ink">
                    Drop Your PDF Here
                  </span>
                  <span className="mt-1 text-xs text-ink-muted">
                    or press Enter to browse · max 25&nbsp;MB each ·{' '}
                    {materials.length + files.length} of {MAX_FILES} files
                  </span>
                </button>
                {files.map((pending, index) => (
                  <div
                    key={`${pending.name}-${pending.size}-${index}`}
                    className="mt-4 flex items-center gap-3 rounded-xl bg-sunk px-4 py-3"
                  >
                    <FileText className="size-5 shrink-0 text-ink-muted" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{pending.name}</p>
                      <p className="tabular text-xs text-ink-faint">
                        {(pending.size / 1024 / 1024).toFixed(2)} MB · ready to upload
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePendingFile(index)}
                      className="shrink-0 rounded-lg p-1 text-ink-faint transition-colors hover:text-ink"
                      aria-label={`Remove ${pending.name}`}
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
                {materials.map((item) => (
                  <div
                    key={item.id}
                    className="mt-4 flex items-center gap-3 rounded-xl border border-good-tint bg-good-tint px-4 py-3"
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-good text-canvas">
                      <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="tabular text-xs text-ink-faint">
                        {item.word_count.toLocaleString()} words · uploaded
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeMaterial(item.id)}
                      className="shrink-0 rounded-lg p-1 text-ink-faint transition-colors hover:text-ink"
                      aria-label={`Remove ${item.name}`}
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {error ? <Alert className="mt-5">{error}</Alert> : null}
            {mode === 'text' && materials.length > 0 ? (
              <div className="mt-5 space-y-3" role="status" aria-label="Uploaded materials">
                {materials.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-xl border border-good-tint bg-good-tint px-4 py-3"
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-good text-canvas">
                      <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="tabular text-xs text-ink-faint">
                        {item.word_count.toLocaleString()} words · uploaded
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeMaterial(item.id)}
                      className="shrink-0 rounded-lg p-1 text-ink-faint transition-colors hover:text-ink"
                      aria-label={`Remove ${item.name}`}
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex w-full flex-col gap-2 border-t border-line py-5 sm:flex-row">
            <Button
              className="w-full sm:w-auto"
              variant={hasAnyMaterial ? 'secondary' : 'default'}
              size="lg"
              onClick={mode === 'text' ? submitText : uploadPdf}
              disabled={isUploading}
            >
              {isUploading ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  Uploading…
                </>
              ) : (
                <>
                  {hasAnyMaterial ? 'Add Another Source' : 'Use This Material'}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </>
              )}
            </Button>
            {hasAnyMaterial ? <Button
              className="w-full sm:w-auto"
              size="lg"
              onClick={() => navigate(sessionStepPath('goal', currentStudyId))}
            >
              Continue to Goal
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button> : null}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
