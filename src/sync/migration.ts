/**
 * Solo Data Migration Service
 *
 * Handles migration of solo data to sync-compatible format:
 * - Converts Users (email-based) to Persons (UUID-based)
 * - Creates mutations for all existing entities
 * - Signs mutations with device key
 * - Updates record references from email to personUuid
 */

import { db, generateUUID, getSyncConfig, updateSyncConfig, queueMutation } from '../db'
import type { User, Group, ExpenseRecord as LegacyExpenseRecord } from '../types'
import type {
  Mutation,
  Person,
  ExpenseRecord as SyncExpenseRecord,
  Participant,
  CreateOp,
  Group as SyncGroup,
} from './types'
import { bytesToBase64 } from './crypto'
import { getDeviceKeysAsBytes } from './device-setup'
import {
  createSignedMutation as createSignedMutationFromMutations,
  serializeMutation,
} from './mutations'

// ============================================================================
// Types
// ============================================================================

export interface MigrationProgress {
  stage: 'preparing' | 'users' | 'records' | 'groups' | 'finalizing' | 'complete'
  current: number
  total: number
  message: string
}

export type MigrationProgressCallback = (progress: MigrationProgress) => void

export interface MigrationResult {
  success: boolean
  error?: string
  stats?: {
    persons: number
    records: number
    groups: number
    mutations: number
  }
}

interface EmailToPersonMapping {
  email: string
  personUuid: string
}

// ============================================================================
// Mutation Creation
// ============================================================================

/**
 * Create and sign a mutation for migration
 */
function createMigrationMutation(params: {
  id: number
  targetUuid: string
  targetType: Mutation['targetType']
  operation: Mutation['operation']
  timestamp: number
  authPrivateKey: Uint8Array
  authPublicKey: Uint8Array
}): Mutation {
  const { id, targetUuid, targetType, operation, timestamp, authPrivateKey, authPublicKey } = params

  return createSignedMutationFromMutations(
    {
      id,
      targetUuid,
      targetType,
      operation,
      timestamp,
      authorDevicePublicKey: authPublicKey,
    },
    authPrivateKey
  )
}

/**
 * Serialize mutation for storage (using mutations.ts serializer)
 */
function serializeMutationForQueue(mutation: Mutation): string {
  return serializeMutation(mutation)
}

// ============================================================================
// Data Conversion
// ============================================================================

/**
 * Convert a User to a Person
 */
function userToPerson(user: User, uuid: string, isSelf: boolean): Person {
  return {
    uuid,
    name: user.alias,
    email: user.email,
    addedAt: Date.now(),
    isSelf,
  }
}

/**
 * Convert legacy participant (email-based) to sync participant (personUuid-based)
 */
function convertParticipant(
  participant: { email: string; share: number },
  emailToUuid: Map<string, string>
): Participant {
  const personUuid = emailToUuid.get(participant.email)
  if (!personUuid) {
    throw new Error(`No person mapping for email: ${participant.email}`)
  }
  return {
    personUuid,
    share: participant.share,
  }
}

/**
 * Convert legacy expense record to sync-compatible record
 */
