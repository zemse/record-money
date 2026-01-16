/**
 * Device Pairing Service
 *
 * Handles the device pairing flow:
 * - QR payload generation/parsing
 * - Temp IPNS handshake
 * - Emoji verification
 * - Key exchange via PeerDirectory
 * - DeviceRing updates
 */

import {
  generateEd25519KeyPair,
  generateP256KeyPair,
  deriveVerificationEmojis,
  bytesToBase64,
  base64ToBytes,
  bytesToHex,
} from './crypto'
import {
  createEncryptedDeviceRing,
  createSerializedPeerDirectory,
  serializePeerDirectory,
  deserializePeerDirectory,
  findAndDecryptPeerDirectoryEntry,
  createDeviceRingEntry,
  serializeDeviceManifest,
  createDeviceManifest,
  deserializeDeviceManifest,
  createEncryptedDatabase,
} from './schemas'
import { migrateSoloData, needsMigration } from './migration'
import { getDeviceKeysAsBytes, ensureDeviceKeys, getConfiguredProvider } from './device-setup'
import { getSyncConfig, updateSyncConfig, getDeviceKeys } from '../db'
import type { ProviderConfig } from './ipfs'
import type { DeviceRing, PeerDirectoryPayload, Person } from './types'

// ============================================================================
// Types
// ============================================================================

/**
 * QR payload for device pairing
 * Device A generates this for Device B to scan
 */
export interface PairingQRPayload {
  version: 1
  // Device A's permanent keys
  ipnsPublicKey: string // base64
  authPublicKey: string // base64
  // Temp key for B to respond
  tempIpnsPrivateKey: string // base64 - B uses this to publish response
  // Provider config (if B is fresh and needs it)
  providerConfig?: ProviderConfig
}

/**
 * Response published by Device B to temp IPNS
 */
export interface PairingResponse {
  version: 1
  ipnsPublicKey: string // base64 - B's permanent IPNS key
  authPublicKey: string // base64 - B's permanent auth key
  deviceId: string // B's device ID
}

/**
 * Pairing session state
 */
export interface PairingSession {
  id: string
  role: 'initiator' | 'joiner'
  state: PairingState
  // Keys
  tempIpnsPrivateKey?: Uint8Array
  tempIpnsPublicKey?: Uint8Array
  // Peer info (filled during handshake)
  peerIpnsPublicKey?: Uint8Array
  peerAuthPublicKey?: Uint8Array
  peerDeviceId?: string
  // Verification
  expectedEmojis?: string[]
  // Timestamps
  createdAt: number
  expiresAt: number
}

export type PairingState =
  | 'created' // QR generated, waiting for scan
  | 'scanned' // B scanned, generating response
  | 'responded' // B published response
  | 'verified' // A verified emojis match
  | 'exchanging' // Exchanging keys
  | 'completed' // Pairing complete
  | 'failed' // Pairing failed
  | 'expired' // Session expired

export interface PairingProgress {
  state: PairingState
  message: string
}

export type PairingProgressCallback = (progress: PairingProgress) => void

// ============================================================================
// Constants
// ============================================================================

/** Session expiry time in milliseconds (10 minutes) */
const SESSION_EXPIRY_MS = 10 * 60 * 1000

/** Polling interval for temp IPNS (2 seconds) */
const POLL_INTERVAL_MS = 2000

/** Max poll attempts before giving up */
const MAX_POLL_ATTEMPTS = 60 // 2 minutes

// ============================================================================
// QR Payload Generation
// ============================================================================

/**
 * Generate QR payload for initiating pairing
 * Called by Device A (existing device)
 */
