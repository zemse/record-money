/**
 * React hook for the sync engine
 *
 * Provides easy access to sync state and actions in React components.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  getSyncEngine,
  initializeSyncEngine,
  type SyncEngineState,
  type SyncResult,
  type SyncEventType,
} from '../sync/sync-engine'

export interface UseSyncEngineResult {
  // State
  state: SyncEngineState
  isReady: boolean

  // Actions
  sync: () => Promise<SyncResult>
  start: () => Promise<void>
  stop: () => void
}

export function useSyncEngine(): UseSyncEngineResult {
  const [state, setState] = useState<SyncEngineState>({
    isRunning: false,
    isSyncing: false,
    lastSyncAt: null,
    lastError: null,
    pendingCount: 0,
    consecutiveFailures: 0,
  })
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const engine = getSyncEngine()

    // Set initial state
    setState(engine.getState())
    setIsReady(true)

    // Subscribe to state changes
    const unsubscribe = engine.addEventListener((event: SyncEventType, data?: unknown) => {
      if (event === 'state_change' && data) {
        setState(data as SyncEngineState)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const sync = useCallback(async (): Promise<SyncResult> => {
    const engine = getSyncEngine()
    return engine.manualSync()
  }, [])

  const start = useCallback(async (): Promise<void> => {
    const engine = getSyncEngine()
    await engine.start()
  }, [])

  const stop = useCallback((): void => {
    const engine = getSyncEngine()
    engine.stop()
  }, [])

  return {
    state,
    isReady,
    sync,
    start,
    stop,
  }
}

/**
 * Hook for sync status display
 * Returns formatted status information
 */
export function useSyncStatus(): {
  status: 'idle' | 'syncing' | 'error' | 'offline'
  lastSyncText: string
  pendingCount: number
  canSync: boolean
} {
  const { state, isReady } = useSyncEngine()

  let status: 'idle' | 'syncing' | 'error' | 'offline' = 'idle'

  if (!state.isRunning) {
    status = 'offline'
  } else if (state.isSyncing) {
    status = 'syncing'
  } else if (state.lastError) {
    status = 'error'
  }

  // Format last sync time
  let lastSyncText = 'Never synced'
  if (state.lastSyncAt) {
    const now = Date.now()
    const diff = now - state.lastSyncAt
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (seconds < 60) {
      lastSyncText = 'Just now'
    } else if (minutes < 60) {
      lastSyncText = `${minutes}m ago`
    } else if (hours < 24) {
      lastSyncText = `${hours}h ago`
    } else {
      lastSyncText = new Date(state.lastSyncAt).toLocaleDateString()
    }
  }

  return {
    status,
    lastSyncText,
    pendingCount: state.pendingCount,
    canSync: isReady && state.isRunning && !state.isSyncing,
  }
}
