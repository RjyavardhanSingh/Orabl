import { zodResolver } from '@hookform/resolvers/zod'
import * as Tabs from '@radix-ui/react-tabs'
import { ArrowRight, Check, FileText, LoaderCircle, UploadCloud, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { AppShell } from '../components/layout/app-shell'
import { Alert } from '../components/ui/alert'
import { api, ApiError, type Material } from '../lib/api'
import { activeStudySessionId, sessionStepPath } from '../lib/study-session'
import { cn } from '../lib/utils'
import { uploadTextSchema, type UploadTextValues } from '../lib/validation'

type UploadMode = 'text' | 'pdf'

const CHARACTER_LIMIT = 50_000

const MAX_FILES = 3
const MATERIALS_KEY = 'recall.materials'

/* Editorial Ledger card: beige on maroon, structural borders, no rings, no pills. */
const labelClass = 'mb-2 block font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-[#EBE5D9]/70'
const fieldClass =
  'w-full rounded-xl border-2 border-[#EBE5D9]/20 bg-[#EBE5D9]/5 p-4 text-[#EBE5D9] transition-colors placeholder:text-[#EBE5D9]/40 focus:border-[#EBE5D9] focus:outline-none focus:ring-0 aria-[invalid=true]:border-[#EBE5D9]/70'
const errorClass = 'text-xs font-bold text-[#EBE5D9]'
const buttonBase =
  'inline-flex w-full items-center justify-center gap-2 rounded-xl px-8 py-4 font-sans text-sm font-bold uppercase tracking-widest transition-colors disabled:pointer-events-none disabled:opacity-50 md:w-auto'
const primaryButtonClass = `${buttonBase} bg-[#EBE5D9] text-[#451017] hover:bg-black hover:text-[#EBE5D9]`
const secondaryButtonClass = `${buttonBase} border-2 border-[#EBE5D9]/30 bg-transparent text-[#EBE5D9] hover:border-[#EBE5D9]`
const removeClass = 'shrink-0 rounded-lg p-1 text-[#EBE5D9]/50 transition-colors hover:text-[#EBE5D9]'

function UploadedMaterial({ item, onRemove, className }: { item: Material; onRemove: (id: string) => void; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border border-[#EBE5D9]/20 bg-[#EBE5D9]/10 px-4 py-3', className)}>
      <span className="grid size-6 shrink-0 place-items-center rounded-md bg-[#EBE5D9] text-[#451017]">
        <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.name}</p>
        <p className="tabular text-xs text-[#EBE5D9]/50">
          {item.word_count.toLocaleString()} words · uploaded
        </p>
      </div>
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        className={removeClass}
        aria-label={`Remove ${item.name}`}
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}

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
    <AppShell variant="ledger">
      {/* Focus outlines inside the maroon card read in beige. */}
      <div className="w-full rounded-2xl border border-[#451017] bg-[#451017] p-8 text-[#EBE5D9] shadow-2xl shadow-[#451017]/20 [--color-accent:#EBE5D9]">
        <p className="mb-4 font-sans text-xs font-bold uppercase tracking-[0.2em] text-[#EBE5D9]/70">Step 01/05 · Material</p>
        <h1 className="mb-4 font-serif text-4xl italic leading-tight text-[#EBE5D9] md:text-5xl">Bring Something Worth Learning</h1>
        <p className="max-w-xl text-sm leading-6 text-[#EBE5D9]/70">
          Start with a PDF or paste your notes. This material shapes every question you get.
        </p>

        <Tabs.Root value={mode} onValueChange={(value) => selectMode(value as UploadMode)} className="mt-10">
          <Tabs.List aria-label="Material type" className="flex gap-8">
            {(['text', 'pdf'] as UploadMode[]).map((option) => (
              <Tabs.Trigger
                key={option}
                value={option}
                className={cn(
                  'border-b-2 pb-2 font-sans text-sm transition-colors',
                  mode === option
                    ? 'border-[#EBE5D9] font-bold text-[#EBE5D9]'
                    : 'border-[#EBE5D9]/20 text-[#EBE5D9]/50 hover:text-[#EBE5D9]/80',
                )}
              >
                {option === 'text' ? 'Paste Text' : 'Upload PDF'}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          <div className="pt-8">
            <Tabs.Content value="text" className="space-y-6">
              <div>
                <label htmlFor="material-name" className={labelClass}>Source Name</label>
                <input
                  id="material-name"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? 'material-name-error' : undefined}
                  {...textForm.register('name')}
                  placeholder="biology-notes.md"
                  className={fieldClass}
                />
                {nameError ? (
                  <p id="material-name-error" className={cn(errorClass, 'mt-2')}>
                    {nameError.message}
                  </p>
                ) : null}
              </div>

              <div>
                <div className="flex items-center justify-between gap-4">
                  <label htmlFor="material-content" className={labelClass}>Your Notes</label>
                  <span className="tabular mb-2 text-xs text-[#EBE5D9]/50">
                    {content.length.toLocaleString()} / {CHARACTER_LIMIT.toLocaleString()}
                  </span>
                </div>
                <textarea
                  id="material-content"
                  maxLength={CHARACTER_LIMIT}
                  aria-invalid={contentError ? true : undefined}
                  aria-describedby={contentError ? 'material-content-error' : undefined}
                  {...textForm.register('content')}
                  placeholder="Paste a chapter, lecture notes, or an article…"
                  rows={4}
                  className={cn(fieldClass, 'h-32 min-h-[120px] resize-none leading-6')}
                />
                {contentError ? (
                  <p id="material-content-error" className={cn(errorClass, 'mt-2')}>
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
                  className="mt-3 text-xs font-semibold text-[#EBE5D9]/60 underline underline-offset-4 transition-colors hover:text-[#EBE5D9]"
                >
                  {kind === 'text' ? 'Save as Markdown' : 'Save as Plain Text'}
                </button>
              </div>
            </Tabs.Content>
            <Tabs.Content value="pdf" className="flex flex-col">
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
                className="flex min-h-56 flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#EBE5D9]/30 bg-transparent px-5 py-8 text-center transition-colors hover:border-[#EBE5D9] hover:bg-[#EBE5D9]/5"
              >
                <span className="grid size-12 place-items-center rounded-xl border border-[#EBE5D9]/20">
                  <UploadCloud className="size-5 text-[#EBE5D9]/70" aria-hidden="true" />
                </span>
                <span className="mt-5 font-serif text-2xl text-[#EBE5D9]">
                  Drop Your PDF Here
                </span>
                <span className="mt-2 text-xs text-[#EBE5D9]/60">
                  or press Enter to browse · max 25&nbsp;MB each ·{' '}
                  {materials.length + files.length} of {MAX_FILES} files
                </span>
              </button>
              {files.map((pending, index) => (
                <div
                  key={`${pending.name}-${pending.size}-${index}`}
                  className="mt-4 flex items-center gap-3 rounded-xl border border-[#EBE5D9]/20 px-4 py-3"
                >
                  <FileText className="size-5 shrink-0 text-[#EBE5D9]/60" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{pending.name}</p>
                    <p className="tabular text-xs text-[#EBE5D9]/50">
                      {(pending.size / 1024 / 1024).toFixed(2)} MB · ready to upload
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removePendingFile(index)}
                    className={removeClass}
                    aria-label={`Remove ${pending.name}`}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
              {materials.map((item) => (
                <UploadedMaterial key={item.id} item={item} onRemove={removeMaterial} className="mt-4" />
              ))}
            </Tabs.Content>

            {error ? (
              <Alert className="mt-6 border-[#EBE5D9]/40 bg-[#EBE5D9]/10 font-medium text-[#EBE5D9]">{error}</Alert>
            ) : null}
            {mode === 'text' && materials.length > 0 ? (
              <div className="mt-6 space-y-3" role="status" aria-label="Uploaded materials">
                {materials.map((item) => (
                  <UploadedMaterial key={item.id} item={item} onRemove={removeMaterial} />
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex w-full flex-col gap-3 md:flex-row">
            <button
              type="button"
              className={hasAnyMaterial ? secondaryButtonClass : primaryButtonClass}
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
            </button>
            {hasAnyMaterial ? (
              <button
                type="button"
                className={primaryButtonClass}
                onClick={() => navigate(sessionStepPath('goal', currentStudyId))}
              >
                Continue to Goal
                <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </Tabs.Root>
      </div>
    </AppShell>
  )
}
