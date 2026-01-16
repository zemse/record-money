/**
 * Sync Engine
 *
 * Handles synchronization between devices:
 * - Adaptive polling (15s foreground, 5min background)
 * - Page visibility detection
 * - Rate limit backoff
 * - Mutation fetch/verify/apply
 * - Change detection and dedup
 * - Sync state tracking
 */

import {
  db,
  getSyncConfig,
  updateSyncConfig,
  getPendingMutations,
  markMutationsPublished,
  getAllPeerSyncStates,
  updatePeerSyncState,
  getPeerSyncState,
  getDeviceKeys,
} from '../db'
import { getConfiguredProvider, getDeviceKeysAsBytes } from './device-setup'
import {
  deserializeDeviceManifest,
  decryptDeviceManifest,
  decryptDeviceRing,
  findChunksToSync,
  decryptMutationChunk,
  createDeviceManifest,
  serializeDeviceManifest,
  createEncryptedDeviceRing,
  createEncryptedMutationChunk,
  createMutationChunk,
} from './schemas'
import { verifyMutation, deserializeMutation } from './mutations'
import { base64ToBytes, bytesToBase64 } from './crypto'
import type { Mutation, DeviceRing, MutationChunks } from './types'
import type { PeerSyncState } from '../types'

// ============================================================================
// Types
// ============================================================================

export interface SyncEngineState {
  isRunning: boolean
  isSyncing: boolean
  lastSyncAt: number | null
  lastError: string | null
  pendingCount: number
  consecutiveFailures: number
}

export interface SyncResult {
  success: boolean
  newMutations: number
  publishedMutations: number
  conflicts: ConflictInfo[]
  error?: string
}

export interface ConflictInfo {
  recordUuid: string
  field: string
  localValue: unknown
  remoteValue: unknown
  localMutationUuid: string
  remoteMutationUuid: string
}

export type SyncEventType =
  | 'sync_start'
  | 'sync_complete'
  | 'sync_error'
  | 'mutation_received'
  | 'conflict_detected'
  | 'state_change'

export type SyncEventListener = (event: SyncEventType, data?: unknown) => void

// ============================================================================
// Constants
// ============================================================================

const FOREGROUND_INTERVAL = 15_000 // 15 seconds
const BACKGROUND_INTERVAL = 300_000 // 5 minutes
const MIN_BACKOFF = 5_000 // 5 seconds
const MAX_BACKOFF = 300_000 // 5 minutes
const MAX_CONSECUTIVE_FAILURES = 10

// ============================================================================
// Sync Engine Class
// ============================================================================

export class SyncEngine {
  private state: SyncEngineState = {
    isRunning: false,
    isSyncing: false,
    lastSyncAt: null,
    lastError: null,
    pendingCount: 0,
    consecutiveFailures: 0,
  }

