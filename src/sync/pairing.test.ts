/**
 * Device Pairing Tests
 *
 * Tests for the device pairing flow including QR generation, handshake, and verification.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateP256KeyPair, generateEd25519KeyPair, bytesToBase64 } from './crypto'

// Mock the db module
vi.mock('../db', () => ({
  getSyncConfig: vi.fn(),
  updateSyncConfig: vi.fn(),
  getDeviceKeys: vi.fn(),
}))

// Mock device setup
vi.mock('./device-setup', () => ({
  getDeviceKeysAsBytes: vi.fn(),
  ensureDeviceKeys: vi.fn(),
  getConfiguredProvider: vi.fn(),
}))

// Mock migration
vi.mock('./migration', () => ({
  migrateSoloData: vi.fn().mockResolvedValue({ success: true }),
  needsMigration: vi.fn().mockResolvedValue(false),
}))

import { getSyncConfig, updateSyncConfig, getDeviceKeys } from '../db'
import { getDeviceKeysAsBytes, ensureDeviceKeys, getConfiguredProvider } from './device-setup'

// ============================================================================
// Test Data
// ============================================================================

function createMockDeviceKeys() {
  const ipnsKeyPair = generateEd25519KeyPair()
  const authKeyPair = generateP256KeyPair()
  return {
    ipnsPrivateKey: ipnsKeyPair.privateKey,
    ipnsPublicKey: ipnsKeyPair.publicKey,
    authPrivateKey: authKeyPair.privateKey,
    authPublicKey: authKeyPair.publicKey,
    deviceId: 'test-device-id-' + Math.random().toString(36).slice(2),
  }
}

function createMockDeviceKeysForDb(keys: ReturnType<typeof createMockDeviceKeys>) {
  return {
    key: 'device-keys' as const,
    ipnsPrivateKey: bytesToBase64(keys.ipnsPrivateKey),
    ipnsPublicKey: bytesToBase64(keys.ipnsPublicKey),
    authPrivateKey: bytesToBase64(keys.authPrivateKey),
    authPublicKey: bytesToBase64(keys.authPublicKey),
    deviceId: keys.deviceId,
    createdAt: Date.now(),
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('QR Payload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generatePairingQR', () => {
    it('should generate valid QR payload', async () => {
      const mockKeys = createMockDeviceKeys()
      vi.mocked(getDeviceKeysAsBytes).mockResolvedValue(mockKeys)
      vi.mocked(getSyncConfig).mockResolvedValue({
        key: 'sync-config',
        mode: 'solo',
        migrated: false,
        providerConfig: JSON.stringify({ type: 'pinata', apiKey: 'test' }),
      })

      const { generatePairingQR } = await import('./pairing')
      const { payload, session } = await generatePairingQR(true)

      expect(payload.version).toBe(1)
      expect(payload.ipnsPublicKey).toBe(bytesToBase64(mockKeys.ipnsPublicKey))
      expect(payload.authPublicKey).toBe(bytesToBase64(mockKeys.authPublicKey))
      expect(payload.tempIpnsPrivateKey).toBeDefined()
      expect(payload.providerConfig).toEqual({ type: 'pinata', apiKey: 'test' })

      expect(session.role).toBe('initiator')
      expect(session.state).toBe('created')
      expect(session.tempIpnsPrivateKey).toBeDefined()
      expect(session.tempIpnsPublicKey).toBeDefined()
    })

    it('should fail if device not set up', async () => {
      vi.mocked(getDeviceKeysAsBytes).mockResolvedValue(null)

      const { generatePairingQR } = await import('./pairing')

      await expect(generatePairingQR()).rejects.toThrow('Device not set up')
    })

    it('should omit provider config if not requested', async () => {
      const mockKeys = createMockDeviceKeys()
      vi.mocked(getDeviceKeysAsBytes).mockResolvedValue(mockKeys)
      vi.mocked(getSyncConfig).mockResolvedValue({
        key: 'sync-config',
        mode: 'solo',
        migrated: false,
        providerConfig: JSON.stringify({ type: 'pinata', apiKey: 'test' }),
      })

      const { generatePairingQR } = await import('./pairing')
      const { payload } = await generatePairingQR(false)

      expect(payload.providerConfig).toBeUndefined()
    })
  })

  describe('serializeQRPayload / parseQRPayload', () => {
    it('should serialize and parse QR payload', async () => {
      const mockKeys = createMockDeviceKeys()
      vi.mocked(getDeviceKeysAsBytes).mockResolvedValue(mockKeys)
      vi.mocked(getSyncConfig).mockResolvedValue({
        key: 'sync-config',
        mode: 'solo',
        migrated: false,
      })

      const { generatePairingQR, serializeQRPayload, parseQRPayload } = await import('./pairing')
      const { payload } = await generatePairingQR(false)

      const serialized = serializeQRPayload(payload)
      expect(typeof serialized).toBe('string')

      const parsed = parseQRPayload(serialized)
      expect(parsed).toEqual(payload)
    })

    it('should return null for invalid QR data', async () => {
      const { parseQRPayload } = await import('./pairing')

      expect(parseQRPayload('invalid')).toBeNull()
      expect(parseQRPayload('{}')).toBeNull()
      expect(parseQRPayload('{"version": 2}')).toBeNull()
    })
  })
})

describe('Session Management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('isSessionValid', () => {
    it('should return true for fresh session', async () => {
      const mockKeys = createMockDeviceKeys()
      vi.mocked(getDeviceKeysAsBytes).mockResolvedValue(mockKeys)
      vi.mocked(getSyncConfig).mockResolvedValue({
        key: 'sync-config',
        mode: 'solo',
        migrated: false,
      })

      const { generatePairingQR, isSessionValid } = await import('./pairing')
      const { session } = await generatePairingQR(false)

      expect(isSessionValid(session)).toBe(true)
    })

    it('should return false for expired session', async () => {
      const mockKeys = createMockDeviceKeys()
      vi.mocked(getDeviceKeysAsBytes).mockResolvedValue(mockKeys)
      vi.mocked(getSyncConfig).mockResolvedValue({
        key: 'sync-config',
        mode: 'solo',
        migrated: false,
      })

      const { generatePairingQR, isSessionValid } = await import('./pairing')
      const { session } = await generatePairingQR(false)

      // Manually expire the session
      session.expiresAt = Date.now() - 1000

      expect(isSessionValid(session)).toBe(false)
    })

    it('should return false for failed/completed sessions', async () => {
      const mockKeys = createMockDeviceKeys()
      vi.mocked(getDeviceKeysAsBytes).mockResolvedValue(mockKeys)
      vi.mocked(getSyncConfig).mockResolvedValue({
        key: 'sync-config',
        mode: 'solo',
        migrated: false,
      })

      const { generatePairingQR, isSessionValid } = await import('./pairing')
      const { session } = await generatePairingQR(false)

      session.state = 'failed'
      expect(isSessionValid(session)).toBe(false)

      session.state = 'completed'
      expect(isSessionValid(session)).toBe(false)

      session.state = 'expired'
      expect(isSessionValid(session)).toBe(false)
    })
  })

  describe('getStateMessage', () => {
    it('should return human-readable messages', async () => {
      const { getStateMessage } = await import('./pairing')

      expect(getStateMessage('created')).toContain('scan')
      expect(getStateMessage('scanned')).toContain('processing')
      expect(getStateMessage('responded')).toContain('emojis')
      expect(getStateMessage('verified')).toContain('keys')
      expect(getStateMessage('exchanging')).toContain('keys')
      expect(getStateMessage('completed')).toContain('complete')
      expect(getStateMessage('failed')).toContain('failed')
      expect(getStateMessage('expired')).toContain('expired')
    })
  })
})

describe('Joiner Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initiateJoining', () => {
    it('should process QR and create joiner session', async () => {
      const initiatorKeys = createMockDeviceKeys()
      const joinerKeys = createMockDeviceKeys()
      const tempIpnsKeyPair = generateEd25519KeyPair()

      // Mock for joiner
      vi.mocked(ensureDeviceKeys).mockResolvedValue(createMockDeviceKeysForDb(joinerKeys))
      vi.mocked(getSyncConfig).mockResolvedValue({
        key: 'sync-config',
        mode: 'solo',
        migrated: false,
      })
      vi.mocked(updateSyncConfig).mockResolvedValue()

      // Mock provider
      const mockProvider = {
        type: 'pinata' as const,
        upload: vi.fn().mockResolvedValue({ cid: 'test-cid' }),
        publishIpns: vi.fn().mockResolvedValue({ name: 'test-name' }),
        fetch: vi.fn(),
        unpin: vi.fn(),
        isPinned: vi.fn(),
        resolveIpns: vi.fn(),
        validateConfig: vi.fn(),
      }
      vi.mocked(getConfiguredProvider).mockResolvedValue(mockProvider)

      const payload = {
        version: 1 as const,
        ipnsPublicKey: bytesToBase64(initiatorKeys.ipnsPublicKey),
        authPublicKey: bytesToBase64(initiatorKeys.authPublicKey),
        tempIpnsPrivateKey: bytesToBase64(tempIpnsKeyPair.privateKey),
        providerConfig: { type: 'pinata' as const, apiKey: 'test' },
      }

      const { initiateJoining } = await import('./pairing')
      const { session, emojis } = await initiateJoining(payload)

      expect(session.role).toBe('joiner')
      expect(session.state).toBe('responded')
      expect(emojis).toHaveLength(6)

      // Should have published response
      expect(mockProvider.upload).toHaveBeenCalled()
      expect(mockProvider.publishIpns).toHaveBeenCalled()
    })

    it('should use provider config from QR if not configured', async () => {
      const initiatorKeys = createMockDeviceKeys()
      const joinerKeys = createMockDeviceKeys()
      const tempIpnsKeyPair = generateEd25519KeyPair()

      vi.mocked(ensureDeviceKeys).mockResolvedValue(createMockDeviceKeysForDb(joinerKeys))
      vi.mocked(getSyncConfig).mockResolvedValue({
        key: 'sync-config',
        mode: 'solo',
        migrated: false,
        // No provider config
      })
      vi.mocked(updateSyncConfig).mockResolvedValue()

      const mockProvider = {
        type: 'pinata' as const,
        upload: vi.fn().mockResolvedValue({ cid: 'test-cid' }),
        publishIpns: vi.fn().mockResolvedValue({ name: 'test-name' }),
        fetch: vi.fn(),
        unpin: vi.fn(),
        isPinned: vi.fn(),
        resolveIpns: vi.fn(),
        validateConfig: vi.fn(),
      }
      vi.mocked(getConfiguredProvider).mockResolvedValue(mockProvider)

      const providerConfig = { type: 'pinata' as const, apiKey: 'test-key' }
      const payload = {
        version: 1 as const,
        ipnsPublicKey: bytesToBase64(initiatorKeys.ipnsPublicKey),
        authPublicKey: bytesToBase64(initiatorKeys.authPublicKey),
        tempIpnsPrivateKey: bytesToBase64(tempIpnsKeyPair.privateKey),
        providerConfig,
      }

      const { initiateJoining } = await import('./pairing')
      await initiateJoining(payload)

      // Should save provider config
      expect(updateSyncConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          providerType: 'pinata',
          providerConfig: JSON.stringify(providerConfig),
        })
      )
    })
  })
})

describe('Emoji Verification', () => {
  it('should derive consistent emojis from keys', async () => {
    const ipnsKeyPair = generateEd25519KeyPair()
    const authKeyPair = generateP256KeyPair()

    const { deriveVerificationEmojis } = await import('./crypto')

    const emojis1 = deriveVerificationEmojis(ipnsKeyPair.publicKey, authKeyPair.publicKey)
    const emojis2 = deriveVerificationEmojis(ipnsKeyPair.publicKey, authKeyPair.publicKey)

    expect(emojis1).toHaveLength(6)
    expect(emojis1).toEqual(emojis2)
  })

  it('should derive different emojis for different keys', async () => {
    const ipnsKeyPair1 = generateEd25519KeyPair()
    const authKeyPair1 = generateP256KeyPair()
    const ipnsKeyPair2 = generateEd25519KeyPair()
    const authKeyPair2 = generateP256KeyPair()

    const { deriveVerificationEmojis } = await import('./crypto')

    const emojis1 = deriveVerificationEmojis(ipnsKeyPair1.publicKey, authKeyPair1.publicKey)
    const emojis2 = deriveVerificationEmojis(ipnsKeyPair2.publicKey, authKeyPair2.publicKey)

    // Very unlikely to be the same
    expect(emojis1.join('')).not.toBe(emojis2.join(''))
  })
})
