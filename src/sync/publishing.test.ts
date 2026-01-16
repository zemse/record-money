/**
 * Publishing Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// Mocks
// ============================================================================

const mockGetSyncConfig = vi.fn()
const mockGetDeviceKeys = vi.fn()
const mockQueueMutation = vi.fn()
const mockGetPendingMutations = vi.fn()
const mockMarkMutationsPublished = vi.fn()
const mockGetNextMutationId = vi.fn()

const mockRecordsTable = {
  add: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}

vi.mock('../db', () => ({
  db: {
    records: mockRecordsTable,
  },
  generateUUID: vi.fn(() => 'test-uuid'),
  getSyncConfig: () => mockGetSyncConfig(),
  getDeviceKeys: () => mockGetDeviceKeys(),
  queueMutation: (m: string) => mockQueueMutation(m),
  getPendingMutations: () => mockGetPendingMutations(),
  markMutationsPublished: (ids: number[]) => mockMarkMutationsPublished(ids),
  getNextMutationId: () => mockGetNextMutationId(),
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
    targetType: 'record',
    operation: { type: 'create' },
    timestamp: Date.now(),
    signedAt: Date.now(),
    authorDevicePublicKey: new Uint8Array(65),
    signature: new Uint8Array(64),
  })),
  serializeMutation: vi.fn(() => '{"test": "mutation"}'),
  deserializeMutation: vi.fn((json) => JSON.parse(json)),
}))

vi.mock('./schemas', () => ({
  createDeviceManifest: vi.fn().mockResolvedValue({
    databaseCid: 'db-cid',
    latestMutationId: 'encrypted',
    chunkIndex: 'encrypted',
    deviceRingCid: 'ring-cid',
    peerDirectoryCid: 'peer-cid',
  }),
  serializeDeviceManifest: vi.fn(() => new Uint8Array()),
  createEncryptedDeviceRing: vi.fn().mockResolvedValue(new Uint8Array()),
  createEncryptedMutationChunk: vi.fn().mockResolvedValue(new Uint8Array()),
  createMutationChunk: vi.fn((start, end, cid) => ({ startId: start, endId: end, cid })),
  deserializeDeviceManifest: vi.fn(),
  decryptDeviceManifest: vi.fn(),
}))

vi.mock('./crypto', () => ({
  base64ToBytes: vi.fn(() => new Uint8Array(32)),
  bytesToBase64: vi.fn(() => 'base64string'),
}))

// ============================================================================
// Tests
// ============================================================================

describe('Publishing Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default mocks
    mockGetSyncConfig.mockResolvedValue({ mode: 'solo' })
    mockGetDeviceKeysAsBytes.mockResolvedValue({
      ipnsPrivateKey: new Uint8Array(32),
      ipnsPublicKey: new Uint8Array(32),
      authPrivateKey: new Uint8Array(32),
      authPublicKey: new Uint8Array(65),
      deviceId: 'test-device',
    })
    mockGetNextMutationId.mockResolvedValue(1)
    mockQueueMutation.mockResolvedValue(1)
    mockGetPendingMutations.mockResolvedValue([])
  })

  describe('isSyncEnabled', () => {
    it('should return false when mode is solo', async () => {
      mockGetSyncConfig.mockResolvedValue({ mode: 'solo' })

      const { isSyncEnabled } = await import('./publishing')
      const result = await isSyncEnabled()

      expect(result).toBe(false)
    })

    it('should return true when mode is synced', async () => {
      mockGetSyncConfig.mockResolvedValue({ mode: 'synced' })

      const { isSyncEnabled } = await import('./publishing')
      const result = await isSyncEnabled()

      expect(result).toBe(true)
    })
  })

  describe('createRecordMutation', () => {
    it('should not create mutation when sync is disabled', async () => {
      mockGetSyncConfig.mockResolvedValue({ mode: 'solo' })

      const { createRecordMutation } = await import('./publishing')
      await createRecordMutation({
        uuid: 'record-1',
        title: 'Test',
        description: '',
        category: 'Food',
        amount: 100,
        currency: 'USD',
        date: '2024-01-01',
        time: '12:00',
        icon: '🍕',
        paidBy: [],
        paidFor: [],
        shareType: 'equal',
        groupId: null,
        comments: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })

      expect(mockQueueMutation).not.toHaveBeenCalled()
    })

    it('should create and queue mutation when sync is enabled', async () => {
      mockGetSyncConfig.mockResolvedValue({ mode: 'synced' })

      const { createRecordMutation } = await import('./publishing')
      await createRecordMutation({
        uuid: 'record-1',
        title: 'Test',
        description: '',
        category: 'Food',
        amount: 100,
        currency: 'USD',
        date: '2024-01-01',
        time: '12:00',
        icon: '🍕',
        paidBy: [],
        paidFor: [],
        shareType: 'equal',
        groupId: null,
        comments: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })

      expect(mockQueueMutation).toHaveBeenCalled()
    })
  })

  describe('updateRecordMutation', () => {
    it('should not create mutation for no changes', async () => {
      mockGetSyncConfig.mockResolvedValue({ mode: 'synced' })

      const oldRecord = {
        uuid: 'record-1',
        title: 'Test',
        description: '',
        category: 'Food',
        amount: 100,
        currency: 'USD',
        date: '2024-01-01',
        time: '12:00',
        icon: '🍕',
        paidBy: [],
        paidFor: [],
        shareType: 'equal' as const,
        groupId: null,
        comments: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      const { updateRecordMutation } = await import('./publishing')
      await updateRecordMutation('record-1', oldRecord, {})

      expect(mockQueueMutation).not.toHaveBeenCalled()
    })

    it('should create mutation for field changes', async () => {
      mockGetSyncConfig.mockResolvedValue({ mode: 'synced' })

      const oldRecord = {
        uuid: 'record-1',
        title: 'Test',
        description: '',
        category: 'Food',
        amount: 100,
        currency: 'USD',
        date: '2024-01-01',
        time: '12:00',
        icon: '🍕',
        paidBy: [],
        paidFor: [],
        shareType: 'equal' as const,
        groupId: null,
        comments: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      const { updateRecordMutation } = await import('./publishing')
      await updateRecordMutation('record-1', oldRecord, { amount: 200 })

      expect(mockQueueMutation).toHaveBeenCalled()
    })
  })

  describe('deleteRecordMutation', () => {
    it('should create delete mutation when sync is enabled', async () => {
      mockGetSyncConfig.mockResolvedValue({ mode: 'synced' })

      const { deleteRecordMutation } = await import('./publishing')
      await deleteRecordMutation('record-1')

      expect(mockQueueMutation).toHaveBeenCalled()
    })
  })

  describe('publishPendingMutations', () => {
    it('should return success with 0 count when no pending mutations', async () => {
      mockGetPendingMutations.mockResolvedValue([])

      const { publishPendingMutations } = await import('./publishing')
      const result = await publishPendingMutations()

      expect(result.success).toBe(true)
      expect(result.mutationCount).toBe(0)
    })

    it('should return error when no provider configured', async () => {
      mockGetPendingMutations.mockResolvedValue([{ id: 1, mutationJson: '{}' }])
      mockGetConfiguredProvider.mockResolvedValue(null)

      const { publishPendingMutations } = await import('./publishing')
      const result = await publishPendingMutations()

      expect(result.success).toBe(false)
      expect(result.error).toBe('No provider configured')
    })

    it('should return error when sync keys not configured', async () => {
      mockGetPendingMutations.mockResolvedValue([{ id: 1, mutationJson: '{}' }])
      mockGetConfiguredProvider.mockResolvedValue({ type: 'pinata' })
      mockGetSyncConfig.mockResolvedValue({ mode: 'synced' })

      const { publishPendingMutations } = await import('./publishing')
      const result = await publishPendingMutations()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Sync keys not configured')
    })
  })

  describe('CRUD Wrappers', () => {
    describe('addRecord', () => {
      it('should add record to db and create mutation', async () => {
        mockGetSyncConfig.mockResolvedValue({ mode: 'synced' })
        mockRecordsTable.add.mockResolvedValue('record-1')

        const { addRecord } = await import('./publishing')
        const record = {
          uuid: 'record-1',
          title: 'Test',
          description: '',
          category: 'Food',
          amount: 100,
          currency: 'USD',
          date: '2024-01-01',
          time: '12:00',
          icon: '🍕',
          paidBy: [],
          paidFor: [],
          shareType: 'equal' as const,
          groupId: null,
          comments: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }

        await addRecord(record)

        expect(mockRecordsTable.add).toHaveBeenCalledWith(record)
        expect(mockQueueMutation).toHaveBeenCalled()
      })
    })

    describe('updateRecord', () => {
      it('should update record in db and create mutation', async () => {
        mockGetSyncConfig.mockResolvedValue({ mode: 'synced' })
        mockRecordsTable.get.mockResolvedValue({
          uuid: 'record-1',
          title: 'Old Title',
          description: '',
          category: 'Food',
          amount: 100,
          currency: 'USD',
          date: '2024-01-01',
          time: '12:00',
          icon: '🍕',
          paidBy: [],
          paidFor: [],
          shareType: 'equal',
          groupId: null,
          comments: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        mockRecordsTable.update.mockResolvedValue(1)

        const { updateRecord } = await import('./publishing')
        await updateRecord('record-1', { title: 'New Title' })

        expect(mockRecordsTable.update).toHaveBeenCalledWith('record-1', { title: 'New Title' })
        expect(mockQueueMutation).toHaveBeenCalled()
      })

      it('should throw error if record not found', async () => {
        mockRecordsTable.get.mockResolvedValue(undefined)

        const { updateRecord } = await import('./publishing')

        await expect(updateRecord('non-existent', { title: 'Test' })).rejects.toThrow(
          'Record not found'
        )
      })
    })

    describe('deleteRecord', () => {
      it('should delete record from db and create mutation', async () => {
        mockGetSyncConfig.mockResolvedValue({ mode: 'synced' })
        mockRecordsTable.delete.mockResolvedValue(undefined)

        const { deleteRecord } = await import('./publishing')
        await deleteRecord('record-1')

        expect(mockRecordsTable.delete).toHaveBeenCalledWith('record-1')
        expect(mockQueueMutation).toHaveBeenCalled()
      })
    })
  })

  describe('getPendingMutationCount', () => {
    it('should return count of pending mutations', async () => {
      mockGetPendingMutations.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }])

      const { getPendingMutationCount } = await import('./publishing')
      const count = await getPendingMutationCount()

      expect(count).toBe(3)
    })
  })
})
