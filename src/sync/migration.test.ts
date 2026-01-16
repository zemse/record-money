/**
 * Solo Data Migration Tests
 *
 * Tests for migrating solo data to sync-compatible format.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateP256KeyPair, generateEd25519KeyPair, bytesToBase64 } from './crypto'

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
    deviceId: 'test-device-id',
  }
}

const mockUsers = [
  { email: 'alice@example.com', alias: 'Alice' },
  { email: 'bob@example.com', alias: 'Bob' },
]

const mockRecords = [
  {
    uuid: 'record-1',
    title: 'Lunch',
    description: '',
    category: 'Food',
    amount: 100,
    currency: 'INR',
    date: '2024-01-15',
    time: '12:00',
    icon: '🍕',
    paidBy: [{ email: 'alice@example.com', share: 100 }],
    paidFor: [
      { email: 'alice@example.com', share: 50 },
      { email: 'bob@example.com', share: 50 },
    ],
    shareType: 'equal' as const,
    groupId: 'group-1',
    comments: '',
    createdAt: Date.now() - 1000,
    updatedAt: Date.now() - 1000,
  },
]

const mockGroups = [
  {
    uuid: 'group-1',
    name: 'Trip',
    members: ['alice@example.com', 'bob@example.com'],
    createdAt: Date.now() - 2000,
    updatedAt: Date.now() - 2000,
  },
]

// ============================================================================
// Mocks
// ============================================================================

// Store mock functions that we can control
const mockDbUsers = {
  toArray: vi.fn(),
  count: vi.fn(),
}

const mockDbRecords = {
  toArray: vi.fn(),
  count: vi.fn(),
}

const mockDbGroups = {
  filter: vi.fn(() => ({
    toArray: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  })),
}

const mockDbSettings = {
  get: vi.fn(),
}

const mockGetSyncConfig = vi.fn()
const mockUpdateSyncConfig = vi.fn()
const mockQueueMutation = vi.fn()
const mockGetDeviceKeysAsBytes = vi.fn()

// Mock the db module
vi.mock('../db', () => ({
  db: {
    users: mockDbUsers,
    records: mockDbRecords,
    groups: mockDbGroups,
    settings: mockDbSettings,
  },
  generateUUID: () => `uuid-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  getSyncConfig: () => mockGetSyncConfig(),
  updateSyncConfig: (updates: unknown) => mockUpdateSyncConfig(updates),
  queueMutation: (mutation: string) => mockQueueMutation(mutation),
}))

// Mock device setup
vi.mock('./device-setup', () => ({
  getDeviceKeysAsBytes: () => mockGetDeviceKeysAsBytes(),
}))

// ============================================================================
// Tests
// ============================================================================

describe('Migration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  describe('needsMigration', () => {
    it('should return false if already migrated', async () => {
      mockGetSyncConfig.mockResolvedValue({
        key: 'sync-config',
        mode: 'synced',
        migrated: true,
      })

      const { needsMigration } = await import('./migration')
      const result = await needsMigration()

      expect(result).toBe(false)
    })

    it('should return true if not migrated and has data', async () => {
      mockGetSyncConfig.mockResolvedValue({
        key: 'sync-config',
        mode: 'solo',
        migrated: false,
      })
      mockDbUsers.count.mockResolvedValue(2)
      mockDbRecords.count.mockResolvedValue(5)

      const { needsMigration } = await import('./migration')
      const result = await needsMigration()

      expect(result).toBe(true)
    })

    it('should return false if not migrated but no data', async () => {
      mockGetSyncConfig.mockResolvedValue({
        key: 'sync-config',
        mode: 'solo',
        migrated: false,
      })
      mockDbUsers.count.mockResolvedValue(0)
      mockDbRecords.count.mockResolvedValue(0)

      const { needsMigration } = await import('./migration')
      const result = await needsMigration()

      expect(result).toBe(false)
    })
  })

  describe('getMigrationStats', () => {
    it('should return correct stats', async () => {
      mockGetSyncConfig.mockResolvedValue({
        key: 'sync-config',
        mode: 'solo',
        migrated: false,
      })
      mockDbUsers.count.mockResolvedValue(2)
      mockDbRecords.count.mockResolvedValue(5)
      mockDbGroups.filter.mockReturnValue({
        count: vi.fn().mockResolvedValue(1),
        toArray: vi.fn(),
      })

      const { getMigrationStats } = await import('./migration')
      const stats = await getMigrationStats()

      expect(stats.users).toBe(2)
      expect(stats.records).toBe(5)
      expect(stats.groups).toBe(1)
      expect(stats.isMigrated).toBe(false)
    })
  })

  describe('migrateSoloData', () => {
    it('should skip if already migrated', async () => {
      mockGetSyncConfig.mockResolvedValue({
        key: 'sync-config',
        mode: 'synced',
        migrated: true,
      })

      const { migrateSoloData } = await import('./migration')
      const result = await migrateSoloData()

      expect(result.success).toBe(true)
      expect(result.stats?.mutations).toBe(0)
      expect(mockQueueMutation).not.toHaveBeenCalled()
    })

    it('should fail if no device keys', async () => {
      mockGetSyncConfig.mockResolvedValue({
        key: 'sync-config',
        mode: 'solo',
        migrated: false,
      })
      mockGetDeviceKeysAsBytes.mockResolvedValue(null)

      const { migrateSoloData } = await import('./migration')
      const result = await migrateSoloData()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Device keys not found')
    })

    it('should migrate users, records, and groups', async () => {
      const mockKeys = createMockDeviceKeys()

      mockGetSyncConfig.mockResolvedValue({
        key: 'sync-config',
        mode: 'solo',
        migrated: false,
      })
      mockGetDeviceKeysAsBytes.mockResolvedValue(mockKeys)
      mockDbUsers.toArray.mockResolvedValue(mockUsers)
      mockDbRecords.toArray.mockResolvedValue(mockRecords)
      mockDbGroups.filter.mockReturnValue({
        toArray: vi.fn().mockResolvedValue(mockGroups),
        count: vi.fn(),
      })
      mockDbSettings.get.mockResolvedValue({
        key: 'main',
        currentUserEmail: 'alice@example.com',
        lastUsedCurrency: 'INR',
        defaultDisplayCurrency: 'INR',
        theme: 'system',
        autoApplyAiChanges: false,
        enableAiMemory: true,
      })
      mockQueueMutation.mockResolvedValue(1)
      mockUpdateSyncConfig.mockResolvedValue(undefined)

      const { migrateSoloData } = await import('./migration')
      const progressCalls: unknown[] = []
      const result = await migrateSoloData((progress) => progressCalls.push(progress))

      expect(result.success).toBe(true)
      expect(result.stats?.persons).toBe(2) // 2 users
      expect(result.stats?.records).toBe(1)
      expect(result.stats?.groups).toBe(1)

      // Should create mutations for users, records, and groups
      // 2 persons + 1 record + 1 group = 4 mutations
      expect(mockQueueMutation).toHaveBeenCalledTimes(4)

      // Should update sync config
      expect(mockUpdateSyncConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          migrated: true,
          selfPersonUuid: expect.any(String),
        })
      )

      // Should report progress
      expect((progressCalls[0] as any).stage).toBe('preparing')
      expect((progressCalls[progressCalls.length - 1] as any).stage).toBe('complete')
    })

    it('should create placeholder persons for unknown emails in records', async () => {
      const mockKeys = createMockDeviceKeys()

      const recordWithUnknownEmail = {
        ...mockRecords[0],
        paidBy: [{ email: 'unknown@example.com', share: 100 }],
        paidFor: [{ email: 'unknown@example.com', share: 100 }],
      }

      mockGetSyncConfig.mockResolvedValue({
        key: 'sync-config',
        mode: 'solo',
        migrated: false,
      })
      mockGetDeviceKeysAsBytes.mockResolvedValue(mockKeys)
      mockDbUsers.toArray.mockResolvedValue([]) // No users
      mockDbRecords.toArray.mockResolvedValue([recordWithUnknownEmail])
      mockDbGroups.filter.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
        count: vi.fn(),
      })
      mockDbSettings.get.mockResolvedValue(undefined)
      mockQueueMutation.mockResolvedValue(1)
      mockUpdateSyncConfig.mockResolvedValue(undefined)

      const { migrateSoloData } = await import('./migration')
      const result = await migrateSoloData()

      expect(result.success).toBe(true)
      // 1 placeholder person (unknown@example.com) + 1 record = 2 mutations
      expect(mockQueueMutation).toHaveBeenCalledTimes(2)

      // Check that the mutation for person has isPlaceholder: true
      const personMutationCall = mockQueueMutation.mock.calls[0][0]
      const personMutation = JSON.parse(personMutationCall)
      expect(personMutation.operation.data.isPlaceholder).toBe(true)
    })

    it('should identify self person correctly', async () => {
      const mockKeys = createMockDeviceKeys()

      mockGetSyncConfig.mockResolvedValue({
        key: 'sync-config',
        mode: 'solo',
        migrated: false,
      })
      mockGetDeviceKeysAsBytes.mockResolvedValue(mockKeys)
      mockDbUsers.toArray.mockResolvedValue(mockUsers)
      mockDbRecords.toArray.mockResolvedValue([])
      mockDbGroups.filter.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
        count: vi.fn(),
      })
      mockDbSettings.get.mockResolvedValue({
        key: 'main',
        currentUserEmail: 'alice@example.com',
        lastUsedCurrency: 'INR',
        defaultDisplayCurrency: 'INR',
        theme: 'system',
        autoApplyAiChanges: false,
        enableAiMemory: true,
      })
      mockQueueMutation.mockResolvedValue(1)
      mockUpdateSyncConfig.mockResolvedValue(undefined)

      const { migrateSoloData } = await import('./migration')
      const result = await migrateSoloData()

      expect(result.success).toBe(true)

      // Check that Alice is marked as self
      const aliceMutationCall = mockQueueMutation.mock.calls[0][0]
      const aliceMutation = JSON.parse(aliceMutationCall)
      expect(aliceMutation.operation.data.isSelf).toBe(true)

      // Check that Bob is not marked as self
      const bobMutationCall = mockQueueMutation.mock.calls[1][0]
      const bobMutation = JSON.parse(bobMutationCall)
      expect(bobMutation.operation.data.isSelf).toBeFalsy()
    })

    it('should sign mutations correctly', async () => {
      const mockKeys = createMockDeviceKeys()

      mockGetSyncConfig.mockResolvedValue({
        key: 'sync-config',
        mode: 'solo',
        migrated: false,
      })
      mockGetDeviceKeysAsBytes.mockResolvedValue(mockKeys)
      mockDbUsers.toArray.mockResolvedValue([mockUsers[0]])
      mockDbRecords.toArray.mockResolvedValue([])
      mockDbGroups.filter.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
        count: vi.fn(),
      })
      mockDbSettings.get.mockResolvedValue(undefined)
      mockQueueMutation.mockResolvedValue(1)
      mockUpdateSyncConfig.mockResolvedValue(undefined)

      const { migrateSoloData } = await import('./migration')
      await migrateSoloData()

      const mutationCall = mockQueueMutation.mock.calls[0][0]
      const mutation = JSON.parse(mutationCall)

      // Mutation should have all required fields
      expect(mutation.version).toBe(1)
      expect(mutation.uuid).toBeDefined()
      expect(mutation.id).toBe(1)
      expect(mutation.targetType).toBe('person')
      expect(mutation.operation.type).toBe('create')
      expect(mutation.timestamp).toBeDefined()
      expect(mutation.signedAt).toBeDefined()
      expect(mutation.authorDevicePublicKey).toBeDefined()
      expect(mutation.signature).toBeDefined()

      // Verify signature and public key are serialized as typed Uint8Array
      // The serializeMutation uses {__type: 'Uint8Array', data: base64} format
      expect(mutation.signature.__type).toBe('Uint8Array')
      expect(mutation.signature.data).toBeDefined()
      expect(mutation.authorDevicePublicKey.__type).toBe('Uint8Array')
      expect(mutation.authorDevicePublicKey.data).toBeDefined()

      // Verify the base64 data is valid
      expect(() => atob(mutation.signature.data)).not.toThrow()
      expect(() => atob(mutation.authorDevicePublicKey.data)).not.toThrow()
    })
  })
})