  private pollInterval: number | null = null
  private isVisible: boolean = true
  private listeners: Set<SyncEventListener> = new Set()

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Start the sync engine
   */
  async start(): Promise<void> {
    if (this.state.isRunning) return

    // Check if sync is enabled
    const config = await getSyncConfig()
    if (config?.mode !== 'synced') {
      return
    }

    this.state.isRunning = true
    this.emit('state_change', this.state)

    // Set up visibility listener
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange)
      this.isVisible = document.visibilityState === 'visible'
    }

    // Start polling
    this.scheduleNextPoll()

    // Initial sync
    await this.sync()
  }

  /**
   * Stop the sync engine
   */
  stop(): void {
    if (!this.state.isRunning) return

    this.state.isRunning = false
    this.emit('state_change', this.state)

    // Clear polling
    if (this.pollInterval !== null) {
      clearTimeout(this.pollInterval)
      this.pollInterval = null
    }

    // Remove visibility listener
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    }
  }

  /**
   * Get current sync state
   */
  getState(): SyncEngineState {
    return { ...this.state }
  }

  /**
   * Add event listener
   */
  addEventListener(listener: SyncEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // ============================================================================
  // Visibility Handling
  // ============================================================================

  private handleVisibilityChange = (): void => {
    const wasVisible = this.isVisible
    this.isVisible = document.visibilityState === 'visible'

    if (!wasVisible && this.isVisible) {
      // Became visible - sync immediately and reset to foreground interval
      this.scheduleNextPoll()
      this.sync()
    } else if (wasVisible && !this.isVisible) {
      // Became hidden - reschedule with background interval
      this.scheduleNextPoll()
    }
  }

  // ============================================================================
  // Polling
  // ============================================================================

  private scheduleNextPoll(): void {
    if (this.pollInterval !== null) {
      clearTimeout(this.pollInterval)
    }

    if (!this.state.isRunning) return

    // Calculate interval based on visibility and backoff
    let interval = this.isVisible ? FOREGROUND_INTERVAL : BACKGROUND_INTERVAL

    // Apply backoff if there have been failures
    if (this.state.consecutiveFailures > 0) {
      const backoff = Math.min(
        MIN_BACKOFF * Math.pow(2, this.state.consecutiveFailures - 1),
        MAX_BACKOFF
      )
      interval = Math.max(interval, backoff)
    }

    // Use globalThis for compatibility with Node.js tests
    const timer = typeof window !== 'undefined' ? window : globalThis
    this.pollInterval = timer.setTimeout(() => {
      this.sync()
    }, interval) as unknown as number
  }

  // ============================================================================
  // Main Sync
  // ============================================================================

  /**
   * Perform a sync cycle
   */
  async sync(): Promise<SyncResult> {
    if (this.state.isSyncing) {
      return { success: false, newMutations: 0, publishedMutations: 0, conflicts: [] }
    }

    this.state.isSyncing = true
    this.emit('sync_start')

    const result: SyncResult = {
      success: true,
      newMutations: 0,
      publishedMutations: 0,
      conflicts: [],
    }

    try {
      // 1. Publish pending mutations first
      const publishResult = await this.publishPendingMutations()
      result.publishedMutations = publishResult.count

      // 2. Fetch mutations from all peers
      const fetchResult = await this.fetchFromPeers()
      result.newMutations = fetchResult.newMutations
      result.conflicts = fetchResult.conflicts

      // Reset failure count on success
      this.state.consecutiveFailures = 0
      this.state.lastSyncAt = Date.now()
      this.state.lastError = null

      this.emit('sync_complete', result)
    } catch (error) {
      result.success = false
      result.error = error instanceof Error ? error.message : 'Sync failed'

      this.state.consecutiveFailures = Math.min(
        this.state.consecutiveFailures + 1,
        MAX_CONSECUTIVE_FAILURES
      )
      this.state.lastError = result.error

      this.emit('sync_error', result.error)
    } finally {
      this.state.isSyncing = false
      this.emit('state_change', this.state)
      this.scheduleNextPoll()
    }

    return result
  }

  /**
   * Manual sync trigger
   */
  async manualSync(): Promise<SyncResult> {
    // Reset backoff on manual sync
    this.state.consecutiveFailures = 0
    return this.sync()
  }

  // ============================================================================
  // Publishing
  // ============================================================================

  private async publishPendingMutations(): Promise<{ count: number }> {
    const pending = await getPendingMutations()
    if (pending.length === 0) {
      this.state.pendingCount = 0
      return { count: 0 }
    }

    const provider = await getConfiguredProvider()
    if (!provider) {
      throw new Error('No provider configured')
    }

    const config = await getSyncConfig()
    if (!config?.personalKey || !config?.broadcastKey) {
      throw new Error('Sync keys not configured')
    }

    const deviceKeys = await getDeviceKeysAsBytes()
    if (!deviceKeys) {
      throw new Error('Device keys not found')
    }

    const personalKey = base64ToBytes(config.personalKey)
    const broadcastKey = base64ToBytes(config.broadcastKey)

    // Parse pending mutations
    const mutations: Mutation[] = pending.map((p) => deserializeMutation(p.mutationJson))

    // Get current chunk index (or start fresh)
    let chunkIndex: MutationChunks = []
    let latestMutationId = 0

    // Try to get existing manifest
    try {
      const ipnsName = bytesToBase64(deviceKeys.ipnsPublicKey)
      const existingCid = await provider.resolveIpns(ipnsName)
      if (existingCid) {
        const manifestBytes = await provider.fetch(existingCid)
        const serializedManifest = deserializeDeviceManifest(manifestBytes)
        const decrypted = await decryptDeviceManifest(serializedManifest, personalKey)
        chunkIndex = decrypted.chunkIndex
        latestMutationId = decrypted.latestMutationId
      }
    } catch {
      // No existing manifest, starting fresh
    }

    // Create new chunk with pending mutations
    const startId = latestMutationId + 1
    const endId = Math.max(...mutations.map((m) => m.id))

    const encryptedChunk = await createEncryptedMutationChunk(mutations, personalKey)
    const { cid: chunkCid } = await provider.upload(encryptedChunk, `mutations-${startId}-${endId}`)

    chunkIndex.push(createMutationChunk(startId, endId, chunkCid))

    // Create encrypted database (placeholder - would need actual db state)
    // For now, just create an empty placeholder
    const databaseBytes = new Uint8Array([])
    const { cid: databaseCid } = await provider.upload(databaseBytes, 'database')

    // Create device ring
    const deviceRing: DeviceRing = {
      devices: [
        {
          authPublicKey: deviceKeys.authPublicKey,
          ipnsPublicKey: deviceKeys.ipnsPublicKey,
          lastSyncedId: endId,
        },
      ],
    }
    const encryptedRing = await createEncryptedDeviceRing(deviceRing, broadcastKey)
    const { cid: deviceRingCid } = await provider.upload(encryptedRing, 'device-ring')

    // Create peer directory (placeholder for now)
    const peerDirectoryBytes = new Uint8Array(
      JSON.stringify({ entries: [] })
        .split('')
        .map((c) => c.charCodeAt(0))
    )
    const { cid: peerDirectoryCid } = await provider.upload(peerDirectoryBytes, 'peer-directory')

    // Create and publish manifest
    const manifest = await createDeviceManifest({
      databaseCid,
      latestMutationId: endId,
      chunkIndex,
      deviceRingCid,
      peerDirectoryCid,
      personalKey,
    })

    const manifestBytes = serializeDeviceManifest(manifest)
    const { cid: manifestCid } = await provider.upload(manifestBytes, 'manifest')

    // Publish to IPNS
    await provider.publishIpns(deviceKeys.ipnsPrivateKey, manifestCid)

    // Mark mutations as published
    await markMutationsPublished(pending.map((p) => p.id))
    this.state.pendingCount = 0

    return { count: pending.length }
  }

  // ============================================================================
  // Fetching
  // ============================================================================

  private async fetchFromPeers(): Promise<{
    newMutations: number
    conflicts: ConflictInfo[]
  }> {
    const peers = await getAllPeerSyncStates()
    let totalNewMutations = 0
    const allConflicts: ConflictInfo[] = []

    const provider = await getConfiguredProvider()
    if (!provider) {
      return { newMutations: 0, conflicts: [] }
    }

    const config = await getSyncConfig()
    if (!config?.personalKey || !config?.broadcastKey) {
      return { newMutations: 0, conflicts: [] }
    }

    const personalKey = base64ToBytes(config.personalKey)
    const broadcastKey = base64ToBytes(config.broadcastKey)

    for (const peer of peers) {
      try {
        const result = await this.fetchFromPeer(peer, provider, personalKey, broadcastKey)
        totalNewMutations += result.newMutations
        allConflicts.push(...result.conflicts)

        // Update peer sync state on success
        await updatePeerSyncState(peer.deviceId, {
          lastSyncedAt: Date.now(),
          consecutiveFailures: 0,
        })
      } catch (error) {
        // Update failure count for this peer
        await updatePeerSyncState(peer.deviceId, {
          lastAttemptedAt: Date.now(),
          consecutiveFailures: peer.consecutiveFailures + 1,
        })
      }
    }

    return { newMutations: totalNewMutations, conflicts: allConflicts }
  }

  private async fetchFromPeer(
    peer: PeerSyncState,
    provider: Awaited<ReturnType<typeof getConfiguredProvider>>,
    personalKey: Uint8Array,
    broadcastKey: Uint8Array
  ): Promise<{ newMutations: number; conflicts: ConflictInfo[] }> {
    if (!provider) {
      return { newMutations: 0, conflicts: [] }
    }

    // Resolve peer's IPNS
    const manifestCid = await provider.resolveIpns(peer.ipnsPublicKey)
    if (!manifestCid) {
      return { newMutations: 0, conflicts: [] }
    }

    // Fetch and decrypt manifest
    const manifestBytes = await provider.fetch(manifestCid)
    const serializedManifest = deserializeDeviceManifest(manifestBytes)

    // Decrypt device ring to get peer's broadcast key
    const deviceRingBytes = await provider.fetch(serializedManifest.deviceRingCid)
    const deviceRing = await decryptDeviceRing(deviceRingBytes, broadcastKey)

    // Find peer's latest mutation ID
    const peerDevice = deviceRing.devices.find(
      (d) => bytesToBase64(d.ipnsPublicKey) === peer.ipnsPublicKey
    )
    if (!peerDevice) {
      return { newMutations: 0, conflicts: [] }
    }

    const peerLatestId = peerDevice.lastSyncedId
    if (peerLatestId <= peer.lastSyncedId) {
      // No new mutations
      return { newMutations: 0, conflicts: [] }
    }

    // Decrypt chunk index
    const decryptedManifest = await decryptDeviceManifest(serializedManifest, personalKey)

    // Find chunks to sync
    const chunksToSync = findChunksToSync(decryptedManifest.chunkIndex, peer.lastSyncedId)

    let newMutations = 0
    const conflicts: ConflictInfo[] = []
    const peerAuthPublicKey = base64ToBytes(peer.ipnsPublicKey) // Would need actual auth key

    for (const chunk of chunksToSync) {
      const chunkBytes = await provider.fetch(chunk.cid)
      const mutations = await decryptMutationChunk(chunkBytes, personalKey)

      for (const mutation of mutations) {
        // Skip if already processed
        if (mutation.id <= peer.lastSyncedId) continue

        // Verify mutation
        if (!verifyMutation(mutation)) {
          console.warn('Invalid mutation signature:', mutation.uuid)
          continue
        }

        // Check for conflicts
        const conflict = await this.detectConflict(mutation)
        if (conflict) {
          conflicts.push(conflict)
          this.emit('conflict_detected', conflict)
        } else {
          // Apply mutation
          await this.applyMutation(mutation)
          newMutations++
          this.emit('mutation_received', mutation)
        }
      }
    }

    // Update last synced ID
    await updatePeerSyncState(peer.deviceId, {
      lastSyncedId: peerLatestId,
    })

    return { newMutations, conflicts }
  }

  // ============================================================================
  // Mutation Processing
  // ============================================================================

  private async detectConflict(mutation: Mutation): Promise<ConflictInfo | null> {
    // Get pending mutations that might conflict
    const pending = await getPendingMutations()

    for (const pendingMutation of pending) {
      const localMutation = deserializeMutation(pendingMutation.mutationJson)

      // Same target, same operation type
      if (
        localMutation.targetUuid === mutation.targetUuid &&
        localMutation.targetType === mutation.targetType
      ) {
        // Check for field-level conflicts in update operations
        if (localMutation.operation.type === 'update' && mutation.operation.type === 'update') {
          const localChanges = localMutation.operation.changes
          const remoteChanges = mutation.operation.changes

          for (const localChange of localChanges) {
            for (const remoteChange of remoteChanges) {
              // Check if same field with same old value but different new values
              if (
                'field' in localChange &&
                'field' in remoteChange &&
                localChange.field === remoteChange.field &&
                'old' in localChange &&
                'old' in remoteChange &&
                JSON.stringify(localChange.old) === JSON.stringify(remoteChange.old) &&
                'new' in localChange &&
                'new' in remoteChange &&
                JSON.stringify(localChange.new) !== JSON.stringify(remoteChange.new)
              ) {
                return {
                  recordUuid: mutation.targetUuid,
                  field: localChange.field,
                  localValue: localChange.new,
                  remoteValue: remoteChange.new,
                  localMutationUuid: localMutation.uuid,
                  remoteMutationUuid: mutation.uuid,
                }
              }
            }
          }
        }

        // Delete vs Update conflict
        if (
          (localMutation.operation.type === 'delete' && mutation.operation.type === 'update') ||
          (localMutation.operation.type === 'update' && mutation.operation.type === 'delete')
        ) {
          return {
            recordUuid: mutation.targetUuid,
            field: '_entity',
            localValue: localMutation.operation.type,
            remoteValue: mutation.operation.type,
            localMutationUuid: localMutation.uuid,
            remoteMutationUuid: mutation.uuid,
          }
        }
      }
    }

    return null
  }

  private async applyMutation(mutation: Mutation): Promise<void> {
    // Apply mutation to local database based on type
    switch (mutation.targetType) {
      case 'record':
        await this.applyRecordMutation(mutation)
        break
      case 'person':
        await this.applyPersonMutation(mutation)
        break
      case 'group':
        await this.applyGroupMutation(mutation)
        break
      case 'device':
        await this.applyDeviceMutation(mutation)
        break
    }
  }

  private async applyRecordMutation(mutation: Mutation): Promise<void> {
    switch (mutation.operation.type) {
      case 'create': {
        // Convert sync record format to local record format
        // This would need proper mapping from sync types to local types
        const data = mutation.operation.data as Record<string, unknown>
        // For now, just log - actual implementation would insert into db.records
        console.log('Would create record:', data)
        break
      }
      case 'update': {
        const changes = mutation.operation.changes
        const updates: Record<string, unknown> = {}
        for (const change of changes) {
          if ('field' in change && 'new' in change) {
            updates[change.field] = change.new
          }
        }
        // Would update db.records with changes
        console.log('Would update record:', mutation.targetUuid, updates)
        break
      }
      case 'delete': {
        // Would delete from db.records
        console.log('Would delete record:', mutation.targetUuid)
        break
      }
    }
  }

  private async applyPersonMutation(mutation: Mutation): Promise<void> {
    // Similar to applyRecordMutation but for persons/users
    console.log('Would apply person mutation:', mutation.operation.type, mutation.targetUuid)
  }

  private async applyGroupMutation(mutation: Mutation): Promise<void> {
    // Similar to applyRecordMutation but for groups
    console.log('Would apply group mutation:', mutation.operation.type, mutation.targetUuid)
  }

  private async applyDeviceMutation(mutation: Mutation): Promise<void> {
    // Handle device additions/removals
    console.log('Would apply device mutation:', mutation.operation.type, mutation.targetUuid)
  }

  // ============================================================================
  // Event Emission
  // ============================================================================

  private emit(event: SyncEventType, data?: unknown): void {
    for (const listener of this.listeners) {
      try {
        listener(event, data)
      } catch (error) {
        console.error('Sync event listener error:', error)
      }
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let syncEngineInstance: SyncEngine | null = null

export function getSyncEngine(): SyncEngine {
  if (!syncEngineInstance) {
    syncEngineInstance = new SyncEngine()
  }
  return syncEngineInstance
}

/**
 * Start sync engine if sync is enabled
 */
export async function initializeSyncEngine(): Promise<void> {
  const config = await getSyncConfig()
  if (config?.mode === 'synced') {
    const engine = getSyncEngine()
    await engine.start()
  }
}

/**
 * Stop sync engine
 */
export function stopSyncEngine(): void {
  if (syncEngineInstance) {
    syncEngineInstance.stop()
  }
}
