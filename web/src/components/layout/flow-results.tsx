import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

/**
 * Lets the active step offer "open results" to the tracker. Practice registers it once every
 * question is answered; the tracker then turns its Results step (and a button under the rail)
 * into the way out of the flow, instead of a button inside the Practice card.
 */
export type FlowResultsAction = {
  /** True while the report is being compiled. */
  pending: boolean
  open: () => void
}

type FlowResultsState = {
  action: FlowResultsAction | null
  setAction: (action: FlowResultsAction | null) => void
}

const FlowResultsContext = createContext<FlowResultsState | null>(null)

export function FlowResultsProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<FlowResultsAction | null>(null)
  return <FlowResultsContext.Provider value={{ action, setAction }}>{children}</FlowResultsContext.Provider>
}

/** The registered results action, or null outside the ledger flow or before practice is done. */
export function useFlowResultsAction(): FlowResultsAction | null {
  return useContext(FlowResultsContext)?.action ?? null
}

/** Registers (or, with null, withdraws) the results action while the calling step is mounted. */
export function useRegisterFlowResults(action: FlowResultsAction | null): void {
  const setAction = useContext(FlowResultsContext)?.setAction
  const pending = action?.pending ?? false
  const open = action?.open
  useEffect(() => {
    if (!setAction) return
    setAction(open ? { pending, open } : null)
    return () => setAction(null)
  }, [setAction, pending, open])
}
