/**
 * Publishing Service
 *
 * Handles mutation creation and publishing for local CRUD operations:
 * - Creates signed mutations for record/person/group changes
 * - Queues mutations for publishing
 * - Publishes to IPFS and updates IPNS
 * - Supports full replication of imported mutations
 */

import {
  db,
  generateUUID,
  getSyncConfig,
  getDeviceKeys,
  queueMutation,
  getPendingMutations,
  markMutationsPublished,
  getNextMutationId,
} from '../db'
import { getConfiguredProvider, getDeviceKeysAsBytes } from './device-setup'
import { createSignedMutation, serializeMutation, deserializeMutation } from './mutations'
import {
  createDeviceManifest,
  serializeDeviceManifest,
  createEncryptedDeviceRing,
  createEncryptedMutationChunk,
  createMutationChunk,
  deserializeDeviceManifest,
  decryptDeviceManifest,
} from './schemas'
import { base64ToBytes, bytesToBase64 } from './crypto'
import type {
  Mutation,
  CreateOp,
  UpdateOp,
  DeleteOp,
  FieldChange,
  DeviceRing,
  MutationChunks,
  ExpenseRecord as SyncExpenseRecord,
  Person,
} from './types'
import type { ExpenseRecord } from '../types'

// ============================================================================
// Types
// ============================================================================

export interface PublishResult {
  success: boolean
  mutationCount: number
  error?: string
}

export type MutationTargetType = 'record' | 'person' | 'group'

// ============================================================================
// Mutation Creation
// ============================================================================

/**
 * Check if sync is enabled
 */
export async function isSyncEnabled(): Promise<boolean> {
  const config = await getSyncConfig()
  return config?.mode === 'synced'
}

/**
 * Create a mutation for a new record
 */
export async function createRecordMutation(record: ExpenseRecord): Promise<void> {
  if (!(await isSyncEnabled())) return

  const deviceKeys = await getDeviceKeysAsBytes()
  if (!deviceKeys) return

  // Convert to sync record format (assuming paidBy/paidFor already use personUuid)
  const syncRecord: SyncExpenseRecord = {
    uuid: record.uuid,
    title: record.title,
    description: record.description,
    category: record.category,
    amount: record.amount,
    currency: record.currency,
    date: record.date,
    time: record.time,
    icon: record.icon,
    paidBy: record.paidBy.map((p) => ({ personUuid: p.email, share: p.share })), // TODO: proper mapping
    paidFor: record.paidFor.map((p) => ({ personUuid: p.email, share: p.share })),
    shareType: record.shareType,
    groupId: record.groupId,
    accounts: record.accounts,
    comments: record.comments,
    sourceHash: record.sourceHash,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }

  const operation: CreateOp = {
    type: 'create',
    data: syncRecord as unknown as Record<string, unknown>,
  }

  await createAndQueueMutation({
    targetUuid: record.uuid,
    targetType: 'record',
    operation,
    deviceKeys,
  })
}

/**
 * Create a mutation for updating a record
 */
export async function updateRecordMutation(
  uuid: string,
  oldRecord: ExpenseRecord,
  newRecord: Partial<ExpenseRecord>
): Promise<void> {
  if (!(await isSyncEnabled())) return

  const deviceKeys = await getDeviceKeysAsBytes()
  if (!deviceKeys) return

  // Build field changes
  const changes: FieldChange[] = []

  // Check scalar fields
  const scalarFields = [
    'title',
    'description',
    'category',
    'amount',
    'currency',
    'date',
    'time',
    'icon',
    'shareType',
    'groupId',
    'comments',
  ] as const

  for (const field of scalarFields) {
    if (field in newRecord && newRecord[field] !== oldRecord[field]) {
      changes.push({
        field,
        old: oldRecord[field],
        new: newRecord[field],
      })
    }
  }

  // Check array fields (paidBy, paidFor, accounts)
  if (newRecord.paidBy && JSON.stringify(newRecord.paidBy) !== JSON.stringify(oldRecord.paidBy)) {
    changes.push({
      field: 'paidBy',
      old: oldRecord.paidBy,
      new: newRecord.paidBy,
    })
  }

  if (
    newRecord.paidFor &&
    JSON.stringify(newRecord.paidFor) !== JSON.stringify(oldRecord.paidFor)
  ) {
    changes.push({
      field: 'paidFor',
      old: oldRecord.paidFor,
      new: newRecord.paidFor,
    })
  }

  if (
    newRecord.accounts &&
    JSON.stringify(newRecord.accounts) !== JSON.stringify(oldRecord.accounts)
  ) {
    changes.push({
      field: 'accounts',
      old: oldRecord.accounts,
      new: newRecord.accounts,
    })
  }

  if (changes.length === 0) return // No actual changes

  const operation: UpdateOp = {
    type: 'update',
    changes,
  }

  await createAndQueueMutation({
    targetUuid: uuid,
    targetType: 'record',
    operation,
    deviceKeys,
  })
}

/**
 * Create a mutation for deleting a record
 */
export async function deleteRecordMutation(uuid: string): Promise<void> {
  if (!(await isSyncEnabled())) return

  const deviceKeys = await getDeviceKeysAsBytes()
  if (!deviceKeys) return

  const operation: DeleteOp = {
    type: 'delete',
  }

  await createAndQueueMutation({
    targetUuid: uuid,
    targetType: 'record',
    operation,
    deviceKeys,
  })
}

/**
 * Create a mutation for a new person
 */