function convertExpenseRecord(
  record: LegacyExpenseRecord,
  emailToUuid: Map<string, string>
): SyncExpenseRecord {
  return {
    uuid: record.uuid,
    title: record.title,
    description: record.description,
    category: record.category,
    amount: record.amount,
    currency: record.currency,
    date: record.date,
    time: record.time,
    icon: record.icon,
    paidBy: record.paidBy.map((p) => convertParticipant(p, emailToUuid)),
    paidFor: record.paidFor.map((p) => convertParticipant(p, emailToUuid)),
    shareType: record.shareType,
    groupId: record.groupId,
    accounts: record.accounts,
    comments: record.comments,
    sourceHash: record.sourceHash,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

/**
 * Convert legacy group to sync group
 */
function convertGroup(group: Group): SyncGroup {
  return {
    uuid: group.uuid,
    name: group.name,
    createdAt: group.createdAt,
    protocolVersion: 1,
  }
}

// ============================================================================
// Migration
// ============================================================================

/**
 * Migrate solo data to sync-compatible mutations
 * Called during first device pairing
 */
export async function migrateSoloData(
  onProgress?: MigrationProgressCallback
): Promise<MigrationResult> {
  try {
    onProgress?.({
      stage: 'preparing',
      current: 0,
      total: 0,
      message: 'Preparing migration...',
    })

    // Check if already migrated
    const syncConfig = await getSyncConfig()
    if (syncConfig?.migrated) {
      return {
        success: true,
        stats: { persons: 0, records: 0, groups: 0, mutations: 0 },
      }
    }

    // Get device keys for signing
    const deviceKeys = await getDeviceKeysAsBytes()
    if (!deviceKeys) {
      return { success: false, error: 'Device keys not found' }
    }

    // Load all solo data
    const users = await db.users.toArray()
    const records = await db.records.toArray()
    const groups = await db.groups.filter((g) => !g.isDefault).toArray()
    const settings = await db.settings.get('main')

    const currentUserEmail = settings?.currentUserEmail

    // Calculate totals
    const totalItems = users.length + records.length + groups.length
    let processedItems = 0
    let mutationId = 1

    // Create email -> personUuid mapping
    const emailToUuid = new Map<string, string>()
    const persons: Person[] = []
    let selfPersonUuid: string | undefined

    // Stage 1: Convert users to persons
    onProgress?.({
      stage: 'users',
      current: 0,
      total: users.length,
      message: 'Converting users to persons...',
    })

    for (const user of users) {
      const uuid = generateUUID()
      const isSelf = user.email === currentUserEmail
      const person = userToPerson(user, uuid, isSelf)

      emailToUuid.set(user.email, uuid)
      persons.push(person)

      if (isSelf) {
        selfPersonUuid = uuid
      }

      // Create mutation for person
      const mutation = await createMigrationMutation({
        id: mutationId++,
        targetUuid: uuid,
        targetType: 'person',
        operation: {
          type: 'create',
          data: person as unknown as Record<string, unknown>,
        } as CreateOp,
        timestamp: person.addedAt,
        authPrivateKey: deviceKeys.authPrivateKey,
        authPublicKey: deviceKeys.authPublicKey,
      })

      await queueMutation(serializeMutationForQueue(mutation))

      processedItems++
      onProgress?.({
        stage: 'users',
        current: processedItems,
        total: totalItems,
        message: `Converted user: ${user.alias}`,
      })
    }

    // If no self person found but currentUserEmail is set, create one
    if (!selfPersonUuid && currentUserEmail) {
      const uuid = generateUUID()
      const person: Person = {
        uuid,
        name: 'Me',
        email: currentUserEmail,
        addedAt: Date.now(),
        isSelf: true,
      }
      emailToUuid.set(currentUserEmail, uuid)
      persons.push(person)
      selfPersonUuid = uuid

      const mutation = await createMigrationMutation({
        id: mutationId++,
        targetUuid: uuid,
        targetType: 'person',
        operation: {
          type: 'create',
          data: person as unknown as Record<string, unknown>,
        } as CreateOp,
        timestamp: person.addedAt,
        authPrivateKey: deviceKeys.authPrivateKey,
        authPublicKey: deviceKeys.authPublicKey,
      })

      await queueMutation(serializeMutationForQueue(mutation))
    }

    // Stage 2: Convert records
    onProgress?.({
      stage: 'records',
      current: processedItems,
      total: totalItems,
      message: 'Converting records...',
    })

    // First, ensure all emails in records have person mappings
    for (const record of records) {
      for (const participant of [...record.paidBy, ...record.paidFor]) {
        if (!emailToUuid.has(participant.email)) {
          // Create a placeholder person for unknown email
          const uuid = generateUUID()
          const person: Person = {
            uuid,
            name: participant.email.split('@')[0], // Use email prefix as name
            email: participant.email,
            addedAt: record.createdAt,
            isPlaceholder: true,
          }
          emailToUuid.set(participant.email, uuid)
          persons.push(person)

          const mutation = await createMigrationMutation({
            id: mutationId++,
            targetUuid: uuid,
            targetType: 'person',
            operation: {
              type: 'create',
              data: person as unknown as Record<string, unknown>,
            } as CreateOp,
            timestamp: person.addedAt,
            authPrivateKey: deviceKeys.authPrivateKey,
            authPublicKey: deviceKeys.authPublicKey,
          })

          await queueMutation(serializeMutationForQueue(mutation))
        }
      }
    }

    // Now convert records
    for (const record of records) {
      const syncRecord = convertExpenseRecord(record, emailToUuid)

      const mutation = await createMigrationMutation({
        id: mutationId++,
        targetUuid: record.uuid,
        targetType: 'record',
        operation: {
          type: 'create',
          data: syncRecord as unknown as Record<string, unknown>,
        } as CreateOp,
        timestamp: record.createdAt,
        authPrivateKey: deviceKeys.authPrivateKey,
        authPublicKey: deviceKeys.authPublicKey,
      })

      await queueMutation(serializeMutationForQueue(mutation))

      processedItems++
      onProgress?.({
        stage: 'records',
        current: processedItems,
        total: totalItems,
        message: `Converted record: ${record.title}`,
      })
    }

    // Stage 3: Convert groups
    onProgress?.({
      stage: 'groups',
      current: processedItems,
      total: totalItems,
      message: 'Converting groups...',
    })

    for (const group of groups) {
      const syncGroup = convertGroup(group)

      const mutation = await createMigrationMutation({
        id: mutationId++,
        targetUuid: group.uuid,
        targetType: 'group',
        operation: {
          type: 'create',
          data: syncGroup as unknown as Record<string, unknown>,
        } as CreateOp,
        timestamp: group.createdAt,
        authPrivateKey: deviceKeys.authPrivateKey,
        authPublicKey: deviceKeys.authPublicKey,
      })

      await queueMutation(serializeMutationForQueue(mutation))

      processedItems++
      onProgress?.({
        stage: 'groups',
        current: processedItems,
        total: totalItems,
        message: `Converted group: ${group.name}`,
      })
    }

    // Stage 4: Finalize
    onProgress?.({
      stage: 'finalizing',
      current: processedItems,
      total: totalItems,
      message: 'Finalizing migration...',
    })

    // Update sync config
    await updateSyncConfig({
      migrated: true,
      migratedAt: Date.now(),
      selfPersonUuid,
    })

    onProgress?.({
      stage: 'complete',
      current: totalItems,
      total: totalItems,
      message: 'Migration complete!',
    })

    return {
      success: true,
      stats: {
        persons: persons.length,
        records: records.length,
        groups: groups.length,
        mutations: mutationId - 1,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Migration failed',
    }
  }
}

/**
 * Get migration stats without performing migration
 */
export async function getMigrationStats(): Promise<{
  users: number
  records: number
  groups: number
  isMigrated: boolean
}> {
  const users = await db.users.count()
  const records = await db.records.count()
  const groups = await db.groups.filter((g) => !g.isDefault).count()
  const syncConfig = await getSyncConfig()

  return {
    users,
    records,
    groups,
    isMigrated: syncConfig?.migrated ?? false,
  }
}

/**
 * Check if migration is needed
 */
export async function needsMigration(): Promise<boolean> {
  const syncConfig = await getSyncConfig()
  if (syncConfig?.migrated) return false

  const users = await db.users.count()
  const records = await db.records.count()

  return users > 0 || records > 0
}

/**
 * Get email to person UUID mapping after migration
 * Useful for updating UI references
 */
export async function getEmailToPersonMapping(): Promise<Map<string, string>> {
  // This would need to be stored during migration or reconstructed from mutations
  // For now, return empty map - the full implementation would query from synced data
  return new Map()
}
