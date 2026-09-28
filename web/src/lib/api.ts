import { getAccessToken, markTokenInvalid } from './auth'
import { ApiError, AuthError } from './errors'

export { ApiError, AuthError }

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/v1'

export type MaterialKind = 'text' | 'markdown' | 'pdf'

export type Material = {
  id: string
  name: string
  kind: MaterialKind
  page_count: number
  word_count: number
}

export type ContextStats = {
  source_count: number
  page_count: number
  word_count: number
  reading_minutes: number
}

export type LearningContext = {
  id: string
  subject: string
  target: string
  stats: ContextStats
}

export type Question = {
  id?: string
  text: string
  topic?: string
  difficulty?: string
  target_concepts: string[]
  required_relationships: string[]
  acceptable_alternatives: string[]
  common_misconceptions: string[]
  source_citations: string[]
  previous_attempt?: {
    score: number
    concepts_missed: string[]
    misconceptions_found: string[]
  }
}

export type QuestionList = { questions: Question[] }

export type AnswerStatus = 'pending' | 'scored' | 'failed'

export type AnswerRecord = {
  question_index: number
  question_id?: string | null
  answer_text: string
  score: number | null
  feedback: string
  concept_coverage: string[]
  concepts_missed: string[]
  misconceptions_found: string[]
  status: AnswerStatus
  job_id?: string | null
  scored_by?: string | null
}

export type PracticeSession = {
  id: string
  context_id: string
  question_count: number
  current_index: number
  status: string
  pending_count: number
  scored_count: number
}

export type TopicBreakdown = {
  average_score: number
  status: string
  question_count: number
  concepts_missed: string[]
  misconceptions: string[]
}

export type SessionResults = {
  id: string
  readiness_score: number
  questions: Question[]
  answers: AnswerRecord[]
  scores: Array<{ question_index: number; score: number | null }>
  completed_at: string | null
  topic_summary: Record<string, TopicBreakdown>
  weak_topics: string[]
  next_review_suggestion: string | null
  is_saved?: boolean
  title?: string | null
}

export type SavedSession = {
  id: string
  title: string | null
  subject: string | null
  readiness_score: number
  question_count: number
  weak_count: number
  completed_at: string | null
  saved_at: string | null
}

export type RetestResult = {
  id: string
  parent_session_id: string
  context_id: string
  question_count: number
  status: string
  selected_topics: string[]
  previous_scores: Record<string, number>
  questions: Question[]
}

export type SttToken = { token: string; expires_in: number }

export type GoalLevel = 'beginner' | 'intermediate' | 'advanced'

type ErrorPayload = {
  detail?: string | Array<{ msg?: string }>
  request_id?: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken()
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })

  const requestId = response.headers.get('x-request-id') ?? undefined
  const payload = (await response.json().catch(() => null)) as T | ErrorPayload | null

  if (!response.ok) {
    if (response.status === 401) {
      // Single funnel for expired/invalid tokens: drop the token, notify
      // auth state, and throw a distinct error the UI routes to sign-in.
      markTokenInvalid()
      throw new AuthError(undefined, requestId)
    }
    const error = payload as ErrorPayload | null
    const detail = Array.isArray(error?.detail)
      ? error.detail[0]?.msg
      : error?.detail
    throw new ApiError(detail ?? 'Something went wrong. Please try again.', response.status, requestId)
  }

  return payload as T
}

export const api = {
  health: () => request<{ status: string; api_version: string }>('/health'),

  me: () => request<{ id: string; email: string | null }>('/auth/me'),

  uploadText: (payload: { content: string; name: string; kind: 'text' | 'markdown' }) =>
    request<Material>('/materials', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  uploadPdf: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return request<Material>('/materials/upload', {
      method: 'POST',
      body: formData,
    })
  },

  createContext: (payload: {
    material_ids: string[]
    subject: string
    target: string
    level: GoalLevel
    deadline?: string
    language: string
  }) =>
    request<LearningContext>('/contexts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  generateQuestions: (contextId: string, count = 5) =>
    request<QuestionList>(`/contexts/${contextId}/questions`, {
      method: 'POST',
      body: JSON.stringify({ count }),
    }),

  getQuestions: (contextId: string) => request<QuestionList>(`/contexts/${contextId}/questions`),

  createSession: (contextId: string) =>
    request<PracticeSession>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ context_id: contextId }),
    }),

  getSession: (sessionId: string) => request<PracticeSession>(`/sessions/${sessionId}`),

  submitAnswer: (
    sessionId: string,
    payload: { question_index: number; answer_text: string; skipped?: boolean },
  ) =>
    request<AnswerRecord>(`/sessions/${sessionId}/answer`, {
      method: 'POST',
      body: JSON.stringify({ skipped: false, ...payload }),
    }),

  completeSession: (sessionId: string) =>
    request<SessionResults>(`/sessions/${sessionId}/complete`, { method: 'POST' }),

  getResults: (sessionId: string) => request<SessionResults>(`/sessions/${sessionId}/results`),

  createRetest: (sessionId: string, payload: { weak_only?: boolean; count?: number } = {}) =>
    request<RetestResult>(`/sessions/${sessionId}/retest`, {
      method: 'POST',
      body: JSON.stringify({ weak_only: true, ...payload }),
    }),

  listSaved: () => request<SavedSession[]>('/sessions/saved'),

  saveSession: (sessionId: string, title?: string) =>
    request<SavedSession>(`/sessions/${sessionId}/save`, {
      method: 'POST',
      body: JSON.stringify({ title: title ?? null }),
    }),

  unsaveSession: (sessionId: string) =>
    request<{ ok: boolean }>(`/sessions/${sessionId}/save`, { method: 'DELETE' }),

  renameSession: (sessionId: string, title: string) =>
    request<{ id: string; title: string }>(`/sessions/${sessionId}/title`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),

  mintSttToken: () => request<SttToken>('/stt/token'),
}
