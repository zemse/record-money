/**
 * Device Setup Service
 *
 * Handles first-time device setup for P2P sync:
 * - Key generation (IPNS, Auth, Personal, Broadcast)
 * - Provider configuration
 * - Initial manifest publishing
 */

import {
  generateP256KeyPair,
  generateEd25519KeyPair,
  generateSymmetricKey,
  deriveDeviceId,
  bytesToBase64,
  base64ToBytes,
  deriveVerificationEmojis,
} from './crypto'
import {
  createDeviceManifest,
  serializeDeviceManifest,
  createEncryptedDeviceRing,
  createSerializedPeerDirectory,
  serializePeerDirectory,
  createEncryptedDatabase,
  createDeviceRingEntry,
} from './schemas'
import { createProvider, validateProviderConfig } from './ipfs'
import { getDeviceKeys, saveDeviceKeys, getSyncConfig, updateSyncConfig, generateUUID } from '../db'
import type { ProviderConfig } from './ipfs'
import type { DeviceKeys, SyncConfig } from '../types'
import type { DeviceRing, PeerDirectoryPayload, Person } from './types'

// ============================================================================
// Types
// ============================================================================

export interface DeviceSetupResult {
  success: boolean
  deviceId?: string
  ipnsName?: string
  verificationEmojis?: string[]
  error?: string
}

export interface DeviceSetupProgress {
  step: 'keys' | 'provider' | 'manifest' | 'complete'
  message: string
}

export type ProgressCallback = (progress: DeviceSetupProgress) => void

// ============================================================================
// Key Management
// ============================================================================

/**
 * Generate all device keys if not already present
 */
export async function ensureDeviceKeys(): Promise<DeviceKeys> {
  const existing = await getDeviceKeys()
  if (existing) {
    return existing
  }

  // Generate new keys
  const ipnsKeyPair = generateEd25519KeyPair()
  const authKeyPair = generateP256KeyPair()
  const deviceId = deriveDeviceId(authKeyPair.publicKey)

  const keys: Omit<DeviceKeys, 'key'> = {
    ipnsPrivateKey: bytesToBase64(ipnsKeyPair.privateKey),
    ipnsPublicKey: bytesToBase64(ipnsKeyPair.publicKey),
    authPrivateKey: bytesToBase64(authKeyPair.privateKey),
    authPublicKey: bytesToBase64(authKeyPair.publicKey),
    deviceId,
    createdAt: Date.now(),
  }

  await saveDeviceKeys(keys)
  return { key: 'device-keys', ...keys }
}

/**
 * Get device keys as Uint8Array (for crypto operations)
 */
export async function getDeviceKeysAsBytes(): Promise<{
  ipnsPrivateKey: Uint8Array
  ipnsPublicKey: Uint8Array
  authPrivateKey: Uint8Array
  authPublicKey: Uint8Array
  deviceId: string
} | null> {
  const keys = await getDeviceKeys()
  if (!keys) return null

  return {
    ipnsPrivateKey: base64ToBytes(keys.ipnsPrivateKey),
    ipnsPublicKey: base64ToBytes(keys.ipnsPublicKey),
    authPrivateKey: base64ToBytes(keys.authPrivateKey),
    authPublicKey: base64ToBytes(keys.authPublicKey),
    deviceId: keys.deviceId,
  }
}

/**
 * Get verification emojis for current device
 */
export async function getDeviceVerificationEmojis(): Promise<string[] | null> {
  const keys = await getDeviceKeysAsBytes()
  if (!keys) return null
  return deriveVerificationEmojis(keys.ipnsPublicKey, keys.authPublicKey)
}

// ============================================================================
// Provider Configuration
// ============================================================================

/**
 * Configure and validate IPFS provider
 */
export async function configureProvider(
  config: ProviderConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    await validateProviderConfig(config)

    await updateSyncConfig({
      providerType: config.type,
      providerConfig: JSON.stringify(config),
    })

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate provider config',
    }
  }
}

/**
 * Get configured provider
 */
export async function getConfiguredProvider() {
  const config = await getSyncConfig()
  if (!config?.providerConfig) return null

  try {
    const providerConfig = JSON.parse(config.providerConfig) as ProviderConfig
    return createProvider(providerConfig)
  } catch {
    return null
  }
}

// ============================================================================
// Initial Setup
// ============================================================================

/**
 * Perform complete device setup for P2P sync
 * This creates keys, sets up provider, and publishes initial manifest
 */
