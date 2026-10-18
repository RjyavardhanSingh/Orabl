import { api, type StudySession } from './api'

const ACTIVE_KEY = 'orabl.activeStudySession'
const HYDRATED_KEY = 'orabl.hydratedStudySession'

export function activeStudySessionId(): string | null {
  try { return window.localStorage.getItem(ACTIVE_KEY) } catch { return null }
}

export function setActiveStudySession(id: string): void {
  try { window.localStorage.setItem(ACTIVE_KEY, id) } catch { /* private browsing */ }
}

export function clearActiveStudySession(): void {
  try { window.localStorage.removeItem(ACTIVE_KEY) } catch { /* private browsing */ }
  clearFlowCache()
}

export function sessionStepPath(step: 'upload' | 'goal' | 'preparing' | 'practice' | 'results', id = activeStudySessionId()): string {
  return id ? `/sessions/${id}/${step}` : '/sessions'
}

export function isStudySessionHydrated(id: string): boolean {
  try { return window.sessionStorage.getItem(HYDRATED_KEY) === id } catch { return false }
}

export function markStudySessionHydrated(id: string): void {
  try { window.sessionStorage.setItem(HYDRATED_KEY, id) } catch { /* private browsing */ }
}

export function clearFlowCache(): void {
  for (const key of [HYDRATED_KEY, 'recall.materials', 'recall.material', 'recall.upload.draft', 'recall.context', 'recall.questions', 'recall.session', 'recall.results', 'recall.goal.draft']) {
    try { window.sessionStorage.removeItem(key) } catch { /* private browsing */ }
  }
}

export async function restoreStudySession(session: StudySession): Promise<'upload' | 'goal' | 'preparing' | 'practice' | 'results'> {
  clearFlowCache()
  setActiveStudySession(session.id)
  if (session.material_ids.length) {
    const materials = await Promise.all(session.material_ids.map(api.getMaterial))
    window.sessionStorage.setItem('recall.materials', JSON.stringify(materials))
  }
  if (session.upload_draft && Object.keys(session.upload_draft).length) {
    window.sessionStorage.setItem('recall.upload.draft', JSON.stringify(session.upload_draft))
  }
  if (Object.keys(session.goal_draft).length) {
    window.sessionStorage.setItem('recall.goal.draft', JSON.stringify(session.goal_draft))
  }
  if (session.context_id) {
    const context = await api.getContext(session.context_id)
    window.sessionStorage.setItem('recall.context', JSON.stringify(context))
  }
  if (session.practice_id) {
    if (session.practice_status === 'completed') {
      try {
        const result = await api.getResults(session.practice_id)
        window.sessionStorage.setItem('recall.results', JSON.stringify(result))
        markStudySessionHydrated(session.id)
        return 'results'
      } catch {
        // Fall back to getSession if results query fails
      }
    }
    try {
      const live = await api.getSession(session.practice_id)
      if (live.status === 'completed') {
        try {
          const result = await api.getResults(session.practice_id)
          window.sessionStorage.setItem('recall.results', JSON.stringify(result))
          markStudySessionHydrated(session.id)
          return 'results'
        } catch {
          // Fall back to practice view
        }
      }
      const questions = await api.getSessionQuestions(live.id)
      window.sessionStorage.setItem('recall.session', JSON.stringify(live))
      window.sessionStorage.setItem('recall.questions', JSON.stringify(questions.questions))
      markStudySessionHydrated(session.id)
      return 'practice'
    } catch {
      try {
        const result = await api.getResults(session.practice_id)
        window.sessionStorage.setItem('recall.results', JSON.stringify(result))
        markStudySessionHydrated(session.id)
        return 'results'
      } catch { /* expired practice session; prepared context remains available */ }
    }
  }
  markStudySessionHydrated(session.id)
  return session.context_id ? 'preparing' : session.material_ids.length ? 'goal' : 'upload'
}
