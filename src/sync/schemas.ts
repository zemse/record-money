/**
 * Schema serialization, deserialization, and encryption for sync data structures
 *
 * Handles:
 * - DeviceManifest (IPNS root)
 * - DeviceRing (encrypted with Broadcast Key)
 * - PeerDirectory (ECDH encrypted per-entry)
 * - GroupManifest (encrypted with Group Key)
 * - MutationChunks
 */

import {
  encryptAesGcmPacked,
  decryptAesGcmPacked,
  encryptForRecipient,
  decryptFromSender,
  bytesToBase64,
  base64ToBytes,
  stringToBytes,
  bytesToString,
} from './crypto'
import type {
  DeviceManifest,
  DeviceRing,
  DeviceRingEntry,
  PeerDirectory,
  PeerDirectoryEntry,
  PeerDirectoryPayload,
  SharedGroup,
  GroupManifest,
  MutationChunks,
  Mutation,
  GroupDatabase,
  Group,
} from './types'

// ============================================================================
// JSON Helpers for Uint8Array
// ============================================================================

/**
 * Convert Uint8Array fields to base64 for JSON serialization
 */
function uint8ArrayToJson(obj: unknown): unknown {
  if (obj instanceof Uint8Array) {
    return { __uint8array: bytesToBase64(obj) }
  }
  if (Array.isArray(obj)) {
    return obj.map(uint8ArrayToJson)
  }
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = uint8ArrayToJson(value)
    }
    return result
  }
  return obj
}

/**
 * Convert base64 markers back to Uint8Array after JSON parsing
 */
function jsonToUint8Array(obj: unknown): unknown {
  if (obj && typeof obj === 'object') {
    if (
      '__uint8array' in obj &&
      typeof (obj as Record<string, unknown>).__uint8array === 'string'
    ) {
      return base64ToBytes((obj as Record<string, unknown>).__uint8array as string)
    }
    if (Array.isArray(obj)) {
      return obj.map(jsonToUint8Array)
    }
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = jsonToUint8Array(value)
    }
    return result
  }
  return obj
}

/**
 * Serialize an object to JSON bytes, handling Uint8Array fields
 */
function serializeToBytes(obj: unknown): Uint8Array {
  const json = JSON.stringify(uint8ArrayToJson(obj))
  return stringToBytes(json)
}

/**
 * Deserialize JSON bytes to an object, restoring Uint8Array fields
 */
function deserializeFromBytes<T>(bytes: Uint8Array): T {
  const json = bytesToString(bytes)
  const parsed = JSON.parse(json)
  return jsonToUint8Array(parsed) as T
}

// ============================================================================
// DeviceManifest
// ============================================================================

/**
 * Serialized DeviceManifest for IPFS storage
 * All encrypted fields are base64 encoded
 */
export interface SerializedDeviceManifest {
  databaseCid: string
  latestMutationId: string // base64 encrypted
  chunkIndex: string // base64 encrypted
  deviceRingCid: string
  peerDirectoryCid: string
}

/**
 * Create a DeviceManifest ready for IPFS upload
 */
export async function createDeviceManifest(params: {
  databaseCid: string
  latestMutationId: number
  chunkIndex: MutationChunks
  deviceRingCid: string
  peerDirectoryCid: string
  personalKey: Uint8Array
}): Promise<SerializedDeviceManifest> {
  // Encrypt latestMutationId
  const mutationIdBytes = stringToBytes(String(params.latestMutationId))
  const encryptedMutationId = await encryptAesGcmPacked(params.personalKey, mutationIdBytes)

  // Encrypt chunkIndex
  const chunkIndexBytes = serializeToBytes(params.chunkIndex)
  const encryptedChunkIndex = await encryptAesGcmPacked(params.personalKey, chunkIndexBytes)

  return {
    databaseCid: params.databaseCid,
    latestMutationId: bytesToBase64(encryptedMutationId),
    chunkIndex: bytesToBase64(encryptedChunkIndex),
    deviceRingCid: params.deviceRingCid,
    peerDirectoryCid: params.peerDirectoryCid,
  }
}

