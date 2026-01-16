/**
 * Security Service
 *
 * Handles security-related operations for P2P sync:
 * - Device removal with key rotation
 * - Key rotation on security events
 * - Malformed content handling
 * - Fork group flow
 */

import {
  db,
  generateUUID,
  now,
  getDeviceKeys,
  saveDeviceKeys,
  getSyncConfig,
  updateSyncConfig,
  getAllPeerSyncStates,
  updatePeerSyncState,
  getGroupKey,
  saveGroupKey,
  getAllGroupKeys,
  getAllPeople,
  getSelfPerson,
  queueMutation,
} from '../db'
import { getDeviceKeysAsBytes, getConfiguredProvider } from './device-setup'
import { createSignedMutation, serializeMutation, verifyMutation } from './mutations'
import {
  generateSymmetricKey,
  bytesToBase64,
  base64ToBytes,
  sha256,
  ecdhDeriveKey,
  encryptAesGcm,
} from './crypto'
import {
  createEncryptedDeviceRing,
  createEncryptedMutationChunk,
  createDeviceManifest,
  serializeDeviceManifest,
} from './schemas'
import type { DeleteOp, DeviceRing, Mutation, PeerDirectory, PeerDirectoryPayload } from './types'

// ============================================================================
// Types
// ============================================================================

export interface RemoveDeviceResult {
  success: boolean
  error?: string
}

export interface KeyRotationResult {
  success: boolean
  newPersonalKey?: Uint8Array
  newBroadcastKey?: Uint8Array
  error?: string
}

export interface ForkGroupResult {
  success: boolean
  newGroupUuid?: string
  error?: string
}

export interface ContentValidationResult {
  valid: boolean
  errors: string[]
}

export type MalformedContentType =
  | 'invalid_signature'
  | 'unknown_author'
  | 'malformed_mutation'
  | 'bad_timestamp'
  | 'decryption_failed'

export interface MalformedContentReport {
  type: MalformedContentType
  deviceId?: string
  mutationUuid?: string
  timestamp: number
  details: string
}

// ============================================================================
// Device Removal
// ============================================================================

/**
 * Remove a device and rotate all keys
 * This is a security-critical operation
 */
export async function removeDevice(deviceIdToRemove: string): Promise<RemoveDeviceResult> {
  try {
    const deviceKeys = await getDeviceKeysAsBytes()
    if (!deviceKeys) {
      return { success: false, error: 'Device keys not configured' }
    }

    const config = await getSyncConfig()
    if (!config || config.mode !== 'synced') {
      return { success: false, error: 'Sync not configured' }
    }

    // Don't allow removing self
    if (deviceIdToRemove === deviceKeys.deviceId) {
      return { success: false, error: 'Cannot remove current device. Use self-removal instead.' }
    }

    // Verify the device exists in our peer list
    const peerStates = await getAllPeerSyncStates()
    const deviceExists = peerStates.some((p) => p.deviceId === deviceIdToRemove)
    if (!deviceExists) {
      return { success: false, error: 'Device not found' }
    }

    // Step 1: Create removal mutation
    const operation: DeleteOp = { type: 'delete' }

    const mutation = createSignedMutation(
      {
        id: Date.now(),
        targetUuid: deviceIdToRemove,
        targetType: 'device',
        operation,
        timestamp: now(),
        authorDevicePublicKey: deviceKeys.authPublicKey,
      },
      deviceKeys.authPrivateKey
    )

    await queueMutation(serializeMutation(mutation))

    // Step 2: Rotate keys
    const rotationResult = await rotateAllKeys()
    if (!rotationResult.success) {
      return { success: false, error: rotationResult.error }
    }

    // Step 3: Remove device from peer sync state
    await db.peerSyncState.delete(deviceIdToRemove)

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove device',
    }
  }
}

/**
 * Self-remove current device (for wiping before selling, etc.)
 */
