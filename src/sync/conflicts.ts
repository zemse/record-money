/**
 * Conflict Resolution Service
 *
 * Handles conflict storage, resolution, and mutation creation:
 * - Stores conflicts in IndexedDB
 * - Supports binary (2 devices) and multi-device (3+) conflicts
 * - Creates ResolveConflict mutations when user picks winner
 */

import { db, generateUUID, queueMutation, getDeviceKeys } from '../db'
import { createSignedMutation, serializeMutation } from './mutations'
import { base64ToBytes } from './crypto'
import type { ResolveConflictOp } from './types'
import type { StoredConflict, ConflictOption } from '../types'

// Re-export types for convenience
export type { StoredConflict, ConflictOption }

// ============================================================================
// Types
// ============================================================================

export type ConflictType = 'field' | 'delete_vs_update' | 'merge_vs_update'

export interface Conflict {
  id: string // unique conflict ID
  type: ConflictType
  targetUuid: string
  targetType: 'record' | 'person' | 'group'
  field?: string // for field conflicts
  options: ConflictOption[] // 2+ options to choose from
  detectedAt: number
  resolvedAt?: number
  winnerMutationUuid?: string
}

// ============================================================================
// Conflict Storage
// ============================================================================

/**
 * Store a new conflict
 */
export async function storeConflict(conflict: Omit<Conflict, 'id'>): Promise<string> {
  const id = generateUUID()
  const storedConflict: StoredConflict = {
    ...conflict,
    id,
    status: 'pending',
  }

  await db.table('conflicts').add(storedConflict)
  return id
}

/**
 * Get all pending conflicts
 */
export async function getPendingConflicts(): Promise<StoredConflict[]> {
  try {
    return await db.table('conflicts').where('status').equals('pending').toArray()
  } catch {
    // Table might not exist yet
    return []
  }
}

/**
 * Get conflict by ID
 */
export async function getConflict(id: string): Promise<StoredConflict | undefined> {
  try {
    return await db.table('conflicts').get(id)
  } catch {
    return undefined
  }
}

/**
 * Get conflicts for a specific target
 */
export async function getConflictsForTarget(targetUuid: string): Promise<StoredConflict[]> {
  try {
    return await db.table('conflicts').where('targetUuid').equals(targetUuid).toArray()
  } catch {
    return []
  }
}

/**
 * Count pending conflicts
 */
export async function countPendingConflicts(): Promise<number> {
  try {
    return await db.table('conflicts').where('status').equals('pending').count()
  } catch {
    return 0
  }
}

// ============================================================================
// Conflict Resolution
// ============================================================================

/**
 * Resolve a conflict by picking a winner
 */
export async function resolveConflict(
  conflictId: string,
  winnerMutationUuid: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const conflict = await getConflict(conflictId)
    if (!conflict) {
      return { success: false, error: 'Conflict not found' }
    }

    if (conflict.status === 'resolved') {
      return { success: false, error: 'Conflict already resolved' }
    }

    // Validate winner is one of the options
    const winnerOption = conflict.options.find((o) => o.mutationUuid === winnerMutationUuid)
    if (!winnerOption) {
      return { success: false, error: 'Invalid winner selection' }
    }

    // Get voided mutations (all except winner)
    const voidedMutationUuids = conflict.options
      .filter((o) => o.mutationUuid !== winnerMutationUuid)
      .map((o) => o.mutationUuid)

    // Create resolve conflict mutation
    await createResolveConflictMutation({
      conflictType: conflict.type,
      winnerMutationUuid,
      voidedMutationUuids,
      targetUuid: conflict.targetUuid,
      targetType: conflict.targetType,
      summary: generateResolutionSummary(conflict, winnerOption),
    })

    // Mark conflict as resolved
    await db.table('conflicts').update(conflictId, {
      status: 'resolved',
      resolvedAt: Date.now(),
      winnerMutationUuid,
    })

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to resolve conflict',
    }
  }
}

/**
 * Resolve multiple conflicts at once (bulk resolution)
 */
export async function resolveConflictsBulk(
  resolutions: Array<{ conflictId: string; winnerMutationUuid: string }>
): Promise<{ success: number; failed: number; errors: string[] }> {
  let success = 0
  let failed = 0
  const errors: string[] = []

  for (const { conflictId, winnerMutationUuid } of resolutions) {
    const result = await resolveConflict(conflictId, winnerMutationUuid)
    if (result.success) {
      success++
    } else {
      failed++
      if (result.error) {
        errors.push(`${conflictId}: ${result.error}`)
      }
    }
  }

  return { success, failed, errors }
}

// ============================================================================
// Mutation Creation
// ============================================================================