export async function createPersonMutation(person: Person): Promise<void> {
  if (!(await isSyncEnabled())) return

  const deviceKeys = await getDeviceKeysAsBytes()
  if (!deviceKeys) return

  const operation: CreateOp = {
    type: 'create',
    data: person as unknown as Record<string, unknown>,
  }

  await createAndQueueMutation({
    targetUuid: person.uuid,
    targetType: 'person',
    operation,
    deviceKeys,
  })
}

// ============================================================================
// Internal Helpers
// ============================================================================

async function createAndQueueMutation(params: {
  targetUuid: string
  targetType: MutationTargetType
  operation: CreateOp | UpdateOp | DeleteOp
  deviceKeys: Awaited<ReturnType<typeof getDeviceKeysAsBytes>>
}): Promise<void> {
  const { targetUuid, targetType, operation, deviceKeys } = params
  if (!deviceKeys) return

  const id = await getNextMutationId()
  const timestamp = Date.now()

  const mutation = createSignedMutation(
    {
      id,
      targetUuid,
      targetType,
      operation,
      timestamp,
      authorDevicePublicKey: deviceKeys.authPublicKey,
    },
    deviceKeys.authPrivateKey
  )

  await queueMutation(serializeMutation(mutation))

  // Trigger publish in background (non-blocking)
  publishPendingMutations().catch(console.error)
}

// ============================================================================
// Publishing
// ============================================================================

let isPublishing = false

/**
 * Publish all pending mutations to IPFS
 */
export async function publishPendingMutations(): Promise<PublishResult> {
  // Prevent concurrent publishing
  if (isPublishing) {
    return { success: false, mutationCount: 0, error: 'Publishing in progress' }
  }

  isPublishing = true

  try {
    const pending = await getPendingMutations()
    if (pending.length === 0) {
      return { success: true, mutationCount: 0 }
    }

    const provider = await getConfiguredProvider()
    if (!provider) {
      return { success: false, mutationCount: 0, error: 'No provider configured' }
    }

    const config = await getSyncConfig()
    if (!config?.personalKey || !config?.broadcastKey) {
      return { success: false, mutationCount: 0, error: 'Sync keys not configured' }
    }

    const deviceKeys = await getDeviceKeysAsBytes()
    if (!deviceKeys) {
      return { success: false, mutationCount: 0, error: 'Device keys not found' }
    }

    const personalKey = base64ToBytes(config.personalKey)
    const broadcastKey = base64ToBytes(config.broadcastKey)

    // Parse pending mutations
    const mutations: Mutation[] = pending.map((p) => deserializeMutation(p.mutationJson))

    // Get current chunk index (or start fresh)
    let chunkIndex: MutationChunks = []
    let latestMutationId = 0
    let oldManifestCid: string | undefined

    // Try to get existing manifest
    try {
      const ipnsName = bytesToBase64(deviceKeys.ipnsPublicKey)
      const existingCid = await provider.resolveIpns(ipnsName)
      if (existingCid) {
        oldManifestCid = existingCid
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

    // Create encrypted database snapshot
    // For now, create a minimal placeholder - full implementation would serialize current db state
    const databasePlaceholder = new TextEncoder().encode(JSON.stringify({ version: 1 }))
    const { cid: databaseCid } = await provider.upload(databasePlaceholder, 'database')

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

    // Create peer directory (placeholder)
    const peerDirectoryBytes = new TextEncoder().encode(JSON.stringify({ entries: [] }))
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

    // Unpin old manifest if exists
    if (oldManifestCid && oldManifestCid !== manifestCid) {
      try {
        await provider.unpin(oldManifestCid)
      } catch {
        // Ignore unpin errors
      }
    }

    // Mark mutations as published
    await markMutationsPublished(pending.map((p) => p.id))

    return { success: true, mutationCount: pending.length }
  } catch (error) {
    return {
      success: false,
      mutationCount: 0,
      error: error instanceof Error ? error.message : 'Publishing failed',
    }
  } finally {
    isPublishing = false
  }
}

/**
 * Import and republish mutations from another device (full replication)
 */
export async function replicateMutations(mutations: Mutation[]): Promise<void> {
  if (!(await isSyncEnabled())) return

  // Store imported mutations in queue with 'pending' status
  // They will be republished with our other mutations
  for (const mutation of mutations) {
    await queueMutation(serializeMutation(mutation))
  }

  // Trigger publish
  await publishPendingMutations()
}

// ============================================================================
// CRUD Wrappers
// ============================================================================

/**
 * Add a record and create mutation
 */
export async function addRecord(record: ExpenseRecord): Promise<void> {
  await db.records.add(record)
  await createRecordMutation(record)
}

/**
 * Update a record and create mutation
 */
export async function updateRecord(uuid: string, updates: Partial<ExpenseRecord>): Promise<void> {
  const oldRecord = await db.records.get(uuid)
  if (!oldRecord) throw new Error('Record not found')

  await db.records.update(uuid, updates)
  await updateRecordMutation(uuid, oldRecord, updates)
}

/**
 * Delete a record and create mutation
 */
export async function deleteRecord(uuid: string): Promise<void> {
  await db.records.delete(uuid)
  await deleteRecordMutation(uuid)
}

// ============================================================================
// Status
// ============================================================================

/**
 * Get publishing status
 */
export function getPublishingStatus(): { isPublishing: boolean } {
  return { isPublishing }
}

/**
 * Get pending mutation count
 */
export async function getPendingMutationCount(): Promise<number> {
  const pending = await getPendingMutations()
  return pending.length
}
