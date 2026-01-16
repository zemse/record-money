/**
 * Security Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// Mocks
// ============================================================================

const mockGetSyncConfig = vi.fn()
const mockUpdateSyncConfig = vi.fn()
const mockGetDeviceKeys = vi.fn()
const mockQueueMutation = vi.fn()
const mockSaveGroupKey = vi.fn()
const mockGetGroupKey = vi.fn()
const mockGetAllGroupKeys = vi.fn()
const mockGetAllPeerSyncStates = vi.fn()
const mockGetSelfPerson = vi.fn()
const mockGetAllPeople = vi.fn()

const mockPeerSyncStateTable = {
  delete: vi.fn(),
}

const mockRecordsTable = {
  where: vi.fn(() => ({
    equals: vi.fn(() => ({
      toArray: vi.fn().mockResolvedValue([]),
    })),
  })),
  add: vi.fn(),
}

const mockGroupsTable = {
  get: vi.fn(),
  add: vi.fn(),
}

vi.mock('../db', () => ({
  db: {
    peerSyncState: mockPeerSyncStateTable,
    records: mockRecordsTable,
    groups: mockGroupsTable,
  },
  generateUUID: vi.fn(() => 'test-uuid'),
  now: vi.fn(() => 1700000000000),
  getSyncConfig: () => mockGetSyncConfig(),
  updateSyncConfig: (u: unknown) => mockUpdateSyncConfig(u),
  getDeviceKeys: () => mockGetDeviceKeys(),
  saveDeviceKeys: vi.fn(),
  getGroupKey: (uuid: string) => mockGetGroupKey(uuid),
  saveGroupKey: (key: unknown) => mockSaveGroupKey(key),
  getAllGroupKeys: () => mockGetAllGroupKeys(),
  getAllPeerSyncStates: () => mockGetAllPeerSyncStates(),
  updatePeerSyncState: vi.fn(),
  getSelfPerson: () => mockGetSelfPerson(),
  getAllPeople: () => mockGetAllPeople(),
  queueMutation: (m: string) => mockQueueMutation(m),
}))

const mockGetConfiguredProvider = vi.fn()
const mockGetDeviceKeysAsBytes = vi.fn()

vi.mock('./device-setup', () => ({
  getConfiguredProvider: () => mockGetConfiguredProvider(),
  getDeviceKeysAsBytes: () => mockGetDeviceKeysAsBytes(),
}))

vi.mock('./mutations', () => ({
  createSignedMutation: vi.fn(() => ({
    version: 1,
    uuid: 'mutation-uuid',
    id: 1,
    targetUuid: 'target-uuid',
    targetType: 'device',
    operation: { type: 'delete' },
    timestamp: Date.now(),
    signedAt: Date.now(),
    authorDevicePublicKey: new Uint8Array(65),
    signature: new Uint8Array(64),
  })),
  serializeMutation: vi.fn(() => '{"test": "mutation"}'),
  verifyMutation: vi.fn().mockResolvedValue(true),
}))

vi.mock('./crypto', () => ({
  generateSymmetricKey: vi.fn().mockResolvedValue(new Uint8Array(32)),
  bytesToBase64: vi.fn((bytes: Uint8Array) => Buffer.from(bytes).toString('base64')),
  base64ToBytes: vi.fn((str: string) => new Uint8Array(Buffer.from(str, 'base64'))),
  sha256: vi.fn().mockResolvedValue(new Uint8Array(32)),
  ecdhDeriveKey: vi.fn().mockResolvedValue(new Uint8Array(32)),
  encryptAesGcm: vi.fn().mockResolvedValue(new Uint8Array(48)),
}))

vi.mock('./schemas', () => ({
  createEncryptedDeviceRing: vi.fn().mockResolvedValue(new Uint8Array()),
  createEncryptedMutationChunk: vi.fn().mockResolvedValue(new Uint8Array()),
  createDeviceManifest: vi.fn().mockResolvedValue({
    databaseCid: 'db-cid',
    latestMutationId: 'encrypted',
    chunkIndex: 'encrypted',
    deviceRingCid: 'ring-cid',
    peerDirectoryCid: 'peer-cid',
  }),
  serializeDeviceManifest: vi.fn(() => new Uint8Array()),
}))

// ============================================================================
// Tests
// ============================================================================

describe('Security Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default mocks
    mockGetSyncConfig.mockResolvedValue({ mode: 'synced' })
    mockGetDeviceKeysAsBytes.mockResolvedValue({
      ipnsPrivateKey: new Uint8Array(32),
      ipnsPublicKey: new Uint8Array(32),
      authPrivateKey: new Uint8Array(32),
      authPublicKey: new Uint8Array(65),
      deviceId: 'current-device',
    })
    mockGetSelfPerson.mockResolvedValue({
      uuid: 'self-uuid',
      name: 'Test User',
      devices: [
        {
          deviceId: 'current-device',
          ipnsPublicKey: 'aXBuc0tleQ==',
          authPublicKey: 'YXV0aEtleQ==',
        },
      ],
      isSelf: true,
    })
    mockGetAllPeople.mockResolvedValue([])
    mockGetAllGroupKeys.mockResolvedValue([])
    mockGetAllPeerSyncStates.mockResolvedValue([])
    mockQueueMutation.mockResolvedValue(1)
    mockSaveGroupKey.mockResolvedValue(undefined)
    mockGetConfiguredProvider.mockResolvedValue({
      upload: vi.fn().mockResolvedValue({ cid: 'test-cid' }),
      publishIpns: vi.fn().mockResolvedValue(undefined),
    })
  })

  describe('removeDevice', () => {
    it('should return error when device keys not configured', async () => {
      mockGetDeviceKeysAsBytes.mockResolvedValue(null)

      const { removeDevice } = await import('./security')
      const result = await removeDevice('other-device')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Device keys not configured')
    })

    it('should not allow removing current device', async () => {
      const { removeDevice } = await import('./security')
      const result = await removeDevice('current-device')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Cannot remove current device')
    })

    it('should return error when device not found', async () => {
      mockGetAllPeerSyncStates.mockResolvedValue([])

      const { removeDevice } = await import('./security')
      const result = await removeDevice('non-existent')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Device not found')
    })

    it('should remove device and rotate keys', async () => {
      mockGetAllPeerSyncStates.mockResolvedValue([{ deviceId: 'other-device' }])

      const { removeDevice } = await import('./security')
      const result = await removeDevice('other-device')

      expect(result.success).toBe(true)
      expect(mockQueueMutation).toHaveBeenCalled()
      expect(mockPeerSyncStateTable.delete).toHaveBeenCalledWith('other-device')
    })
  })

  describe('selfRemoveDevice', () => {
    it('should return error when device keys not configured', async () => {
      mockGetDeviceKeysAsBytes.mockResolvedValue(null)

      const { selfRemoveDevice } = await import('./security')
      const result = await selfRemoveDevice()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Device keys not configured')
    })

    it('should self-remove and clear config', async () => {
      const { selfRemoveDevice } = await import('./security')
      const result = await selfRemoveDevice()

      expect(result.success).toBe(true)
      expect(mockQueueMutation).toHaveBeenCalled()
      expect(mockUpdateSyncConfig).toHaveBeenCalledWith({
        mode: 'solo',
        personalKey: undefined,
        broadcastKey: undefined,
      })
    })
  })

  describe('rotateGroupKey', () => {
    it('should generate new key and save it', async () => {
      mockGetGroupKey.mockResolvedValue({
        groupUuid: 'group-uuid',
        symmetricKey: 'old-key',
        createdAt: 1700000000000,
      })

      const { rotateGroupKey } = await import('./security')
      const result = await rotateGroupKey('group-uuid')

      expect(result.success).toBe(true)
      expect(mockSaveGroupKey).toHaveBeenCalledWith(
        expect.objectContaining({
          groupUuid: 'group-uuid',
          rotatedAt: expect.any(Number),
        })
      )
    })
  })

  describe('validateMutation', () => {
    it('should validate a correct mutation', async () => {
      const { validateMutation } = await import('./security')

      // Use the mocked now() value from beforeEach
      const mockNow = 1700000000000

      const mutation = {
        version: 1,
        uuid: 'test-uuid',
        id: 1,
        targetUuid: 'target-uuid',
        targetType: 'record' as const,
        operation: { type: 'create' as const, data: {} },
        timestamp: mockNow, // Use same time as mocked now()
        signedAt: mockNow,
        authorDevicePublicKey: new Uint8Array(65),
        signature: new Uint8Array(64),
      }

      const result = await validateMutation(mutation, [mutation.authorDevicePublicKey])

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should detect unknown author', async () => {
      const { validateMutation } = await import('./security')

      const mockNow = 1700000000000

      const mutation = {
        version: 1,
        uuid: 'test-uuid',
        id: 1,
        targetUuid: 'target-uuid',
        targetType: 'record' as const,
        operation: { type: 'create' as const, data: {} },
        timestamp: mockNow,
        signedAt: mockNow,
        authorDevicePublicKey: new Uint8Array(65),
        signature: new Uint8Array(64),
      }

      // Pass different known keys
      const differentKey = new Uint8Array(65)
      differentKey[0] = 1

      const result = await validateMutation(mutation, [differentKey])

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Unknown author')
    })

    it('should detect bad timestamp', async () => {
      const { validateMutation } = await import('./security')

      const mockNow = 1700000000000
      const oldTimestamp = mockNow - 30 * 24 * 60 * 60 * 1000 // 30 days before mocked now

      const mutation = {
        version: 1,
        uuid: 'test-uuid',
        id: 1,
        targetUuid: 'target-uuid',
        targetType: 'record' as const,
        operation: { type: 'create' as const, data: {} },
        timestamp: oldTimestamp,
        signedAt: oldTimestamp,
        authorDevicePublicKey: new Uint8Array(65),
        signature: new Uint8Array(64),
      }

      const result = await validateMutation(mutation, [mutation.authorDevicePublicKey])

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Timestamp too far in past or future')
    })
  })

  describe('malformed content reports', () => {
    it('should store and retrieve reports', async () => {
      const { reportMalformedContent, getMalformedContentReports, clearMalformedContentReports } =
        await import('./security')

      clearMalformedContentReports()

      reportMalformedContent({
        type: 'invalid_signature',
        mutationUuid: 'test-uuid',
        timestamp: Date.now(),
        details: 'Test report',
      })

      const reports = getMalformedContentReports()
      expect(reports).toHaveLength(1)
      expect(reports[0].type).toBe('invalid_signature')

      clearMalformedContentReports()
      expect(getMalformedContentReports()).toHaveLength(0)
    })
  })

  describe('forkGroup', () => {
    it('should return error when device keys not configured', async () => {
      mockGetDeviceKeysAsBytes.mockResolvedValue(null)

      const { forkGroup } = await import('./security')
      const result = await forkGroup('group-uuid', ['bad-person'])

      expect(result.success).toBe(false)
      expect(result.error).toBe('Device keys not configured')
    })

    it('should not allow excluding self', async () => {
      const { forkGroup } = await import('./security')
      const result = await forkGroup('group-uuid', ['self-uuid'])

      expect(result.success).toBe(false)
      expect(result.error).toContain('Cannot exclude yourself')
    })

    it('should return error when group not found', async () => {
      mockGroupsTable.get.mockResolvedValue(null)

      const { forkGroup } = await import('./security')
      const result = await forkGroup('non-existent', ['bad-person'])

      expect(result.success).toBe(false)
      expect(result.error).toBe('Group not found')
    })

    it('should fork group excluding bad actors', async () => {
      mockGroupsTable.get.mockResolvedValue({
        uuid: 'group-uuid',
        name: 'Test Group',
        members: ['self-uuid', 'good-person', 'bad-person'],
      })
      mockRecordsTable.where.mockReturnValue({
        equals: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([]),
        })),
      })

      const { forkGroup } = await import('./security')
      const result = await forkGroup('group-uuid', ['bad-person'])

      expect(result.success).toBe(true)
      expect(result.newGroupUuid).toBe('test-uuid')
      expect(mockGroupsTable.add).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Group (forked)',
          members: ['self-uuid', 'good-person'],
        })
      )
      expect(mockSaveGroupKey).toHaveBeenCalled()
    })
  })

  describe('handleDeviceRemovalMutation', () => {
    it('should return shouldRotate false for non-device mutations', async () => {
      const { handleDeviceRemovalMutation } = await import('./security')

      const mutation = {
        version: 1,
        uuid: 'test-uuid',
        id: 1,
        targetUuid: 'target-uuid',
        targetType: 'record' as const,
        operation: { type: 'create' as const, data: {} },
        timestamp: Date.now(),
        signedAt: Date.now(),
        authorDevicePublicKey: new Uint8Array(65),
        signature: new Uint8Array(64),
      }

      const result = await handleDeviceRemovalMutation(mutation)
      expect(result.shouldRotate).toBe(false)
    })

    it('should clear config when self is removed', async () => {
      const { handleDeviceRemovalMutation } = await import('./security')

      const mutation = {
        version: 1,
        uuid: 'test-uuid',
        id: 1,
        targetUuid: 'current-device', // Same as mock device ID
        targetType: 'device' as const,
        operation: { type: 'delete' as const },
        timestamp: Date.now(),
        signedAt: Date.now(),
        authorDevicePublicKey: new Uint8Array(65),
        signature: new Uint8Array(64),
      }

      const result = await handleDeviceRemovalMutation(mutation)

      expect(result.shouldRotate).toBe(false)
      expect(mockUpdateSyncConfig).toHaveBeenCalledWith({
        mode: 'solo',
        personalKey: undefined,
        broadcastKey: undefined,
      })
    })

    it('should signal key rotation when other device is removed', async () => {
      const { handleDeviceRemovalMutation } = await import('./security')

      const mutation = {
        version: 1,
        uuid: 'test-uuid',
        id: 1,
        targetUuid: 'other-device',
        targetType: 'device' as const,
        operation: { type: 'delete' as const },
        timestamp: Date.now(),
        signedAt: Date.now(),
        authorDevicePublicKey: new Uint8Array(65),
        signature: new Uint8Array(64),
      }

      const result = await handleDeviceRemovalMutation(mutation)

      expect(result.shouldRotate).toBe(true)
      expect(mockPeerSyncStateTable.delete).toHaveBeenCalledWith('other-device')
    })
  })

  describe('checkIfPossiblyRemoved', () => {
    it('should return false when no failures', async () => {
      mockGetAllPeerSyncStates.mockResolvedValue([
        { deviceId: 'd1', consecutiveFailures: 0 },
        { deviceId: 'd2', consecutiveFailures: 0 },
      ])

      const { checkIfPossiblyRemoved } = await import('./security')
      const result = await checkIfPossiblyRemoved()

      expect(result.possiblyRemoved).toBe(false)
      expect(result.consecutiveFailures).toBe(0)
    })

    it('should return true when many consecutive failures', async () => {
      mockGetAllPeerSyncStates.mockResolvedValue([
        { deviceId: 'd1', consecutiveFailures: 5 },
        { deviceId: 'd2', consecutiveFailures: 6 },
      ])

      const { checkIfPossiblyRemoved } = await import('./security')
      const result = await checkIfPossiblyRemoved()

      expect(result.possiblyRemoved).toBe(true)
      expect(result.consecutiveFailures).toBe(6)
    })
  })
})
