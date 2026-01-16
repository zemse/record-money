/**
 * Conflict Resolution Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// Mocks
// ============================================================================

const mockConflictsTable = {
  add: vi.fn(),
  get: vi.fn(),
  where: vi.fn(() => ({
    equals: vi.fn(() => ({
      toArray: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    })),
  })),
  update: vi.fn(),
}

vi.mock('../db', () => ({
  db: {
    table: vi.fn(() => mockConflictsTable),
  },
  generateUUID: vi.fn(() => 'test-uuid-123'),
  queueMutation: vi.fn().mockResolvedValue(1),
  getDeviceKeys: vi.fn().mockResolvedValue({
    authPrivateKey: 'dGVzdC1wcml2YXRlLWtleQ==',
    authPublicKey: 'dGVzdC1wdWJsaWMta2V5',
  }),
}))

vi.mock('./mutations', () => ({
  createSignedMutation: vi.fn(() => ({
    uuid: 'mutation-uuid',
    id: 1,
    targetUuid: 'target-uuid',
    targetType: 'record',
    operation: { type: 'resolve_conflict' },
    timestamp: Date.now(),
    signedAt: Date.now(),
    authorDevicePublicKey: new Uint8Array(),
    signature: new Uint8Array(),
  })),
  serializeMutation: vi.fn(() => '{"test": "mutation"}'),
}))

vi.mock('./crypto', () => ({
  base64ToBytes: vi.fn(() => new Uint8Array(32)),
}))

// ============================================================================
// Tests
// ============================================================================

describe('Conflict Resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getConflictDescription', () => {
    it('should describe field conflicts', async () => {
      const { getConflictDescription } = await import('./conflicts')

      const conflict = {
        id: 'conflict-1',
        type: 'field' as const,
        targetUuid: 'record-1',
        targetType: 'record' as const,
        field: 'amount',
        options: [
          { mutationUuid: 'mut-1', deviceId: 'dev-1', value: 100, timestamp: Date.now() },
          { mutationUuid: 'mut-2', deviceId: 'dev-2', value: 200, timestamp: Date.now() },
        ],
        detectedAt: Date.now(),
        status: 'pending' as const,
      }

      const description = getConflictDescription(conflict)
      expect(description).toContain('amount')
      expect(description).toContain('2 devices')
    })

    it('should describe delete vs update conflicts', async () => {
      const { getConflictDescription } = await import('./conflicts')

      const conflict = {
        id: 'conflict-1',
        type: 'delete_vs_update' as const,
        targetUuid: 'record-1',
        targetType: 'record' as const,
        options: [
          { mutationUuid: 'mut-1', deviceId: 'dev-1', value: 'delete', timestamp: Date.now() },
          {
            mutationUuid: 'mut-2',
            deviceId: 'dev-2',
            value: { amount: 100 },
            timestamp: Date.now(),
          },
        ],
        detectedAt: Date.now(),
        status: 'pending' as const,
      }

      const description = getConflictDescription(conflict)
      expect(description).toContain('deleted')
      expect(description).toContain('updated')
    })
  })

  describe('formatOptionValue', () => {
    it('should format null values', async () => {
      const { formatOptionValue } = await import('./conflicts')
      expect(formatOptionValue(null)).toBe('(empty)')
      expect(formatOptionValue(undefined)).toBe('(empty)')
    })

    it('should format delete value', async () => {
      const { formatOptionValue } = await import('./conflicts')
      expect(formatOptionValue('delete')).toBe('Delete')
    })

    it('should format objects as JSON', async () => {
      const { formatOptionValue } = await import('./conflicts')
      expect(formatOptionValue({ amount: 100 })).toBe('{"amount":100}')
    })

    it('should format primitives as strings', async () => {
      const { formatOptionValue } = await import('./conflicts')
      expect(formatOptionValue(100)).toBe('100')
      expect(formatOptionValue('hello')).toBe('hello')
    })
  })

  describe('getRelativeTime', () => {
    it('should return "just now" for recent times', async () => {
      const { getRelativeTime } = await import('./conflicts')
      const now = Date.now()
      expect(getRelativeTime(now)).toBe('just now')
      expect(getRelativeTime(now - 30000)).toBe('just now')
    })

    it('should return minutes for times under an hour', async () => {
      const { getRelativeTime } = await import('./conflicts')
      const now = Date.now()
      expect(getRelativeTime(now - 5 * 60 * 1000)).toBe('5m ago')
      expect(getRelativeTime(now - 30 * 60 * 1000)).toBe('30m ago')
    })

    it('should return hours for times under a day', async () => {
      const { getRelativeTime } = await import('./conflicts')
      const now = Date.now()
      expect(getRelativeTime(now - 2 * 60 * 60 * 1000)).toBe('2h ago')
      expect(getRelativeTime(now - 12 * 60 * 60 * 1000)).toBe('12h ago')
    })

    it('should return days for times under a week', async () => {
      const { getRelativeTime } = await import('./conflicts')
      const now = Date.now()
      expect(getRelativeTime(now - 2 * 24 * 60 * 60 * 1000)).toBe('2d ago')
    })
  })

  describe('createConflictFromDetection', () => {
    it('should create a field conflict', async () => {
      const { createConflictFromDetection } = await import('./conflicts')

      const conflict = createConflictFromDetection({
        targetUuid: 'record-1',
        targetType: 'record',
        field: 'amount',
        localMutationUuid: 'mut-1',
        localValue: 100,
        localDeviceId: 'dev-1',
        remoteMutationUuid: 'mut-2',
        remoteValue: 200,
        remoteDeviceId: 'dev-2',
      })

      expect(conflict.type).toBe('field')
      expect(conflict.field).toBe('amount')
      expect(conflict.options).toHaveLength(2)
      expect(conflict.options[0].value).toBe(100)
      expect(conflict.options[1].value).toBe(200)
    })

    it('should create a delete_vs_update conflict', async () => {
      const { createConflictFromDetection } = await import('./conflicts')

      const conflict = createConflictFromDetection({
        targetUuid: 'record-1',
        targetType: 'record',
        field: '_entity',
        localMutationUuid: 'mut-1',
        localValue: 'delete',
        localDeviceId: 'dev-1',
        remoteMutationUuid: 'mut-2',
        remoteValue: { amount: 100 },
        remoteDeviceId: 'dev-2',
      })

      expect(conflict.type).toBe('delete_vs_update')
    })
  })

  describe('storeConflict', () => {
    it('should store a conflict and return its ID', async () => {
      mockConflictsTable.add.mockResolvedValue('test-uuid-123')

      const { storeConflict } = await import('./conflicts')

      const id = await storeConflict({
        type: 'field',
        targetUuid: 'record-1',
        targetType: 'record',
        field: 'amount',
        options: [],
        detectedAt: Date.now(),
      })

      expect(id).toBe('test-uuid-123')
      expect(mockConflictsTable.add).toHaveBeenCalled()
    })
  })

  describe('getPendingConflicts', () => {
    it('should return empty array when no conflicts', async () => {
      const { getPendingConflicts } = await import('./conflicts')
      const conflicts = await getPendingConflicts()
      expect(conflicts).toEqual([])
    })

    it('should return pending conflicts', async () => {
      const mockConflicts = [
        { id: 'c1', status: 'pending' },
        { id: 'c2', status: 'pending' },
      ]
      mockConflictsTable.where.mockReturnValue({
        equals: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue(mockConflicts),
          count: vi.fn().mockResolvedValue(2),
        })),
      })

      const { getPendingConflicts } = await import('./conflicts')
      const conflicts = await getPendingConflicts()
      expect(conflicts).toEqual(mockConflicts)
    })
  })

  describe('resolveConflict', () => {
    it('should fail if conflict not found', async () => {
      mockConflictsTable.get.mockResolvedValue(undefined)

      const { resolveConflict } = await import('./conflicts')
      const result = await resolveConflict('non-existent', 'mut-1')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Conflict not found')
    })

    it('should fail if conflict already resolved', async () => {
      mockConflictsTable.get.mockResolvedValue({
        id: 'c1',
        status: 'resolved',
        options: [{ mutationUuid: 'mut-1' }],
      })

      const { resolveConflict } = await import('./conflicts')
      const result = await resolveConflict('c1', 'mut-1')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Conflict already resolved')
    })

    it('should fail if winner is not valid', async () => {
      mockConflictsTable.get.mockResolvedValue({
        id: 'c1',
        status: 'pending',
        options: [{ mutationUuid: 'mut-1' }, { mutationUuid: 'mut-2' }],
      })

      const { resolveConflict } = await import('./conflicts')
      const result = await resolveConflict('c1', 'invalid-mut')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid winner selection')
    })
  })
})