/**
 * Serialize DeviceManifest for IPFS upload
 */
export function serializeDeviceManifest(manifest: SerializedDeviceManifest): Uint8Array {
  return stringToBytes(JSON.stringify(manifest))
}

/**
 * Deserialize DeviceManifest from IPFS
 */
export function deserializeDeviceManifest(bytes: Uint8Array): SerializedDeviceManifest {
  return JSON.parse(bytesToString(bytes)) as SerializedDeviceManifest
}

/**
 * Decrypt DeviceManifest fields (requires Personal Key)
 */
export async function decryptDeviceManifest(
  manifest: SerializedDeviceManifest,
  personalKey: Uint8Array
): Promise<{
  databaseCid: string
  latestMutationId: number
  chunkIndex: MutationChunks
  deviceRingCid: string
  peerDirectoryCid: string
}> {
  // Decrypt latestMutationId
  const encryptedMutationId = base64ToBytes(manifest.latestMutationId)
  const mutationIdBytes = await decryptAesGcmPacked(personalKey, encryptedMutationId)
  const latestMutationId = parseInt(bytesToString(mutationIdBytes), 10)

  // Decrypt chunkIndex
  const encryptedChunkIndex = base64ToBytes(manifest.chunkIndex)
  const chunkIndexBytes = await decryptAesGcmPacked(personalKey, encryptedChunkIndex)
  const chunkIndex = deserializeFromBytes<MutationChunks>(chunkIndexBytes)

  return {
    databaseCid: manifest.databaseCid,
    latestMutationId,
    chunkIndex,
    deviceRingCid: manifest.deviceRingCid,
    peerDirectoryCid: manifest.peerDirectoryCid,
  }
}

// ============================================================================
// DeviceRing
// ============================================================================

/**
 * Create and encrypt a DeviceRing for IPFS upload
 */
export async function createEncryptedDeviceRing(
  deviceRing: DeviceRing,
  broadcastKey: Uint8Array
): Promise<Uint8Array> {
  const bytes = serializeToBytes(deviceRing)
  return encryptAesGcmPacked(broadcastKey, bytes)
}

/**
 * Decrypt a DeviceRing from IPFS
 */
export async function decryptDeviceRing(
  encryptedBytes: Uint8Array,
  broadcastKey: Uint8Array
): Promise<DeviceRing> {
  const bytes = await decryptAesGcmPacked(broadcastKey, encryptedBytes)
  return deserializeFromBytes<DeviceRing>(bytes)
}

/**
 * Create a DeviceRingEntry from device info
 */
export function createDeviceRingEntry(
  authPublicKey: Uint8Array,
  ipnsPublicKey: Uint8Array,
  lastSyncedId: number = 0
): DeviceRingEntry {
  return {
    authPublicKey,
    ipnsPublicKey,
    lastSyncedId,
  }
}

// ============================================================================
// PeerDirectory
// ============================================================================

/**
 * Serialized PeerDirectory for IPFS storage
 */
export interface SerializedPeerDirectory {
  entries: Array<{
    recipientPublicKey: string // base64
    ciphertext: string // base64
  }>
}

/**
 * Create a PeerDirectory entry for a recipient
 */
export async function createPeerDirectoryEntry(
  senderPrivateKey: Uint8Array,
  recipientPublicKey: Uint8Array,
  payload: PeerDirectoryPayload
): Promise<PeerDirectoryEntry> {
  const payloadBytes = serializeToBytes(payload)
  const ciphertext = await encryptForRecipient(senderPrivateKey, recipientPublicKey, payloadBytes)

  return {
    recipientPublicKey,
    ciphertext,
  }
}

/**
 * Decrypt a PeerDirectory entry
 */
