import { ApiError } from './errors'

// Namespaced: 'recall.session' is the *practice* session object written by
// the preparing/practice pages — sharing it logged users out mid-flow.
const TOKEN_KEY = 'recall.auth.token'

function apiBaseUrl(): string {
  const url = import.meta.env.VITE_API_BASE_URL as string | undefined
  return (url ?? 'http://localhost:8000/v1').replace(/\/$/, '')
}

export function getAccessToken(): string | null {
  return window.sessionStorage.getItem(TOKEN_KEY)
}

export function setAccessToken(token: string): void {
  window.sessionStorage.setItem(TOKEN_KEY, token)
}

export function clearAccessToken(): void {
  window.sessionStorage.removeItem(TOKEN_KEY)
}

type InvalidTokenListener = () => void

const invalidTokenListeners = new Set<InvalidTokenListener>()

/** Subscribe to token-invalidated events (driven by 401s in api.ts). */
export function onInvalidToken(listener: InvalidTokenListener): () => void {
  invalidTokenListeners.add(listener)
  return () => {
    invalidTokenListeners.delete(listener)
  }
}

/** Called by the API layer on 401: drops the token and notifies subscribers. */
export function markTokenInvalid(): void {
  clearAccessToken()
  for (const listener of invalidTokenListeners) {
    try {
      listener()
    } catch {
      // a failing listener must never break request handling
    }
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken()
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })
  const payload = (await response.json().catch(() => null)) as T | { detail?: unknown } | null
  if (!response.ok) {
    const detail =
      payload && typeof payload === 'object' && 'detail' in payload
        ? payload.detail
        : undefined
    const message =
      typeof detail === 'string' && detail ? detail : 'Authentication failed. Please try again.'
    throw new ApiError(message, response.status)
  }
  return payload as T
}

/** Starts Google OAuth on our backend; returns the Google URL to redirect to. */
export async function getGoogleAuthUrl(next: string): Promise<string> {
  const data = await apiRequest<{ url: string }>(
    `/auth/google/url?next=${encodeURIComponent(next)}`,
  )
  if (!data?.url) throw new ApiError('Could not start Google sign-in.', 500)
  return data.url
}

export type ExchangedSession = { token: string; user: { id: string; email: string | null } }

/** Redeems the single-use callback code for the session token (revealed once).
 *  Aborts after `timeoutMs` so the UI can never hang on an infinite spinner —
 *  a hung exchange surfaces as an error with a way back to sign-in. */
export async function exchangeCode(code: string, timeoutMs = 25000): Promise<ExchangedSession> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const data = await apiRequest<ExchangedSession>('/auth/token', {
      method: 'POST',
      body: JSON.stringify({ code }),
      signal: controller.signal,
    })
    if (!data?.token) throw new ApiError('Sign-in did not complete. Please try again.', 401)
    return data
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('Sign-in timed out. Please try again.', 408)
    }
    throw err
  } finally {
    window.clearTimeout(timer)
  }
}

export async function signOut(): Promise<void> {
  try {
    await apiRequest('/auth/logout', { method: 'POST', body: JSON.stringify({}) })
  } finally {
    clearAccessToken()
  }
}