export async function selfRemoveDevice(): Promise<RemoveDeviceResult> {
  try {
    const deviceKeys = await getDeviceKeysAsBytes()
    if (!deviceKeys) {
      return { success: false, error: 'Device keys not configured' }
    }

    // Create self-removal mutation
    const operation: DeleteOp = { type: 'delete' }

    const mutation = createSignedMutation(
      {
        id: Date.now(),
        targetUuid: deviceKeys.deviceId,
        targetType: 'device',
        operation,
        timestamp: now(),
        authorDevicePublicKey: deviceKeys.authPublicKey,
      },
      deviceKeys.authPrivateKey
    )

    await queueMutation(serializeMutation(mutation))

    // Clear local sync config
    await updateSyncConfig({
      mode: 'solo',
      personalKey: undefined,
      broadcastKey: undefined,
    })

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to self-remove device',
    }
  }
}

// ============================================================================
// Key Rotation
// ============================================================================

/**
 * Rotate all symmetric keys (Personal Key + Broadcast Key)
 * Called after device removal or security event
 */
export async function rotateAllKeys(): Promise<KeyRotationResult> {
  try {
    const config = await getSyncConfig()
    if (!config) {
      return { success: false, error: 'Sync not configured' }
    }

    const deviceKeys = await getDeviceKeysAsBytes()
    if (!deviceKeys) {
      return { success: false, error: 'Device keys not configured' }
    }

    const provider = await getConfiguredProvider()
    if (!provider) {
      return { success: false, error: 'No provider configured' }
    }

    // Generate new keys
    const newPersonalKey = await generateSymmetricKey()
    const newBroadcastKey = await generateSymmetricKey()

    // Update sync config with new keys
    await updateSyncConfig({
      personalKey: bytesToBase64(newPersonalKey),
      broadcastKey: bytesToBase64(newBroadcastKey),
    })

    // Re-encrypt DeviceRing with new Broadcast Key
    const selfPerson = await getSelfPerson()
    const allPeople = await getAllPeople()
    const selfDevices =
      selfPerson?.devices?.map((d) => ({
        authPublicKey: base64ToBytes(d.authPublicKey),
        ipnsPublicKey: base64ToBytes(d.ipnsPublicKey),
        lastSyncedId: 0,
      })) || []

    const deviceRing: DeviceRing = { devices: selfDevices }
    const encryptedRing = await createEncryptedDeviceRing(deviceRing, newBroadcastKey)
    const { cid: deviceRingCid } = await provider.upload(encryptedRing, 'device-ring')

    // Re-encrypt PeerDirectory with new keys
    const peerDirectory = await rebuildPeerDirectory(
      deviceKeys.authPrivateKey,
      newPersonalKey,
      newBroadcastKey
    )
    const peerDirBytes = new TextEncoder().encode(JSON.stringify(peerDirectory))
    const { cid: peerDirectoryCid } = await provider.upload(peerDirBytes, 'peer-directory')

    // Re-encrypt database with new Personal Key
    // For now, create a placeholder - full implementation would re-encrypt all data
    const databasePlaceholder = new TextEncoder().encode(JSON.stringify({ version: 1 }))
    const { cid: databaseCid } = await provider.upload(databasePlaceholder, 'database')

    // Create and publish new manifest
    const groupKeys = await getAllGroupKeys()
    const sharedGroups = groupKeys.map((gk) => ({
      groupUuid: gk.groupUuid,
      symmetricKey: base64ToBytes(gk.symmetricKey),
      manifestCid: '', // Will be updated when group manifest is published
    }))

    const manifest = await createDeviceManifest({
      databaseCid,
      latestMutationId: 0, // Will be updated by publishing service
      chunkIndex: [],
      deviceRingCid,
      peerDirectoryCid,
      personalKey: newPersonalKey,
    })

    const manifestBytes = serializeDeviceManifest(manifest)
    const { cid: manifestCid } = await provider.upload(manifestBytes, 'manifest')

    await provider.publishIpns(deviceKeys.ipnsPrivateKey, manifestCid)

    return {
      success: true,
      newPersonalKey,
      newBroadcastKey,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to rotate keys',
    }
  }
}

/**
 * Rotate a specific group key
 * Called after member removal from group
 */
export async function rotateGroupKey(
  groupUuid: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const newKey = await generateSymmetricKey()
    const existing = await getGroupKey(groupUuid)

    await saveGroupKey({
      groupUuid,
      symmetricKey: bytesToBase64(newKey),
      createdAt: existing?.createdAt || now(),
      rotatedAt: now(),
    })

    // TODO: Update PeerDirectory with new group key for all remaining members

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to rotate group key',
    }
  }
}

