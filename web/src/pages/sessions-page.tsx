import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bookmark,
  BookmarkX,
  LayoutGrid,
  LayoutList,
  Pencil,
  RotateCcw,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { AppShell, EmptyState, PageHeader } from '../components/layout/app-shell'
import { Alert } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { WorkspaceSkeleton } from '../components/ui/workspace-skeleton'
import { api, ApiError, type SavedSession } from '../lib/api'
import { cn } from '../lib/utils'

type View = 'list' | 'board'

function displayTitle(item: SavedSession): string {
  return item.title?.trim() || item.subject?.trim() || 'Untitled session'
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Unknown date'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <span
      className={cn(
        'tabular grid size-11 shrink-0 place-items-center rounded-xl text-base font-bold text-white',
        score > 60 ? 'bg-ink' : 'bg-warn text-white',
      )}
    >
      {score}
    </span>
  )
}

export function SessionsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [view, setView] = useState<View>('list')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')

  const saved = useQuery({
    queryKey: ['saved-sessions'],
    queryFn: api.listSaved,
    retry: false,
  })

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['saved-sessions'] })
  }

  const openSession = useMutation({
    mutationFn: (id: string) => api.getResults(id),
    onSuccess: (result) => {
      window.sessionStorage.setItem('recall.results', JSON.stringify(result))
      navigate('/results')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not open this session.')
    },
  })

  const retestSession = useMutation({
    mutationFn: (id: string) => api.createRetest(id, { weak_only: true }),
    onSuccess: (retestSession) => {
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
      navigate('/practice')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not start retest.')
    },
  })

  const unsaveSession = useMutation({
    mutationFn: (id: string) => api.unsaveSession(id),
    onSuccess: () => {
      toast.success('Removed from saved sessions.')
      refresh()
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not remove this session.')
    },
  })

  const renameSession = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => api.renameSession(id, title),
    onSuccess: () => {
      setEditingId(null)
      refresh()
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not rename this session.')
    },
  })

  function submitRename(id: string) {
    const title = draftTitle.trim()
    if (!title) {
      toast.error('Give this session a title first.')
      return
    }
    renameSession.mutate({ id, title })
  }

  if (saved.isLoading) return <WorkspaceSkeleton />

  const items = saved.data ?? []

  return (
    <AppShell>
      <div className="flex h-full flex-col px-4 pb-5 pt-5 sm:px-6 sm:pt-6 lg:px-8">
        <div className="mx-auto w-full max-w-6xl">
          <PageHeader
            title="Saved Sessions"
            description="Sessions you kept. Open one to review it, or retest the weak spots."
            action={
              <div className="grid shrink-0 grid-cols-2 gap-1 rounded-xl bg-sunk p-1" role="group" aria-label="Change view">
                {(['list', 'board'] as View[]).map((option) => {
                  const selected = view === option
                  const Icon = option === 'list' ? LayoutList : LayoutGrid
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setView(option)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold capitalize transition-colors duration-150',
                        selected
                          ? 'bg-green-900 text-white hover:bg-green-800'
                          : 'bg-stone-100 text-ink-muted hover:text-ink',
                      )}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                      {option}
                    </button>
                  )
                })}
              </div>
            }
          />
        </div>

        <div className="scroll-area mx-auto mt-5 min-h-0 w-full max-w-6xl flex-1">
          {saved.isError ? (
            <Alert>
              Could not load saved sessions.{' '}
              <button
                type="button"
                onClick={() => void saved.refetch()}
                className="font-semibold underline underline-offset-4"
              >
                Retry
              </button>
            </Alert>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Bookmark className="size-6" aria-hidden="true" />}
              title="No Saved Sessions"
              description="Finish a practice run and save it — it will wait for you here."
              action={
                <Button asChild>
                  <Link to="/upload">
                    Upload Material
                  </Link>
                </Button>
              }
            />
          ) : view === 'list' ? (
            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item.id}>
                  <Card>
                    <CardContent className="flex items-center gap-4 p-4 sm:p-5">
                      <ScoreBadge score={item.readiness_score} />
                      <div className="min-w-0 flex-1">
                        {editingId === item.id ? (
                          <span className="flex items-center gap-2">
                            <Input
                              value={draftTitle}
                              onChange={(event) => setDraftTitle(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') submitRename(item.id)
                                if (event.key === 'Escape') setEditingId(null)
                              }}
                              maxLength={80}
                              autoFocus
                              aria-label="Session title"
                              className="h-9"
                            />
                            <Button
                              size="sm"
                              disabled={renameSession.isPending}
                              onClick={() => submitRename(item.id)}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setEditingId(null)}
                            >
                              Cancel
                            </Button>
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => openSession.mutate(item.id)}
                              className="block w-full truncate text-left text-sm font-semibold text-ink hover:underline"
                              title={displayTitle(item)}
                            >
                              {displayTitle(item)}
                            </button>
                            <p className="tabular mt-0.5 truncate text-xs text-ink-faint">
                              {formatDate(item.completed_at)} · {item.question_count} questions
                              {item.weak_count > 0 ? ` · ${item.weak_count} weak` : ' · all clear'}
                            </p>
                          </>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={openSession.isPending}
                          onClick={() => retestSession.mutate(item.id)}
                          title="Retest weak areas"
                          className="rounded-xl"
                        >
                          <RotateCcw className="size-4" aria-hidden="true" />
                          <span className="hidden sm:inline">Retest</span>
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Rename"
                          onClick={() => {
                            setEditingId(item.id)
                            setDraftTitle(item.title ?? displayTitle(item))
                          }}
                          className="text-ink-muted"
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                          <span className="sr-only">Rename {displayTitle(item)}</span>
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Remove from saved"
                          disabled={unsaveSession.isPending}
                          onClick={() => unsaveSession.mutate(item.id)}
                          className="text-ink-muted hover:text-bad"
                        >
                          <BookmarkX className="size-4" aria-hidden="true" />
                          <span className="sr-only">Remove {displayTitle(item)} from saved</span>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <Card key={item.id} className="rounded-xs">
                  <CardContent className="flex flex-col gap-4 p-5">
                    <div className="flex items-center gap-3">
                      <ScoreBadge score={item.readiness_score} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink" title={displayTitle(item)}>
                          {displayTitle(item)}
                        </p>
                        <p className="tabular mt-0.5 truncate text-xs text-ink-faint">
                          {formatDate(item.completed_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge className="tabular">{item.question_count} questions</Badge>
                      {item.weak_count > 0 ? (
                        <Badge className="tabular bg-warn-tint text-warn">{item.weak_count} weak</Badge>
                      ) : (
                        <Badge className="tabular bg-good-tint text-good">all clear</Badge>
                      )}
                    </div>
                    <div className="flex gap-2 border-t border-line pt-4">
                      <Button
                        size="sm"
                        disabled={openSession.isPending}
                        onClick={() => openSession.mutate(item.id)}
                        className="flex-1 rounded-xl bg-green-900 hover:bg-green-800"
                      >
                        Open
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={retestSession.isPending}
                        onClick={() => retestSession.mutate(item.id)}
                        title="Retest weak areas"
                        className="rounded-xl"
                      >
                        <RotateCcw className="size-4" aria-hidden="true" />
                        <span className="sr-only">Retest {displayTitle(item)}</span>
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Remove from saved"
                        disabled={unsaveSession.isPending}
                        onClick={() => unsaveSession.mutate(item.id)}
                        className="text-ink-muted hover:text-bad"
                      >
                        <BookmarkX className="size-4" aria-hidden="true" />
                        <span className="sr-only">Remove {displayTitle(item)} from saved</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