export async function setupDevice(
  providerConfig: ProviderConfig,
  selfName: string,
  onProgress?: ProgressCallback
): Promise<DeviceSetupResult> {
  try {
    // Step 1: Generate/get device keys
    onProgress?.({ step: 'keys', message: 'Generating device keys...' })
    const deviceKeys = await ensureDeviceKeys()
    const keys = {
      ipnsPrivateKey: base64ToBytes(deviceKeys.ipnsPrivateKey),
      ipnsPublicKey: base64ToBytes(deviceKeys.ipnsPublicKey),
      authPrivateKey: base64ToBytes(deviceKeys.authPrivateKey),
      authPublicKey: base64ToBytes(deviceKeys.authPublicKey),
      deviceId: deviceKeys.deviceId,
    }

    // Step 2: Validate and configure provider
    onProgress?.({ step: 'provider', message: 'Validating provider...' })
    const providerResult = await configureProvider(providerConfig)
    if (!providerResult.success) {
      return { success: false, error: providerResult.error }
    }

    const provider = createProvider(providerConfig)

    // Step 3: Generate symmetric keys
    const personalKey = generateSymmetricKey()
    const broadcastKey = generateSymmetricKey()

    // Step 4: Create self person
    const selfPersonUuid = generateUUID()
    const selfPerson: Person = {
      uuid: selfPersonUuid,
      name: selfName,
      devices: [
        {
          deviceId: keys.deviceId,
          ipnsPublicKey: keys.ipnsPublicKey,
          authPublicKey: keys.authPublicKey,
        },
      ],
      addedAt: Date.now(),
      isSelf: true,
    }

    // Step 5: Publish initial manifest
    onProgress?.({ step: 'manifest', message: 'Publishing initial manifest...' })

    // Create empty database
    const database = {
      people: [selfPerson],
      records: [],
      groups: [],
    }
    const encryptedDb = await createEncryptedDatabase(database, personalKey)
    const dbUpload = await provider.upload(encryptedDb, { name: 'database' })

    // Create device ring (just this device)
    const deviceRing: DeviceRing = {
      devices: [createDeviceRingEntry(keys.authPublicKey, keys.ipnsPublicKey, 0)],
    }
    const encryptedRing = await createEncryptedDeviceRing(deviceRing, broadcastKey)
    const ringUpload = await provider.upload(encryptedRing, { name: 'device-ring' })

    // Create peer directory (just self entry)
    const selfPayload: PeerDirectoryPayload = {
      personalKey,
      broadcastKey,
      sharedGroups: [],
    }
    const peerDirectory = await createSerializedPeerDirectory(keys.authPrivateKey, [
      { recipientPublicKey: keys.authPublicKey, payload: selfPayload },
    ])
    const peerDirBytes = serializePeerDirectory(peerDirectory)
    const peerDirUpload = await provider.upload(peerDirBytes, { name: 'peer-directory' })

    // Create device manifest
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

    // Publish IPNS record pointing to manifest
    await provider.publishIpns(keys.ipnsPrivateKey, manifestUpload.cid, 1)

    // Step 6: Save sync config
    await updateSyncConfig({
      mode: 'synced',
      personalKey: bytesToBase64(personalKey),
      broadcastKey: bytesToBase64(broadcastKey),
      selfPersonUuid,
      migrated: true, // No existing data to migrate for fresh setup
    })

    onProgress?.({ step: 'complete', message: 'Setup complete!' })

    // Get verification emojis
    const verificationEmojis = deriveVerificationEmojis(keys.ipnsPublicKey, keys.authPublicKey)

    return {
      success: true,
      deviceId: keys.deviceId,
      verificationEmojis,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Setup failed',
    }
  }
}

// ============================================================================
// Status Checks
// ============================================================================

/**
 * Check if device is set up for sync
 */
export async function isDeviceSetUp(): Promise<boolean> {
  const config = await getSyncConfig()
  return config?.mode === 'synced'
}

/**
 * Check if device has keys but no sync configured
 */
export async function hasDeviceKeys(): Promise<boolean> {
  const keys = await getDeviceKeys()
  return keys !== undefined
}

/**
 * Get current sync status
 */
export async function getSyncStatus(): Promise<{
  mode: 'solo' | 'synced' | 'not_configured'
  deviceId?: string
  hasProvider: boolean
}> {
  const config = await getSyncConfig()
  const keys = await getDeviceKeys()

  if (!config || config.mode === 'solo') {
    return {
      mode: keys ? 'solo' : 'not_configured',
      deviceId: keys?.deviceId,
      hasProvider: !!config?.providerConfig,
    }
  }

  return {
    mode: 'synced',
    deviceId: keys?.deviceId,
    hasProvider: !!config.providerConfig,
  }
}

/**
 * Reset sync configuration (for testing/debugging)
 * WARNING: This will break sync with paired devices
 */
export async function resetSyncConfig(): Promise<void> {
  await updateSyncConfig({
    mode: 'solo',
    providerType: undefined,
    providerConfig: undefined,
    personalKey: undefined,
    broadcastKey: undefined,
    selfPersonUuid: undefined,
    migrated: false,
    migratedAt: undefined,
    cidHistory: undefined,
  })
}