// ============================================================================
// Malformed Content Handling
// ============================================================================

const malformedContentReports: MalformedContentReport[] = []

/**
 * Report malformed content detected during sync
 */
export function reportMalformedContent(report: MalformedContentReport): void {
  malformedContentReports.push(report)

  // Keep only last 100 reports
  while (malformedContentReports.length > 100) {
    malformedContentReports.shift()
  }

  console.warn(`Malformed content detected: ${report.type}`, report)
}

/**
 * Get recent malformed content reports
 */
export function getMalformedContentReports(): MalformedContentReport[] {
  return [...malformedContentReports]
}

/**
 * Clear malformed content reports
 */
export function clearMalformedContentReports(): void {
  malformedContentReports.length = 0
}

/**
 * Validate a mutation for security issues
 */
export async function validateMutation(
  mutation: Mutation,
  knownDeviceKeys: Uint8Array[]
): Promise<ContentValidationResult> {
  const errors: string[] = []

  // Check signature
  const authorKey = mutation.authorDevicePublicKey
  const isValidSignature = await verifyMutation(mutation, authorKey)
  if (!isValidSignature) {
    errors.push('Invalid signature')
    reportMalformedContent({
      type: 'invalid_signature',
      mutationUuid: mutation.uuid,
      timestamp: now(),
      details: `Mutation ${mutation.uuid} has invalid signature`,
    })
  }

  // Check if author is known
  const authorKeyBase64 = bytesToBase64(authorKey)
  const isKnownAuthor = knownDeviceKeys.some((key) => bytesToBase64(key) === authorKeyBase64)
  if (!isKnownAuthor) {
    errors.push('Unknown author')
    reportMalformedContent({
      type: 'unknown_author',
      mutationUuid: mutation.uuid,
      timestamp: now(),
      details: `Mutation ${mutation.uuid} from unknown device`,
    })
  }

  // Check timestamp sanity
  const hourMs = 60 * 60 * 1000
  const dayMs = 24 * hourMs
  const timestamp = mutation.timestamp
  const timeDiff = Math.abs(now() - timestamp)

  // Allow up to 7 days clock drift
  if (timeDiff > 7 * dayMs) {
    errors.push('Timestamp too far in past or future')
    reportMalformedContent({
      type: 'bad_timestamp',
      mutationUuid: mutation.uuid,
      timestamp: now(),
      details: `Mutation ${mutation.uuid} has suspicious timestamp: ${new Date(timestamp).toISOString()}`,
    })
  }

  // Check mutation structure
  if (!mutation.uuid || !mutation.targetUuid || !mutation.operation) {
    errors.push('Malformed mutation structure')
    reportMalformedContent({
      type: 'malformed_mutation',
      mutationUuid: mutation.uuid,
      timestamp: now(),
      details: 'Missing required fields',
    })
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

// ============================================================================
// Fork Group
// ============================================================================

/**
 * Fork a group to exclude bad actors
 * Creates a new group with all data except mutations from excluded members
 */
export async function forkGroup(
  groupUuid: string,
  excludePersonUuids: string[]
): Promise<ForkGroupResult> {
  try {
    const deviceKeys = await getDeviceKeysAsBytes()
    if (!deviceKeys) {
      return { success: false, error: 'Device keys not configured' }
    }

    const selfPerson = await getSelfPerson()
    if (!selfPerson) {
      return { success: false, error: 'Self person not configured' }
    }

    // Cannot exclude self
    if (excludePersonUuids.includes(selfPerson.uuid)) {
      return { success: false, error: 'Cannot exclude yourself from fork' }
    }

    const group = await db.groups.get(groupUuid)
    if (!group) {
      return { success: false, error: 'Group not found' }
    }

    // Create new group with remaining members
    const newGroupUuid = generateUUID()
    const newGroupKey = await generateSymmetricKey()
    const timestamp = now()

    // Filter out excluded members
    const remainingMembers = group.members.filter((m) => !excludePersonUuids.includes(m))

    // Create new group
    await db.groups.add({
      uuid: newGroupUuid,
      name: `${group.name} (forked)`,
      members: remainingMembers,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    // Store new group key
    await saveGroupKey({
      groupUuid: newGroupUuid,
      symmetricKey: bytesToBase64(newGroupKey),
      createdAt: timestamp,
    })

    // Copy records from old group to new group (excluding those created by excluded members)
    // For now, copy all records - a full implementation would filter by author
    const records = await db.records.where('groupId').equals(groupUuid).toArray()
    for (const record of records) {
      await db.records.add({
        ...record,
        uuid: generateUUID(),
        groupId: newGroupUuid,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    }

    // TODO: Create group creation mutation for new group
    // TODO: Update PeerDirectory to share new group key with remaining members

    return { success: true, newGroupUuid }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fork group',
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Rebuild PeerDirectory with new keys
 */
async function rebuildPeerDirectory(
  ownPrivateKey: Uint8Array,
  personalKey: Uint8Array,
  broadcastKey: Uint8Array
): Promise<PeerDirectory> {
  const selfPerson = await getSelfPerson()
  const allPeople = await getAllPeople()
  const groupKeys = await getAllGroupKeys()

  const sharedGroups = groupKeys.map((gk) => ({
    groupUuid: gk.groupUuid,
    symmetricKey: base64ToBytes(gk.symmetricKey),
    manifestCid: '',
  }))

  const entries: PeerDirectory['entries'] = []

  // Add entries for self devices
  if (selfPerson?.devices) {
    for (const device of selfPerson.devices) {
      const recipientPublicKey = base64ToBytes(device.authPublicKey)
      const payload: PeerDirectoryPayload = {
        personalKey,
        broadcastKey,
        sharedGroups,
      }

      const sharedSecret = await ecdhDeriveKey(ownPrivateKey, recipientPublicKey)
      const ciphertext = await encryptAesGcm(
        sharedSecret,
        new TextEncoder().encode(JSON.stringify(payload))
      )

      entries.push({
        recipientPublicKey,
        ciphertext,
      })
    }
  }

  // Add entries for peers (broadcast key only, no personal key)
  for (const person of allPeople) {
    if (person.isSelf || !person.devices) continue

    for (const device of person.devices) {
      const recipientPublicKey = base64ToBytes(device.authPublicKey)
      const payload: PeerDirectoryPayload = {
        broadcastKey,
        sharedGroups,
      }

      const sharedSecret = await ecdhDeriveKey(ownPrivateKey, recipientPublicKey)
      const ciphertext = await encryptAesGcm(
        sharedSecret,
        new TextEncoder().encode(JSON.stringify(payload))
      )

      entries.push({
        recipientPublicKey,
        ciphertext,
      })
    }
  }

  return { entries }
}

/**
 * Handle incoming device removal mutation
 */
export async function handleDeviceRemovalMutation(
  mutation: Mutation
): Promise<{ shouldRotate: boolean }> {
  if (mutation.targetType !== 'device' || mutation.operation.type !== 'delete') {
    return { shouldRotate: false }
  }

  const removedDeviceId = mutation.targetUuid
  const deviceKeys = await getDeviceKeysAsBytes()

  // If we're the removed device, clear our config
  if (deviceKeys && removedDeviceId === deviceKeys.deviceId) {
    await updateSyncConfig({
      mode: 'solo',
      personalKey: undefined,
      broadcastKey: undefined,
    })
    return { shouldRotate: false }
  }

  // Remove from peer sync state
  await db.peerSyncState.delete(removedDeviceId)

  // Signal that key rotation is needed
  return { shouldRotate: true }
}

/**
 * Check if current device might have been removed
 * (Can't decrypt new data, sync failures)
 */
export async function checkIfPossiblyRemoved(): Promise<{
  possiblyRemoved: boolean
  consecutiveFailures: number
}> {
  const peerStates = await getAllPeerSyncStates()
  const maxFailures = Math.max(0, ...peerStates.map((p) => p.consecutiveFailures))

  // If we've had 5+ consecutive failures from all peers, we might be removed
  const possiblyRemoved = maxFailures >= 5 && peerStates.every((p) => p.consecutiveFailures >= 3)

  return {
    possiblyRemoved,
    consecutiveFailures: maxFailures,
  }
}