export async function decryptPeerDirectoryEntry(
  entry: PeerDirectoryEntry,
  recipientPrivateKey: Uint8Array,
  senderPublicKey: Uint8Array
): Promise<PeerDirectoryPayload> {
  const payloadBytes = await decryptFromSender(
    recipientPrivateKey,
    senderPublicKey,
    entry.ciphertext
  )
  return deserializeFromBytes<PeerDirectoryPayload>(payloadBytes)
}

/**
 * Create and serialize a PeerDirectory for IPFS upload
 */
export async function createSerializedPeerDirectory(
  senderPrivateKey: Uint8Array,
  entries: Array<{ recipientPublicKey: Uint8Array; payload: PeerDirectoryPayload }>
): Promise<SerializedPeerDirectory> {
  // Shuffle entries to prevent analysis
  const shuffled = [...entries].sort(() => Math.random() - 0.5)

  const serializedEntries = await Promise.all(
    shuffled.map(async ({ recipientPublicKey, payload }) => {
      const entry = await createPeerDirectoryEntry(senderPrivateKey, recipientPublicKey, payload)
      return {
        recipientPublicKey: bytesToBase64(entry.recipientPublicKey),
        ciphertext: bytesToBase64(entry.ciphertext),
      }
    })
  )

  return { entries: serializedEntries }
}

/**
 * Serialize PeerDirectory for IPFS upload
 */
export function serializePeerDirectory(directory: SerializedPeerDirectory): Uint8Array {
  return stringToBytes(JSON.stringify(directory))
}

/**
 * Deserialize PeerDirectory from IPFS
 */
export function deserializePeerDirectory(bytes: Uint8Array): SerializedPeerDirectory {
  return JSON.parse(bytesToString(bytes)) as SerializedPeerDirectory
}

/**
 * Find and decrypt your entry in a PeerDirectory
 */
export async function findAndDecryptPeerDirectoryEntry(
  directory: SerializedPeerDirectory,
  recipientPrivateKey: Uint8Array,
  recipientPublicKey: Uint8Array,
  senderPublicKey: Uint8Array
): Promise<PeerDirectoryPayload | null> {
  const myPublicKeyBase64 = bytesToBase64(recipientPublicKey)

  for (const entry of directory.entries) {
    if (entry.recipientPublicKey === myPublicKeyBase64) {
      const peerEntry: PeerDirectoryEntry = {
        recipientPublicKey: base64ToBytes(entry.recipientPublicKey),
        ciphertext: base64ToBytes(entry.ciphertext),
      }
      return decryptPeerDirectoryEntry(peerEntry, recipientPrivateKey, senderPublicKey)
    }
  }

  return null
}

// ============================================================================
// GroupManifest
// ============================================================================

/**
 * Create and encrypt a GroupManifest for IPFS upload
 */
export async function createEncryptedGroupManifest(
  manifest: GroupManifest,
  groupKey: Uint8Array
): Promise<Uint8Array> {
  const bytes = serializeToBytes(manifest)
  return encryptAesGcmPacked(groupKey, bytes)
}

/**
 * Decrypt a GroupManifest from IPFS
 */
export async function decryptGroupManifest(
  encryptedBytes: Uint8Array,
  groupKey: Uint8Array
): Promise<GroupManifest> {
  const bytes = await decryptAesGcmPacked(groupKey, encryptedBytes)
  return deserializeFromBytes<GroupManifest>(bytes)
}

/**
 * Create a new GroupManifest
 */
export function createGroupManifest(
  group: Group,
  database: GroupDatabase,
  chunkIndex: MutationChunks = [],
  latestMutationId: number = 0
): GroupManifest {
  return {
    group,
    database,
    chunkIndex,
    latestMutationId,
  }
}

// ============================================================================
// MutationChunks
// ============================================================================

/**
 * Create and encrypt a mutation chunk for IPFS upload
 */
export async function createEncryptedMutationChunk(
  mutations: Mutation[],
  encryptionKey: Uint8Array // Personal Key or Group Key
): Promise<Uint8Array> {
  const bytes = serializeToBytes(mutations)
  return encryptAesGcmPacked(encryptionKey, bytes)
}