export async function generatePairingQR(
  includeProviderConfig: boolean = true
): Promise<{ payload: PairingQRPayload; session: PairingSession }> {
  const deviceKeys = await getDeviceKeysAsBytes()
  if (!deviceKeys) {
    throw new Error('Device not set up. Please complete device setup first.')
  }

  // Generate temp IPNS key for response
  const tempIpnsKeyPair = generateEd25519KeyPair()

  // Get provider config if requested
  let providerConfig: ProviderConfig | undefined
  if (includeProviderConfig) {
    const syncConfig = await getSyncConfig()
    if (syncConfig?.providerConfig) {
      providerConfig = JSON.parse(syncConfig.providerConfig) as ProviderConfig
    }
  }

  const payload: PairingQRPayload = {
    version: 1,
    ipnsPublicKey: bytesToBase64(deviceKeys.ipnsPublicKey),
    authPublicKey: bytesToBase64(deviceKeys.authPublicKey),
    tempIpnsPrivateKey: bytesToBase64(tempIpnsKeyPair.privateKey),
    providerConfig,
  }

  const session: PairingSession = {
    id: crypto.randomUUID(),
    role: 'initiator',
    state: 'created',
    tempIpnsPrivateKey: tempIpnsKeyPair.privateKey,
    tempIpnsPublicKey: tempIpnsKeyPair.publicKey,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_EXPIRY_MS,
  }

  return { payload, session }
}

/**
 * Serialize QR payload for display
 */
export function serializeQRPayload(payload: PairingQRPayload): string {
  return JSON.stringify(payload)
}

/**
 * Parse QR payload from scanned data
 */
