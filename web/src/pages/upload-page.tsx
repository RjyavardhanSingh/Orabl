import { zodResolver } from '@hookform/resolvers/zod'
import * as Tabs from '@radix-ui/react-tabs'
import { ArrowRight, Check, FileText, LoaderCircle, UploadCloud, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import {
  LedgerCard,
  ledgerAlertClass,
  ledgerErrorClass,
  ledgerFieldClass,
  ledgerLabelClass,
  ledgerPrimaryButtonClass,
  ledgerSecondaryButtonClass,
} from '../components/layout/ledger-card'
import { Alert } from '../components/ui/alert'
import { api, ApiError, type Material } from '../lib/api'
import { activeStudySessionId, sessionStepPath } from '../lib/study-session'
import { cn } from '../lib/utils'
import { uploadTextSchema, type UploadTextValues } from '../lib/validation'

type UploadMode = 'text' | 'pdf'

const CHARACTER_LIMIT = 50_000

const MAX_FILES = 3
const MATERIALS_KEY = 'recall.materials'

const removeClass = 'shrink-0 rounded-lg p-1 text-[#EBE5D9]/50 transition-colors hover:text-[#EBE5D9]'

/* Compact file ledger: fixed-height zone that scrolls inside the card instead of growing it. */
const fileListClass =
  'flex max-h-[120px] flex-col space-y-2 overflow-y-auto pr-2 [scrollbar-color:rgb(235_229_217/0.2)_transparent] [scrollbar-width:thin]'
const fileRowClass =
  'flex w-full min-w-0 items-center justify-between rounded-lg border border-[#EBE5D9]/10 bg-[#EBE5D9]/5 px-3 py-2'
const fileIconClass = 'h-3 w-3 flex-shrink-0 text-[#EBE5D9]/50'
const fileNameClass = 'block w-full truncate text-xs font-medium text-[#EBE5D9]'
const fileMetaClass = 'tabular mt-0.5 block w-full truncate text-[10px] text-[#EBE5D9]/40'

function UploadedMaterial({ item, onRemove }: { item: Material; onRemove: (id: string) => void }) {
  return (
    <div className={fileRowClass}>
      <Check className={fileIconClass} strokeWidth={3} aria-hidden="true" />
      <div className="flex w-full min-w-0 flex-col px-3">
        <span className={fileNameClass}>{item.name}</span>
        <span className={fileMetaClass}>
          {item.word_count.toLocaleString()} words · uploaded
        </span>
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

  /** Resolves false when the session could not record the change. */
  async function persistMaterials(next: Material[]): Promise<boolean> {
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
      catch { setError('Material uploaded, but session progress could not be saved. Please retry before leaving.'); return false }
    }
    return true
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
    const saved = await persistMaterials([...materials, ...next])
    for (const item of next) {
      toast.success(`${item.name} is ready to learn from.`)
    }
    return saved
  }

  // The ledger flow slides the Goal card in; the tracker stays put.
  const goToGoal = () => navigate(sessionStepPath('goal', currentStudyId))

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
      const saved = uploaded.length > 0 && (await saveMaterials(uploaded))
      setFiles(remaining)
      if (saved && failed.length === 0) goToGoal()
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
      if (await saveMaterials([await api.uploadText(values)])) goToGoal()
    } catch (uploadError) {
      handleUploadError(uploadError)
    } finally {
      setIsUploading(false)
    }
  })

  const hasAnyMaterial = materials.length > 0

  return (
    <LedgerCard
      step={1}
      label="Material"
      title="Bring Something Worth Learning"
      description="Start with a PDF or paste your notes. This material shapes every question you get."
    >
        <Tabs.Root value={mode} onValueChange={(value) => selectMode(value as UploadMode)}>
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
                <label htmlFor="material-name" className={ledgerLabelClass}>Source Name</label>
                <input
                  id="material-name"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? 'material-name-error' : undefined}
                  {...textForm.register('name')}
                  placeholder="biology-notes.md"
                  className={ledgerFieldClass}
                />
                {nameError ? (
                  <p id="material-name-error" className={ledgerErrorClass}>
                    {nameError.message}
                  </p>
                ) : null}
              </div>

              <div>
                <div className="flex items-center justify-between gap-4">
                  <label htmlFor="material-content" className={ledgerLabelClass}>Your Notes</label>
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
                  className={cn(ledgerFieldClass, 'h-28 min-h-[112px] resize-none leading-6')}
                />
                {contentError ? (
                  <p id="material-content-error" className={ledgerErrorClass}>
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
              {files.length + materials.length > 0 ? (
                <div className={cn('mt-4', fileListClass)}>
                  {files.map((pending, index) => (
                    <div key={`${pending.name}-${pending.size}-${index}`} className={fileRowClass}>
                      <FileText className={fileIconClass} aria-hidden="true" />
                      <div className="flex w-full min-w-0 flex-col px-3">
                        <span className={fileNameClass}>{pending.name}</span>
                        <span className={fileMetaClass}>
                          {(pending.size / 1024 / 1024).toFixed(2)} MB · ready to upload
                        </span>
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
                    <UploadedMaterial key={item.id} item={item} onRemove={removeMaterial} />
                  ))}
                </div>
              ) : null}
            </Tabs.Content>

            {error ? (
              <Alert className={cn('mt-6', ledgerAlertClass)}>{error}</Alert>
            ) : null}
            {mode === 'text' && materials.length > 0 ? (
              <div className={cn('mt-6', fileListClass)} role="status" aria-label="Uploaded materials">
                {materials.map((item) => (
                  <UploadedMaterial key={item.id} item={item} onRemove={removeMaterial} />
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex w-full flex-col gap-3 md:flex-row">
            <button
              type="button"
              className={hasAnyMaterial ? ledgerSecondaryButtonClass : ledgerPrimaryButtonClass}
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
                className={ledgerPrimaryButtonClass}
                onClick={goToGoal}
              >
                Continue to Goal
                <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </Tabs.Root>
    </LedgerCard>
  )
}