/**
 * Decrypt a mutation chunk from IPFS
 */
export async function decryptMutationChunk(
  encryptedBytes: Uint8Array,
  encryptionKey: Uint8Array
): Promise<Mutation[]> {
  const bytes = await decryptAesGcmPacked(encryptionKey, encryptedBytes)
  return deserializeFromBytes<Mutation[]>(bytes)
}

/**
 * Find chunks needed to sync from a given mutation ID
 */
export function findChunksToSync(chunkIndex: MutationChunks, lastSyncedId: number): MutationChunks {
  return chunkIndex.filter((chunk) => chunk.endId > lastSyncedId)
}

/**
 * Create a new chunk entry
 */
export function createMutationChunk(startId: number, endId: number, cid: string) {
  return { startId, endId, cid }
}

// ============================================================================
// Database Encryption (for databaseCid)
// ============================================================================

export interface PersonalDatabase {
  people: import('./types').Person[]
  records: import('./types').ExpenseRecord[]
  groups: Group[]
}

/**
 * Create and encrypt a personal database for IPFS upload
 */
export async function createEncryptedDatabase(
  database: PersonalDatabase,
  personalKey: Uint8Array
): Promise<Uint8Array> {
  const bytes = serializeToBytes(database)
  return encryptAesGcmPacked(personalKey, bytes)
}

/**
 * Decrypt a personal database from IPFS
 */
export async function decryptDatabase(
  encryptedBytes: Uint8Array,
  personalKey: Uint8Array
): Promise<PersonalDatabase> {
  const bytes = await decryptAesGcmPacked(personalKey, encryptedBytes)
  return deserializeFromBytes<PersonalDatabase>(bytes)
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate a DeviceManifest structure
 */
export function isValidDeviceManifest(obj: unknown): obj is SerializedDeviceManifest {
  if (!obj || typeof obj !== 'object') return false
  const manifest = obj as Record<string, unknown>
  return (
    typeof manifest.databaseCid === 'string' &&
    typeof manifest.latestMutationId === 'string' &&
    typeof manifest.chunkIndex === 'string' &&
    typeof manifest.deviceRingCid === 'string' &&
    typeof manifest.peerDirectoryCid === 'string'
  )
}

/**
 * Validate a DeviceRing structure
 */
export function isValidDeviceRing(obj: unknown): obj is DeviceRing {
  if (!obj || typeof obj !== 'object') return false
  const ring = obj as Record<string, unknown>
  if (!Array.isArray(ring.devices)) return false
  return ring.devices.every(
    (device) =>
      device &&
      typeof device === 'object' &&
      device.authPublicKey instanceof Uint8Array &&
      device.ipnsPublicKey instanceof Uint8Array &&
      typeof device.lastSyncedId === 'number'
  )
}

/**
 * Validate a PeerDirectoryPayload structure
 */
export function isValidPeerDirectoryPayload(obj: unknown): obj is PeerDirectoryPayload {
  if (!obj || typeof obj !== 'object') return false
  const payload = obj as Record<string, unknown>
  if (!(payload.broadcastKey instanceof Uint8Array)) return false
  if (!Array.isArray(payload.sharedGroups)) return false
  return payload.sharedGroups.every(
    (group) =>
      group &&
      typeof group === 'object' &&
      typeof (group as SharedGroup).groupUuid === 'string' &&
      (group as SharedGroup).symmetricKey instanceof Uint8Array &&
      typeof (group as SharedGroup).manifestCid === 'string'
  )
}

/**
 * Validate a GroupManifest structure
 */
export function isValidGroupManifest(obj: unknown): obj is GroupManifest {
  if (!obj || typeof obj !== 'object') return false
  const manifest = obj as Record<string, unknown>
  return (
    manifest.group !== undefined &&
    manifest.database !== undefined &&
    Array.isArray(manifest.chunkIndex) &&
    typeof manifest.latestMutationId === 'number'
  )
}