export function parseQRPayload(data: string): PairingQRPayload | null {
  try {
    const parsed = JSON.parse(data) as PairingQRPayload
    if (parsed.version !== 1) return null
    if (!parsed.ipnsPublicKey || !parsed.authPublicKey || !parsed.tempIpnsPrivateKey) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

// ============================================================================
// Joiner Flow (Device B)
// ============================================================================

/**
 * Process scanned QR and initiate joining
 * Called by Device B after scanning QR
 */
export async function initiateJoining(
  payload: PairingQRPayload,
  onProgress?: PairingProgressCallback
): Promise<{ session: PairingSession; emojis: string[] }> {
  onProgress?.({ state: 'scanned', message: 'Processing QR code...' })

  // Ensure device has keys (generate if needed)
  const deviceKeys = await ensureDeviceKeys()
  const keys = {
    ipnsPrivateKey: base64ToBytes(deviceKeys.ipnsPrivateKey),
    ipnsPublicKey: base64ToBytes(deviceKeys.ipnsPublicKey),
    authPrivateKey: base64ToBytes(deviceKeys.authPrivateKey),
    authPublicKey: base64ToBytes(deviceKeys.authPublicKey),
    deviceId: deviceKeys.deviceId,
  }

  // If we don't have a provider, use the one from QR
  const syncConfig = await getSyncConfig()
  if (!syncConfig?.providerConfig && payload.providerConfig) {
    await updateSyncConfig({
      providerType: payload.providerConfig.type,
      providerConfig: JSON.stringify(payload.providerConfig),
    })
  }

  // Create pairing response
  const response: PairingResponse = {
    version: 1,
    ipnsPublicKey: bytesToBase64(keys.ipnsPublicKey),
    authPublicKey: bytesToBase64(keys.authPublicKey),
    deviceId: keys.deviceId,
  }

  onProgress?.({ state: 'responded', message: 'Publishing response...' })

  // Publish response to temp IPNS
  const provider = await getConfiguredProvider()
  if (!provider) {
    throw new Error('No provider configured')
  }

  const responseBytes = new TextEncoder().encode(JSON.stringify(response))
  const uploadResult = await provider.upload(responseBytes, { name: 'pairing-response' })

  // Publish to temp IPNS using the temp private key from QR
  const tempIpnsPrivateKey = base64ToBytes(payload.tempIpnsPrivateKey)
  await provider.publishIpns(tempIpnsPrivateKey, uploadResult.cid, 1)

  // Derive verification emojis
  const emojis = deriveVerificationEmojis(keys.ipnsPublicKey, keys.authPublicKey)

  const session: PairingSession = {
    id: crypto.randomUUID(),
    role: 'joiner',
    state: 'responded',
    peerIpnsPublicKey: base64ToBytes(payload.ipnsPublicKey),
    peerAuthPublicKey: base64ToBytes(payload.authPublicKey),
    expectedEmojis: emojis,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_EXPIRY_MS,
  }

  return { session, emojis }
}

// ============================================================================
// Initiator Flow (Device A)
// ============================================================================

/**
 * Poll for joiner's response on temp IPNS
 * Called by Device A after showing QR
 */
export async function pollForResponse(
  session: PairingSession,
  onProgress?: PairingProgressCallback
): Promise<{ response: PairingResponse; emojis: string[] } | null> {
  if (session.role !== 'initiator' || !session.tempIpnsPrivateKey) {
    throw new Error('Invalid session for polling')
  }

  const provider = await getConfiguredProvider()
  if (!provider) {
    throw new Error('No provider configured')
  }

  onProgress?.({ state: 'created', message: 'Waiting for device to scan...' })

  // Derive temp IPNS name from public key
  const { sha256 } = await import('@noble/hashes/sha2.js')
  const tempIpnsName = bytesToHex(sha256(session.tempIpnsPublicKey!))

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    // Check if session expired
    if (Date.now() > session.expiresAt) {
      session.state = 'expired'
      return null
    }

    try {
      // Try to resolve temp IPNS
      const record = await provider.resolveIpns(tempIpnsName)
      if (record) {
        // Fetch the response
        const fetchResult = await provider.fetch(record.value)
        const responseText = new TextDecoder().decode(fetchResult.data)
        const response = JSON.parse(responseText) as PairingResponse

        if (response.version === 1 && response.ipnsPublicKey && response.authPublicKey) {
          // Derive emojis for verification
          const peerIpnsPublicKey = base64ToBytes(response.ipnsPublicKey)
          const peerAuthPublicKey = base64ToBytes(response.authPublicKey)
          const emojis = deriveVerificationEmojis(peerIpnsPublicKey, peerAuthPublicKey)

          session.peerIpnsPublicKey = peerIpnsPublicKey
          session.peerAuthPublicKey = peerAuthPublicKey
          session.peerDeviceId = response.deviceId
          session.expectedEmojis = emojis
          session.state = 'responded'

          onProgress?.({ state: 'responded', message: 'Device found! Verify emojis...' })

          return { response, emojis }
        }
      }
    } catch {
      // Ignore errors, continue polling
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  session.state = 'expired'
  return null
}

/**
 * Confirm emoji verification and complete pairing
 * Called by Device A after user confirms emojis match
 */
export async function confirmPairing(
  session: PairingSession,
  onProgress?: PairingProgressCallback
): Promise<{ success: boolean; error?: string }> {
  if (!session.peerIpnsPublicKey || !session.peerAuthPublicKey || !session.peerDeviceId) {
    return { success: false, error: 'Incomplete session' }
  }

  onProgress?.({ state: 'verified', message: 'Emojis verified!' })
  session.state = 'verified'

  try {
    onProgress?.({ state: 'exchanging', message: 'Exchanging keys...' })
    session.state = 'exchanging'

    const deviceKeys = await getDeviceKeysAsBytes()
    if (!deviceKeys) {
      return { success: false, error: 'Device keys not found' }
    }

    const syncConfig = await getSyncConfig()
    if (!syncConfig) {
      return { success: false, error: 'Sync config not found' }
    }

    const provider = await getConfiguredProvider()
    if (!provider) {
      return { success: false, error: 'Provider not configured' }
    }

    // Get or generate symmetric keys
    let personalKey: Uint8Array
    let broadcastKey: Uint8Array
    const isFirstPairing = !syncConfig.personalKey || !syncConfig.broadcastKey

    if (syncConfig.personalKey && syncConfig.broadcastKey) {
      personalKey = base64ToBytes(syncConfig.personalKey)
      broadcastKey = base64ToBytes(syncConfig.broadcastKey)
    } else {
      // First pairing - generate new keys
      const { generateSymmetricKey } = await import('./crypto')
      personalKey = generateSymmetricKey()
      broadcastKey = generateSymmetricKey()

      await updateSyncConfig({
        personalKey: bytesToBase64(personalKey),
        broadcastKey: bytesToBase64(broadcastKey),
      })
    }

    // Migrate solo data if this is first pairing and we have data
    if (isFirstPairing && (await needsMigration())) {
      onProgress?.({ state: 'exchanging', message: 'Migrating existing data...' })
      const migrationResult = await migrateSoloData()
      if (!migrationResult.success) {
        return { success: false, error: migrationResult.error || 'Migration failed' }
      }
    }

    // Update DeviceRing - add peer
    const deviceRing: DeviceRing = {
      devices: [
        createDeviceRingEntry(deviceKeys.authPublicKey, deviceKeys.ipnsPublicKey, 0),
        createDeviceRingEntry(session.peerAuthPublicKey, session.peerIpnsPublicKey, 0),
      ],
    }
    const encryptedRing = await createEncryptedDeviceRing(deviceRing, broadcastKey)
    const ringUpload = await provider.upload(encryptedRing, { name: 'device-ring' })

    // Update PeerDirectory - add entry for peer with keys
    const selfPayload: PeerDirectoryPayload = {
      personalKey,
      broadcastKey,
      sharedGroups: [],
    }
    const peerPayload: PeerDirectoryPayload = {
      personalKey,
      broadcastKey,
      sharedGroups: [],
    }

    const peerDirectory = await createSerializedPeerDirectory(deviceKeys.authPrivateKey, [
      { recipientPublicKey: deviceKeys.authPublicKey, payload: selfPayload },
      { recipientPublicKey: session.peerAuthPublicKey, payload: peerPayload },
    ])
    const peerDirBytes = serializePeerDirectory(peerDirectory)
    const peerDirUpload = await provider.upload(peerDirBytes, { name: 'peer-directory' })

    // Create empty database (migration happens separately)
    const database = {
      people: [],
      records: [],
      groups: [],
    }
    const encryptedDb = await createEncryptedDatabase(database, personalKey)
    const dbUpload = await provider.upload(encryptedDb, { name: 'database' })

    // Create and publish manifest
    const manifest = await createDeviceManifest({
      databaseCid: dbUpload.cid,
      latestMutationId: 0,
      chunkIndex: [],
      deviceRingCid: ringUpload.cid,
      peerDirectoryCid: peerDirUpload.cid,
      personalKey,
    })
    const manifestBytes = serializeDeviceManifest(manifest)
    const manifestUpload = await provider.upload(manifestBytes, { name: 'manifest' })

    // Publish IPNS
    await provider.publishIpns(deviceKeys.ipnsPrivateKey, manifestUpload.cid, 2)

    // Update sync config
    await updateSyncConfig({
      mode: 'synced',
    })

    session.state = 'completed'
    onProgress?.({ state: 'completed', message: 'Pairing complete!' })

    return { success: true }
  } catch (error) {
    session.state = 'failed'
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Pairing failed',
    }
  }
}

// ============================================================================
// Joiner Completion (Device B)
// ============================================================================

/**
 * Poll for keys from initiator's PeerDirectory
 * Called by Device B after publishing response
 */
export async function pollForKeys(
  session: PairingSession,
  onProgress?: PairingProgressCallback
): Promise<{ success: boolean; error?: string }> {
  if (session.role !== 'joiner' || !session.peerIpnsPublicKey || !session.peerAuthPublicKey) {
    return { success: false, error: 'Invalid session for key polling' }
  }

  onProgress?.({ state: 'responded', message: 'Waiting for key exchange...' })

  const deviceKeys = await getDeviceKeysAsBytes()
  if (!deviceKeys) {
    return { success: false, error: 'Device keys not found' }
  }

  const provider = await getConfiguredProvider()
  if (!provider) {
    return { success: false, error: 'Provider not configured' }
  }

  // Derive peer's IPNS name
  const { sha256 } = await import('@noble/hashes/sha2.js')
  const peerIpnsName = bytesToHex(sha256(session.peerIpnsPublicKey))

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    if (Date.now() > session.expiresAt) {
      session.state = 'expired'
      return { success: false, error: 'Session expired' }
    }

    try {
      // Resolve peer's IPNS
      const record = await provider.resolveIpns(peerIpnsName)
      if (!record) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        continue
      }

      // Fetch manifest
      const manifestResult = await provider.fetch(record.value)
      const manifest = deserializeDeviceManifest(manifestResult.data)

      // Fetch peer directory
      const peerDirResult = await provider.fetch(manifest.peerDirectoryCid)
      const peerDirectory = deserializePeerDirectory(peerDirResult.data)

      // Try to find and decrypt our entry
      const payload = await findAndDecryptPeerDirectoryEntry(
        peerDirectory,
        deviceKeys.authPrivateKey,
        deviceKeys.authPublicKey,
        session.peerAuthPublicKey
      )

      if (payload) {
        onProgress?.({ state: 'exchanging', message: 'Keys received!' })
        session.state = 'exchanging'

        // Save keys
        await updateSyncConfig({
          mode: 'synced',
          personalKey: bytesToBase64(payload.personalKey!),
          broadcastKey: bytesToBase64(payload.broadcastKey),
        })

        // Migrate solo data if we have any
        if (await needsMigration()) {
          onProgress?.({ state: 'exchanging', message: 'Migrating existing data...' })
          const migrationResult = await migrateSoloData()
          if (!migrationResult.success) {
            session.state = 'failed'
            return { success: false, error: migrationResult.error || 'Migration failed' }
          }
        }

        // Now publish our own manifest with the peer
        const personalKey = payload.personalKey!
        const broadcastKey = payload.broadcastKey

        // Create DeviceRing
        const deviceRing: DeviceRing = {
          devices: [
            createDeviceRingEntry(deviceKeys.authPublicKey, deviceKeys.ipnsPublicKey, 0),
            createDeviceRingEntry(session.peerAuthPublicKey, session.peerIpnsPublicKey, 0),
          ],
        }
        const encryptedRing = await createEncryptedDeviceRing(deviceRing, broadcastKey)
        const ringUpload = await provider.upload(encryptedRing, { name: 'device-ring' })

        // Create PeerDirectory
        const selfPayload: PeerDirectoryPayload = {
          personalKey,
          broadcastKey,
          sharedGroups: payload.sharedGroups,
        }
        const peerPayload: PeerDirectoryPayload = {
          personalKey,
          broadcastKey,
          sharedGroups: payload.sharedGroups,
        }

        const ourPeerDirectory = await createSerializedPeerDirectory(deviceKeys.authPrivateKey, [
          { recipientPublicKey: deviceKeys.authPublicKey, payload: selfPayload },
          { recipientPublicKey: session.peerAuthPublicKey, payload: peerPayload },
        ])
        const ourPeerDirBytes = serializePeerDirectory(ourPeerDirectory)
        const ourPeerDirUpload = await provider.upload(ourPeerDirBytes, { name: 'peer-directory' })

        // Create empty database
        const database = { people: [], records: [], groups: [] }
        const encryptedDb = await createEncryptedDatabase(database, personalKey)
        const dbUpload = await provider.upload(encryptedDb, { name: 'database' })

        // Create and publish manifest
        const ourManifest = await createDeviceManifest({
          databaseCid: dbUpload.cid,
          latestMutationId: 0,
          chunkIndex: [],
          deviceRingCid: ringUpload.cid,
          peerDirectoryCid: ourPeerDirUpload.cid,
          personalKey,
        })
        const ourManifestBytes = serializeDeviceManifest(ourManifest)
        const ourManifestUpload = await provider.upload(ourManifestBytes, { name: 'manifest' })

        await provider.publishIpns(deviceKeys.ipnsPrivateKey, ourManifestUpload.cid, 1)

        session.state = 'completed'
        onProgress?.({ state: 'completed', message: 'Pairing complete!' })

        return { success: true }
      }
    } catch {
      // Continue polling
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  session.state = 'expired'
  return { success: false, error: 'Timeout waiting for keys' }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a session is still valid
 */
export function isSessionValid(session: PairingSession): boolean {
  return (
    Date.now() < session.expiresAt &&
    session.state !== 'failed' &&
    session.state !== 'expired' &&
    session.state !== 'completed'
  )
}

/**
 * Get human-readable state message
 */
export function getStateMessage(state: PairingState): string {
  switch (state) {
    case 'created':
      return 'Waiting for device to scan QR code...'
    case 'scanned':
      return 'QR code scanned, processing...'
    case 'responded':
      return 'Verify the emojis match on both devices'
    case 'verified':
      return 'Emojis verified, exchanging keys...'
    case 'exchanging':
      return 'Exchanging encryption keys...'
    case 'completed':
      return 'Pairing complete!'
    case 'failed':
      return 'Pairing failed'
    case 'expired':
      return 'Session expired'
    default:
      return 'Unknown state'
  }
}