async function createResolveConflictMutation(params: {
  conflictType: ConflictType
  winnerMutationUuid: string
  voidedMutationUuids: string[]
  targetUuid: string
  targetType: 'record' | 'person' | 'group'
  summary?: string
}): Promise<void> {
  const deviceKeys = await getDeviceKeys()
  if (!deviceKeys) {
    throw new Error('Device keys not found')
  }

  const authPrivateKey = base64ToBytes(deviceKeys.authPrivateKey)
  const authPublicKey = base64ToBytes(deviceKeys.authPublicKey)

  const operation: ResolveConflictOp = {
    type: 'resolve_conflict',
    conflictType: params.conflictType,
    winnerMutationUuid: params.winnerMutationUuid,
    voidedMutationUuids: params.voidedMutationUuids,
    targetUuid: params.targetUuid,
    summary: params.summary,
  }

  const mutation = createSignedMutation(
    {
      id: Date.now(), // Will be replaced by queue
      targetUuid: params.targetUuid,
      targetType: params.targetType,
      operation,
      timestamp: Date.now(),
      authorDevicePublicKey: authPublicKey,
    },
    authPrivateKey
  )

  await queueMutation(serializeMutation(mutation))
}

// ============================================================================
// Helpers
// ============================================================================

function generateResolutionSummary(conflict: Conflict, winner: ConflictOption): string {
  if (conflict.type === 'field' && conflict.field) {
    return `Kept ${conflict.field}=${JSON.stringify(winner.value)} from ${winner.deviceName || winner.deviceId}`
  }

  if (conflict.type === 'delete_vs_update') {
    const isDelete = winner.value === 'delete'
    return isDelete ? 'Kept deletion' : 'Kept record with updates'
  }

  if (conflict.type === 'merge_vs_update') {
    return `Selected option from ${winner.deviceName || winner.deviceId}`
  }

  return `Resolved conflict, winner: ${winner.mutationUuid}`
}

/**
 * Create a conflict from sync engine detection
 */
export function createConflictFromDetection(params: {
  targetUuid: string
  targetType: 'record' | 'person' | 'group'
  field: string
  localMutationUuid: string
  localValue: unknown
  localDeviceId: string
  remoteMutationUuid: string
  remoteValue: unknown
  remoteDeviceId: string
  localTimestamp?: number
  remoteTimestamp?: number
}): Omit<Conflict, 'id'> {
  const type: ConflictType =
    params.localValue === 'delete' || params.remoteValue === 'delete' ? 'delete_vs_update' : 'field'

  return {
    type,
    targetUuid: params.targetUuid,
    targetType: params.targetType,
    field: params.field,
    options: [
      {
        mutationUuid: params.localMutationUuid,
        deviceId: params.localDeviceId,
        deviceName: 'This device',
        value: params.localValue,
        timestamp: params.localTimestamp || Date.now(),
      },
      {
        mutationUuid: params.remoteMutationUuid,
        deviceId: params.remoteDeviceId,
        value: params.remoteValue,
        timestamp: params.remoteTimestamp || Date.now(),
      },
    ],
    detectedAt: Date.now(),
  }
}

/**
 * Add another option to an existing conflict (for 3+ device conflicts)
 */
export async function addConflictOption(
  conflictId: string,
  option: ConflictOption
): Promise<boolean> {
  const conflict = await getConflict(conflictId)
  if (!conflict || conflict.status === 'resolved') {
    return false
  }

  // Check if option already exists
  if (conflict.options.some((o) => o.mutationUuid === option.mutationUuid)) {
    return false
  }

  const updatedOptions = [...conflict.options, option]
  await db.table('conflicts').update(conflictId, { options: updatedOptions })
  return true
}

/**
 * Check if a conflict exists for a target and field
 */
export async function findExistingConflict(
  targetUuid: string,
  field?: string
): Promise<StoredConflict | undefined> {
  const conflicts = await getConflictsForTarget(targetUuid)
  return conflicts.find((c) => c.status === 'pending' && (field === undefined || c.field === field))
}

// ============================================================================
// Display Helpers
// ============================================================================

/**
 * Get human-readable description of a conflict
 */
export function getConflictDescription(conflict: Conflict): string {
  const optionCount = conflict.options.length

  if (conflict.type === 'field' && conflict.field) {
    if (optionCount === 2) {
      return `"${conflict.field}" was changed to different values on 2 devices`
    }
    return `"${conflict.field}" was changed to ${optionCount} different values`
  }

  if (conflict.type === 'delete_vs_update') {
    return 'This record was deleted on one device and updated on another'
  }

  if (conflict.type === 'merge_vs_update') {
    return 'A person was merged on one device and updated on another'
  }

  return 'Conflicting changes detected'
}

/**
 * Format a conflict option value for display
 */
export function formatOptionValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '(empty)'
  }

  if (value === 'delete') {
    return 'Delete'
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

/**
 * Get relative time string
 */
export function getRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}
