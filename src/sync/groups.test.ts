/**
 * Group Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// Mocks
// ============================================================================

const mockGetSyncConfig = vi.fn()
const mockGetDeviceKeys = vi.fn()
const mockQueueMutation = vi.fn()
const mockSaveGroupKey = vi.fn()
const mockGetGroupKey = vi.fn()
const mockSavePerson = vi.fn()
const mockGetSelfPerson = vi.fn()
const mockSavePendingInvite = vi.fn()
const mockGetPendingInvite = vi.fn()
const mockDeletePendingInvite = vi.fn()
const mockGetPendingInvitesByStatus = vi.fn()

const mockGroupsTable = {
  add: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  where: vi.fn(() => ({
    equals: vi.fn(() => ({
      first: vi.fn().mockResolvedValue(null),
    })),
  })),
}

vi.mock('../db', () => ({
  db: {
    groups: mockGroupsTable,
  },
  generateUUID: vi.fn(() => 'test-uuid'),
  now: vi.fn(() => 1700000000000),
  getSyncConfig: () => mockGetSyncConfig(),
  getGroupKey: (uuid: string) => mockGetGroupKey(uuid),
  saveGroupKey: (key: unknown) => mockSaveGroupKey(key),
  getPerson: vi.fn(),
  savePerson: (p: unknown) => mockSavePerson(p),
  deletePerson: vi.fn(),
  getSelfPerson: () => mockGetSelfPerson(),
  getAllPeople: vi.fn().mockResolvedValue([]),
  getPendingInvite: (id: string) => mockGetPendingInvite(id),
  savePendingInvite: (i: unknown) => mockSavePendingInvite(i),
  deletePendingInvite: (id: string) => mockDeletePendingInvite(id),
  getPendingInvitesByStatus: (s: string) => mockGetPendingInvitesByStatus(s),
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
    targetType: 'group',
    operation: { type: 'create' },
    timestamp: Date.now(),
    signedAt: Date.now(),
    authorDevicePublicKey: new Uint8Array(65),
    signature: new Uint8Array(64),
  })),
  serializeMutation: vi.fn(() => '{"test": "mutation"}'),
}))

vi.mock('./crypto', () => ({
  generateSymmetricKey: vi.fn().mockResolvedValue(new Uint8Array(32)),
  bytesToBase64: vi.fn((bytes: Uint8Array) => Buffer.from(bytes).toString('base64')),
  base64ToBytes: vi.fn((str: string) => new Uint8Array(Buffer.from(str, 'base64'))),
  deriveEmojis: vi.fn(() => ['😀', '🎉', '🚀', '💎', '🌟', '🔥']),
  sha256: vi.fn().mockResolvedValue(new Uint8Array(32)),
  generateEd25519KeyPair: vi.fn().mockResolvedValue({
    privateKey: new Uint8Array(32),
    publicKey: new Uint8Array(32),
  }),
}))

// ============================================================================
// Tests
// ============================================================================

describe('Group Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default mocks
    mockGetSyncConfig.mockResolvedValue({ mode: 'synced' })
    mockGetDeviceKeysAsBytes.mockResolvedValue({
      ipnsPrivateKey: new Uint8Array(32),
      ipnsPublicKey: new Uint8Array(32),
      authPrivateKey: new Uint8Array(32),
      authPublicKey: new Uint8Array(65),
      deviceId: 'test-device',
    })
    mockGetSelfPerson.mockResolvedValue({
      uuid: 'self-uuid',
      name: 'Test User',
      devices: [
        {
          deviceId: 'device-1',
          ipnsPublicKey: 'aXBuc0tleQ==',
          authPublicKey: 'YXV0aEtleQ==',
        },
      ],
      isSelf: true,
    })
    mockQueueMutation.mockResolvedValue(1)
    mockSaveGroupKey.mockResolvedValue(undefined)
    mockSavePerson.mockResolvedValue(undefined)
    mockGroupsTable.add.mockResolvedValue('test-uuid')
    mockGroupsTable.get.mockResolvedValue(null)
  })

  describe('generateGroupKey', () => {
    it('should generate a 32-byte key', async () => {
      const { generateGroupKey } = await import('./groups')
      const key = await generateGroupKey()

      expect(key).toBeInstanceOf(Uint8Array)
      expect(key.length).toBe(32)
    })
  })

  describe('storeGroupKey', () => {
    it('should store a group key', async () => {
      const { storeGroupKey } = await import('./groups')
      const key = new Uint8Array(32)

      await storeGroupKey('group-uuid', key)

      expect(mockSaveGroupKey).toHaveBeenCalledWith(
        expect.objectContaining({
          groupUuid: 'group-uuid',
          symmetricKey: expect.any(String),
          createdAt: expect.any(Number),
        })
      )
    })
  })

  describe('createGroup', () => {
    it('should return error when device keys not configured', async () => {
      mockGetDeviceKeysAsBytes.mockResolvedValue(null)

      const { createGroup } = await import('./groups')
      const result = await createGroup('Test Group')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Device keys not configured')
    })

    it('should return error when self person not configured', async () => {
      mockGetSelfPerson.mockResolvedValue(null)

      const { createGroup } = await import('./groups')
      const result = await createGroup('Test Group')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Self person not configured')
    })

    it('should create a group successfully', async () => {
      const { createGroup } = await import('./groups')
      const result = await createGroup('Test Group')

      expect(result.success).toBe(true)
      expect(result.groupUuid).toBe('test-uuid')
      expect(mockSaveGroupKey).toHaveBeenCalled()
      expect(mockGroupsTable.add).toHaveBeenCalled()
      expect(mockQueueMutation).toHaveBeenCalled()
    })
  })

  describe('createPersonalLedger', () => {
    it('should return existing if Personal Ledger already exists', async () => {
      mockGroupsTable.where.mockReturnValue({
        equals: vi.fn(() => ({
          first: vi.fn().mockResolvedValue({ uuid: 'existing-ledger' }),
        })),
      })

      const { createPersonalLedger } = await import('./groups')
      const result = await createPersonalLedger('self-uuid', 'Test User', {
        deviceId: 'device-1',
        ipnsPublicKey: 'key1',
        authPublicKey: 'key2',
      })

      expect(result.success).toBe(true)
      expect(result.groupUuid).toBe('existing-ledger')
    })

    it('should create Personal Ledger if not exists', async () => {
      mockGroupsTable.where.mockReturnValue({
        equals: vi.fn(() => ({
          first: vi.fn().mockResolvedValue(null),
        })),
      })

      const { createPersonalLedger } = await import('./groups')
      const result = await createPersonalLedger('self-uuid', 'Test User', {
        deviceId: 'device-1',
        ipnsPublicKey: 'key1',
        authPublicKey: 'key2',
      })

      expect(result.success).toBe(true)
      expect(mockSaveGroupKey).toHaveBeenCalled()
      expect(mockGroupsTable.add).toHaveBeenCalled()
      expect(mockSavePerson).toHaveBeenCalled()
    })
  })

  describe('generateInviteLink', () => {
    it('should return error when device keys not configured', async () => {
      mockGetDeviceKeysAsBytes.mockResolvedValue(null)

      const { generateInviteLink } = await import('./groups')
      const result = await generateInviteLink('group-uuid')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Device keys not configured')
    })

    it('should return error when group not found', async () => {
      mockGroupsTable.get.mockResolvedValue(null)

      const { generateInviteLink } = await import('./groups')
      const result = await generateInviteLink('non-existent')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Group not found')
    })

    it('should generate invite link successfully', async () => {
      mockGroupsTable.get.mockResolvedValue({
        uuid: 'group-uuid',
        name: 'Test Group',
      })

      const { generateInviteLink } = await import('./groups')
      const result = await generateInviteLink('group-uuid')

      expect(result.success).toBe(true)
      expect(result.inviteLink).toBeDefined()
      expect(result.inviteId).toBeDefined()
      expect(mockSavePendingInvite).toHaveBeenCalled()
    })
  })

  describe('parseInviteLink', () => {
    it('should parse a valid invite link', async () => {
      const { generateInviteLink, parseInviteLink } = await import('./groups')

      mockGroupsTable.get.mockResolvedValue({
        uuid: 'group-uuid',
        name: 'Test Group',
      })

      const generated = await generateInviteLink('group-uuid')
      if (!generated.inviteLink) throw new Error('No invite link')

      const parsed = parseInviteLink(generated.inviteLink)

      expect(parsed).not.toBeNull()
      expect(parsed?.groupUuid).toBe('group-uuid')
      expect(parsed?.groupName).toBe('Test Group')
    })

    it('should return null for invalid link', async () => {
      const { parseInviteLink } = await import('./groups')

      const parsed = parseInviteLink('invalid-base64!')
      expect(parsed).toBeNull()
    })
  })

  describe('removeMember', () => {
    it('should return error when device keys not configured', async () => {
      mockGetDeviceKeysAsBytes.mockResolvedValue(null)

      const { removeMember } = await import('./groups')
      const result = await removeMember('group-uuid', 'person-uuid')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Device keys not configured')
    })

    it('should not allow removing self', async () => {
      const { removeMember } = await import('./groups')
      const result = await removeMember('group-uuid', 'self-uuid')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Cannot remove yourself')
    })

    it('should remove member and rotate key', async () => {
      mockGroupsTable.get.mockResolvedValue({
        uuid: 'group-uuid',
        name: 'Test Group',
        members: ['self-uuid', 'other-uuid'],
      })
      mockGetGroupKey.mockResolvedValue({
        groupUuid: 'group-uuid',
        symmetricKey: 'base64key',
        createdAt: 1700000000000,
      })

      const { removeMember } = await import('./groups')
      const result = await removeMember('group-uuid', 'other-uuid')

      expect(result.success).toBe(true)
      expect(mockQueueMutation).toHaveBeenCalled()
      expect(mockGroupsTable.update).toHaveBeenCalled()
      expect(mockSaveGroupKey).toHaveBeenCalled() // Key rotation
    })
  })

  describe('exitGroup', () => {
    it('should return error when device keys not configured', async () => {
      mockGetDeviceKeysAsBytes.mockResolvedValue(null)

      const { exitGroup } = await import('./groups')
      const result = await exitGroup('group-uuid')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Device keys not configured')
    })

    it('should not allow exiting Personal Ledger', async () => {
      mockGroupsTable.get.mockResolvedValue({
        uuid: 'group-uuid',
        name: 'Personal Ledger',
      })

      const { exitGroup } = await import('./groups')
      const result = await exitGroup('group-uuid')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Cannot exit Personal Ledger')
    })

    it('should exit group successfully', async () => {
      mockGroupsTable.get.mockResolvedValue({
        uuid: 'group-uuid',
        name: 'Test Group',
      })

      const { exitGroup } = await import('./groups')
      const result = await exitGroup('group-uuid')

      expect(result.success).toBe(true)
      expect(mockQueueMutation).toHaveBeenCalled()
    })
  })

  describe('getPendingInvitesToPoll', () => {
    it('should return pending invites', async () => {
      mockGetPendingInvitesByStatus.mockResolvedValue([
        { id: 'invite-1', status: 'pending' },
        { id: 'invite-2', status: 'pending' },
      ])

      const { getPendingInvitesToPoll } = await import('./groups')
      const invites = await getPendingInvitesToPoll()

      expect(invites).toHaveLength(2)
      expect(mockGetPendingInvitesByStatus).toHaveBeenCalledWith('pending')
    })
  })

  describe('getRespondedInvites', () => {
    it('should return responded invites', async () => {
      mockGetPendingInvitesByStatus.mockResolvedValue([{ id: 'invite-1', status: 'responded' }])

      const { getRespondedInvites } = await import('./groups')
      const invites = await getRespondedInvites()

      expect(invites).toHaveLength(1)
      expect(mockGetPendingInvitesByStatus).toHaveBeenCalledWith('responded')
    })
  })

  describe('cancelInvite', () => {
    it('should delete pending invite', async () => {
      mockDeletePendingInvite.mockResolvedValue(undefined)

      const { cancelInvite } = await import('./groups')
      await cancelInvite('invite-1')

      expect(mockDeletePendingInvite).toHaveBeenCalledWith('invite-1')
    })
  })
})
