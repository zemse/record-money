/**
 * CID Manager
 *
 * Tracks CIDs and handles unpinning of old/unused content.
 * Maintains a history of CIDs to enable garbage collection.
 */

import type { IpfsProvider } from './types'

// ============================================================================
// Types
// ============================================================================

export interface CidEntry {
  cid: string
  type: 'manifest' | 'database' | 'mutations' | 'device-ring' | 'peer-directory' | 'group-manifest'
  createdAt: number
  metadata?: Record<string, string>
}

export interface CidHistory {
  current: CidEntry | null
  previous: CidEntry[]
}

// ============================================================================
// CID Manager
// ============================================================================

export class CidManager {
  private provider: IpfsProvider
  private history: Map<string, CidHistory> = new Map() // key -> history
  private maxHistorySize: number

  constructor(provider: IpfsProvider, maxHistorySize = 5) {
    this.provider = provider
    this.maxHistorySize = maxHistorySize
  }

  /**
   * Record a new CID for a key, marking the old one as previous
   * @param key Unique identifier for this content type (e.g., 'manifest', 'device-ring-{deviceId}')
   * @param entry New CID entry
   * @param unpinOld Whether to unpin the old CID (default: true)
   */
  async recordCid(key: string, entry: CidEntry, unpinOld = true): Promise<void> {
    const history = this.history.get(key) || { current: null, previous: [] }

    // Move current to previous if it exists
    if (history.current) {
      history.previous.unshift(history.current)

      // Unpin old CIDs beyond history limit
      if (unpinOld && history.previous.length > this.maxHistorySize) {
        const toUnpin = history.previous.splice(this.maxHistorySize)
        await this.unpinMany(toUnpin.map((e) => e.cid))
      }
    }

    // Set new current
    history.current = entry
    this.history.set(key, history)
  }

  /**
   * Get the current CID for a key
   */
  getCurrentCid(key: string): CidEntry | null {
    return this.history.get(key)?.current || null
  }

  /**
   * Get the history for a key
   */
  getHistory(key: string): CidHistory | null {
    return this.history.get(key) || null
  }

  /**
   * Unpin a single CID
   */
  async unpin(cid: string): Promise<void> {
    try {
      await this.provider.unpin(cid)
    } catch (error) {
      // Log but don't throw - unpinning failures are non-critical
      console.warn(`Failed to unpin ${cid}:`, error)
    }
  }

  /**
   * Unpin multiple CIDs in parallel
   */
  async unpinMany(cids: string[]): Promise<void> {
    await Promise.all(cids.map((cid) => this.unpin(cid)))
  }

  /**
   * Unpin all previous CIDs for a key, keeping only current
   */
  async unpinOldVersions(key: string): Promise<void> {
    const history = this.history.get(key)
    if (!history || history.previous.length === 0) return

    await this.unpinMany(history.previous.map((e) => e.cid))
    history.previous = []
    this.history.set(key, history)
  }

  /**
   * Unpin all tracked CIDs (for cleanup/reset)
   */
  async unpinAll(): Promise<void> {
    const allCids: string[] = []

    for (const history of this.history.values()) {
      if (history.current) {
        allCids.push(history.current.cid)
      }
      allCids.push(...history.previous.map((e) => e.cid))
    }

    await this.unpinMany(allCids)
    this.history.clear()
  }

  /**
   * Get all tracked CIDs
   */
  getAllCids(): CidEntry[] {
    const all: CidEntry[] = []

    for (const history of this.history.values()) {
      if (history.current) {
        all.push(history.current)
      }
      all.push(...history.previous)
    }

    return all
  }

  /**
   * Export history for persistence
   */
  export(): Map<string, CidHistory> {
    return new Map(this.history)
  }

  /**
   * Import history from persistence
   */
  import(data: Map<string, CidHistory> | Record<string, CidHistory>): void {
    if (data instanceof Map) {
      this.history = new Map(data)
    } else {
      this.history = new Map(Object.entries(data))
    }
  }

  /**
   * Set the provider (for switching providers)
   */
  setProvider(provider: IpfsProvider): void {
    this.provider = provider
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createCidManager(provider: IpfsProvider, maxHistorySize?: number): CidManager {
  return new CidManager(provider, maxHistorySize)
}
