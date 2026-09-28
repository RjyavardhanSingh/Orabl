import { useEffect, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { create } from 'zustand'

import { api } from './api'
import {
  getAccessToken,
  onInvalidToken,
  signOut as requestSignOut,
} from './auth'
import { WorkspaceSkeleton } from '../components/ui/workspace-skeleton'

export type AuthUser = { id: string; email: string | null }
export type AuthStatus = 'loading' | 'in' | 'out'

type AuthStore = {
  user: AuthUser | null
  status: AuthStatus
  /** Validate a stored token once (app boot). No-ops without a token. */
  hydrate: () => Promise<void>
  signOut: () => Promise<void>
}

/**
 * Auth state in zustand instead of React context: components subscribe to
 * only the slice they render (`useAuthStore((s) => s.status)`), so a user
 * object change never re-renders a component that only cares about status.
 * A context provider would re-render every consumer on any change.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useAuthStore = create<AuthStore>()((set) => ({
  user: null,
  status: getAccessToken() ? 'loading' : 'out',
  hydrate: async () => {
    if (!getAccessToken()) {
      set({ user: null, status: 'out' })
      return
    }
    try {
      const profile = await api.me()
      set({ user: profile, status: 'in' })
    } catch {
      set({ user: null, status: 'out' })
    }
  },
  signOut: async () => {
    await requestSignOut()
    set({ user: null, status: 'out' })
  },
}))

// Single module-level subscription: any 401 in api.ts drops the session.
// Runs once (not per component), so no listener fan-out on re-renders.
onInvalidToken(() => {
  useAuthStore.setState({ user: null, status: 'out' })
})

/** Bootstraps auth once; keeps the old provider shape so App.tsx is untouched. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const hydrate = useAuthStore((s) => s.hydrate)
  useEffect(() => {
    void hydrate()
  }, [hydrate])
  return <>{children}</>
}

// Same hook API as before — existing consumers don't change.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): { user: AuthUser | null; status: AuthStatus; signOut: () => Promise<void> } {
  const user = useAuthStore((s) => s.user)
  const status = useAuthStore((s) => s.status)
  const signOut = useAuthStore((s) => s.signOut)
  return { user, status, signOut }
}

export function RequireAuth({ children }: { children: ReactNode }) {
  // Subscribes to status ONLY: profile updates elsewhere never re-render this.
  const status = useAuthStore((s) => s.status)
  const location = useLocation()

  if (status === 'loading') {
    return <WorkspaceSkeleton />
  }
  if (status === 'out') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/signin?next=${next}`} replace />
  }
  return <>{children}</>
}
