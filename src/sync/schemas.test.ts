/**
 * Schema Tests
 *
 * Tests for serialization, deserialization, and encryption of sync data structures.
 */

import { describe, it, expect } from 'vitest'
import { generateP256KeyPair, generateSymmetricKey, bytesToBase64 } from './crypto'
import {
  // DeviceManifest
  createDeviceManifest,
  serializeDeviceManifest,
  deserializeDeviceManifest,
  decryptDeviceManifest,
  isValidDeviceManifest,
  // DeviceRing
  createEncryptedDeviceRing,
  decryptDeviceRing,
  createDeviceRingEntry,
  isValidDeviceRing,
  // PeerDirectory
  createPeerDirectoryEntry,
  decryptPeerDirectoryEntry,
  createSerializedPeerDirectory,
  serializePeerDirectory,
  deserializePeerDirectory,
  findAndDecryptPeerDirectoryEntry,
  isValidPeerDirectoryPayload,
  // GroupManifest
  createEncryptedGroupManifest,
  decryptGroupManifest,
  createGroupManifest,
  isValidGroupManifest,
  // MutationChunks
  createEncryptedMutationChunk,
  decryptMutationChunk,
  findChunksToSync,
  createMutationChunk,
  // Database
  createEncryptedDatabase,
  decryptDatabase,
} from './schemas'
import type {
  DeviceRing,
  PeerDirectoryPayload,
  GroupManifest,
  MutationChunks,
  Mutation,
} from './types'

// ============================================================================
// DeviceManifest Tests
// ============================================================================

describe('DeviceManifest', () => {
  it('should create and decrypt DeviceManifest', async () => {
    const personalKey = generateSymmetricKey()
    const chunkIndex: MutationChunks = [
      { startId: 1, endId: 100, cid: 'QmChunk1' },
      { startId: 101, endId: 200, cid: 'QmChunk2' },
    ]

    const manifest = await createDeviceManifest({
      databaseCid: 'QmDatabase123',
      latestMutationId: 150,
      chunkIndex,
      deviceRingCid: 'QmDeviceRing456',
      peerDirectoryCid: 'QmPeerDir789',
      personalKey,
    })

    expect(manifest.databaseCid).toBe('QmDatabase123')
    expect(manifest.deviceRingCid).toBe('QmDeviceRing456')
    expect(manifest.peerDirectoryCid).toBe('QmPeerDir789')

    // Decrypt and verify
    const decrypted = await decryptDeviceManifest(manifest, personalKey)
    expect(decrypted.latestMutationId).toBe(150)
    expect(decrypted.chunkIndex).toEqual(chunkIndex)
  })

  it('should serialize and deserialize DeviceManifest', async () => {
    const personalKey = generateSymmetricKey()
    const manifest = await createDeviceManifest({
      databaseCid: 'QmTest',
      latestMutationId: 42,
      chunkIndex: [],
      deviceRingCid: 'QmRing',
      peerDirectoryCid: 'QmPeers',
      personalKey,
    })

    const bytes = serializeDeviceManifest(manifest)
    const deserialized = deserializeDeviceManifest(bytes)

    expect(deserialized).toEqual(manifest)
  })

  it('should validate DeviceManifest structure', async () => {
    const personalKey = generateSymmetricKey()
    const manifest = await createDeviceManifest({
      databaseCid: 'QmTest',
      latestMutationId: 1,
      chunkIndex: [],
      deviceRingCid: 'QmRing',
      peerDirectoryCid: 'QmPeers',
      personalKey,
    })

    expect(isValidDeviceManifest(manifest)).toBe(true)
    expect(isValidDeviceManifest(null)).toBe(false)
    expect(isValidDeviceManifest({})).toBe(false)
    expect(isValidDeviceManifest({ databaseCid: 'test' })).toBe(false)
  })
})

// ============================================================================
// DeviceRing Tests
// ============================================================================

describe('DeviceRing', () => {
  it('should create and decrypt DeviceRing', async () => {
    const broadcastKey = generateSymmetricKey()
    const device1Keys = generateP256KeyPair()
    const device2Keys = generateP256KeyPair()

    const deviceRing: DeviceRing = {
      devices: [
        createDeviceRingEntry(device1Keys.publicKey, new Uint8Array(32), 100),
        createDeviceRingEntry(device2Keys.publicKey, new Uint8Array(32), 50),
      ],
    }

    const encrypted = await createEncryptedDeviceRing(deviceRing, broadcastKey)
    const decrypted = await decryptDeviceRing(encrypted, broadcastKey)

    expect(decrypted.devices.length).toBe(2)
    expect(decrypted.devices[0].lastSyncedId).toBe(100)
    expect(decrypted.devices[1].lastSyncedId).toBe(50)
  })

  it('should create DeviceRingEntry with default lastSyncedId', () => {
    const keys = generateP256KeyPair()
    const ipnsKey = new Uint8Array(32)

    const entry = createDeviceRingEntry(keys.publicKey, ipnsKey)

    expect(entry.authPublicKey).toBe(keys.publicKey)
    expect(entry.ipnsPublicKey).toBe(ipnsKey)
    expect(entry.lastSyncedId).toBe(0)
  })

  it('should validate DeviceRing structure', async () => {
    const keys = generateP256KeyPair()
    const validRing: DeviceRing = {
      devices: [createDeviceRingEntry(keys.publicKey, new Uint8Array(32), 0)],
    }

    expect(isValidDeviceRing(validRing)).toBe(true)
    expect(isValidDeviceRing(null)).toBe(false)
    expect(isValidDeviceRing({ devices: [] })).toBe(true)
    expect(isValidDeviceRing({ devices: [{ invalid: true }] })).toBe(false)
  })
})

// ============================================================================
// PeerDirectory Tests
// ============================================================================

describe('PeerDirectory', () => {
  it('should create and decrypt PeerDirectory entry', async () => {
    const sender = generateP256KeyPair()
    const recipient = generateP256KeyPair()
    const broadcastKey = generateSymmetricKey()
    const groupKey = generateSymmetricKey()

    const payload: PeerDirectoryPayload = {
      broadcastKey,
      sharedGroups: [{ groupUuid: 'group-1', symmetricKey: groupKey, manifestCid: 'QmGroup1' }],
    }

    const entry = await createPeerDirectoryEntry(sender.privateKey, recipient.publicKey, payload)
    const decrypted = await decryptPeerDirectoryEntry(entry, recipient.privateKey, sender.publicKey)

    expect(decrypted.broadcastKey).toEqual(broadcastKey)
    expect(decrypted.sharedGroups.length).toBe(1)
    expect(decrypted.sharedGroups[0].groupUuid).toBe('group-1')
  })

  it('should create serialized PeerDirectory with multiple entries', async () => {
    const sender = generateP256KeyPair()
    const recipient1 = generateP256KeyPair()
    const recipient2 = generateP256KeyPair()
    const broadcastKey = generateSymmetricKey()
    const personalKey = generateSymmetricKey()

    const serialized = await createSerializedPeerDirectory(sender.privateKey, [
      {
        recipientPublicKey: recipient1.publicKey,
        payload: { personalKey, broadcastKey, sharedGroups: [] },
      },
      {
        recipientPublicKey: recipient2.publicKey,
        payload: { broadcastKey, sharedGroups: [] },
      },
    ])

    expect(serialized.entries.length).toBe(2)
  })

  it('should serialize and deserialize PeerDirectory', async () => {
    const sender = generateP256KeyPair()
    const recipient = generateP256KeyPair()
    const broadcastKey = generateSymmetricKey()

    const serialized = await createSerializedPeerDirectory(sender.privateKey, [
      {
        recipientPublicKey: recipient.publicKey,
        payload: { broadcastKey, sharedGroups: [] },
      },
    ])

    const bytes = serializePeerDirectory(serialized)
    const deserialized = deserializePeerDirectory(bytes)

    expect(deserialized.entries.length).toBe(1)
  })

  it('should find and decrypt own entry in PeerDirectory', async () => {
    const sender = generateP256KeyPair()
    const recipient1 = generateP256KeyPair()
    const recipient2 = generateP256KeyPair()
    const broadcastKey = generateSymmetricKey()

    const serialized = await createSerializedPeerDirectory(sender.privateKey, [
      {
        recipientPublicKey: recipient1.publicKey,
        payload: {
          broadcastKey,
          sharedGroups: [
            { groupUuid: 'g1', symmetricKey: generateSymmetricKey(), manifestCid: 'Qm1' },
          ],
        },
      },
      {
        recipientPublicKey: recipient2.publicKey,
        payload: {
          broadcastKey,
          sharedGroups: [
            { groupUuid: 'g2', symmetricKey: generateSymmetricKey(), manifestCid: 'Qm2' },
          ],
        },
      },
    ])

    // recipient2 finds their entry
    const payload = await findAndDecryptPeerDirectoryEntry(
      serialized,
      recipient2.privateKey,
      recipient2.publicKey,
      sender.publicKey
    )

    expect(payload).not.toBeNull()
    expect(payload!.sharedGroups[0].groupUuid).toBe('g2')
  })

  it('should return null if entry not found', async () => {
    const sender = generateP256KeyPair()
    const recipient = generateP256KeyPair()
    const stranger = generateP256KeyPair()
    const broadcastKey = generateSymmetricKey()

    const serialized = await createSerializedPeerDirectory(sender.privateKey, [
      {
        recipientPublicKey: recipient.publicKey,
        payload: { broadcastKey, sharedGroups: [] },
      },
    ])

    const payload = await findAndDecryptPeerDirectoryEntry(
      serialized,
      stranger.privateKey,
      stranger.publicKey,
      sender.publicKey
    )

    expect(payload).toBeNull()
  })

  it('should validate PeerDirectoryPayload structure', () => {
    const broadcastKey = generateSymmetricKey()
    const groupKey = generateSymmetricKey()

    const validPayload: PeerDirectoryPayload = {
      broadcastKey,
      sharedGroups: [{ groupUuid: 'g1', symmetricKey: groupKey, manifestCid: 'Qm1' }],
    }

    expect(isValidPeerDirectoryPayload(validPayload)).toBe(true)
    expect(isValidPeerDirectoryPayload(null)).toBe(false)
    expect(isValidPeerDirectoryPayload({ broadcastKey: 'invalid' })).toBe(false)
  })
})

// ============================================================================
// GroupManifest Tests
// ============================================================================

describe('GroupManifest', () => {
  it('should create and decrypt GroupManifest', async () => {
    const groupKey = generateSymmetricKey()

    const manifest: GroupManifest = createGroupManifest(
      {
        uuid: 'group-123',
        name: 'Test Group',
        createdAt: Date.now(),
        createdBy: 'person-1',
        protocolVersion: 1,
      },
      {
        records: [],
        people: [{ uuid: 'person-1', name: 'Alice', addedAt: Date.now(), isSelf: true }],
      },
      [{ startId: 1, endId: 50, cid: 'QmChunk' }],
      50
    )

    const encrypted = await createEncryptedGroupManifest(manifest, groupKey)
    const decrypted = await decryptGroupManifest(encrypted, groupKey)

    expect(decrypted.group.uuid).toBe('group-123')
    expect(decrypted.group.name).toBe('Test Group')
    expect(decrypted.database.people.length).toBe(1)
    expect(decrypted.latestMutationId).toBe(50)
  })

  it('should create GroupManifest with defaults', () => {
    const manifest = createGroupManifest(
      { uuid: 'g1', name: 'Group', createdAt: 0, protocolVersion: 1 },
      { records: [], people: [] }
    )

    expect(manifest.chunkIndex).toEqual([])
    expect(manifest.latestMutationId).toBe(0)
  })

  it('should validate GroupManifest structure', () => {
    const validManifest = createGroupManifest(
      { uuid: 'g1', name: 'Group', createdAt: 0, protocolVersion: 1 },
      { records: [], people: [] }
    )

    expect(isValidGroupManifest(validManifest)).toBe(true)
    expect(isValidGroupManifest(null)).toBe(false)
    expect(isValidGroupManifest({})).toBe(false)
  })
})

// ============================================================================
// MutationChunks Tests
// ============================================================================

describe('MutationChunks', () => {
  it('should create and decrypt mutation chunk', async () => {
    const encryptionKey = generateSymmetricKey()
    const mutations: Mutation[] = [
      {
        version: 1,
        uuid: 'mut-1',
        id: 1,
        targetUuid: 'rec-1',
        targetType: 'record',
        operation: { type: 'create', data: { title: 'Test' } },
        timestamp: Date.now(),
        signedAt: Date.now(),
        authorDevicePublicKey: new Uint8Array(65),
        signature: new Uint8Array(64),
      },
    ]

    const encrypted = await createEncryptedMutationChunk(mutations, encryptionKey)
    const decrypted = await decryptMutationChunk(encrypted, encryptionKey)

    expect(decrypted.length).toBe(1)
    expect(decrypted[0].uuid).toBe('mut-1')
    expect(decrypted[0].operation.type).toBe('create')
  })

  it('should find chunks to sync', () => {
    const chunkIndex: MutationChunks = [
      { startId: 1, endId: 100, cid: 'Qm1' },
      { startId: 101, endId: 200, cid: 'Qm2' },
      { startId: 201, endId: 300, cid: 'Qm3' },
      { startId: 301, endId: 350, cid: 'Qm4' },
    ]

    // Already synced up to 250, need 201-300 and 301-350
    const needed = findChunksToSync(chunkIndex, 250)
    expect(needed.length).toBe(2)
    expect(needed[0].cid).toBe('Qm3')
    expect(needed[1].cid).toBe('Qm4')
  })

  it('should return empty array if fully synced', () => {
    const chunkIndex: MutationChunks = [{ startId: 1, endId: 100, cid: 'Qm1' }]

    const needed = findChunksToSync(chunkIndex, 100)
    expect(needed.length).toBe(0)
  })

  it('should create mutation chunk entry', () => {
    const chunk = createMutationChunk(1, 100, 'QmTest')
    expect(chunk.startId).toBe(1)
    expect(chunk.endId).toBe(100)
    expect(chunk.cid).toBe('QmTest')
  })
})

// ============================================================================
// Database Encryption Tests
// ============================================================================

describe('Database Encryption', () => {
  it('should create and decrypt personal database', async () => {
    const personalKey = generateSymmetricKey()

    const database = {
      people: [{ uuid: 'p1', name: 'Alice', addedAt: Date.now() }],
      records: [
        {
          uuid: 'r1',
          title: 'Lunch',
          description: '',
          category: 'food',
          amount: 100,
          currency: 'USD',
          date: '2024-01-01',
          time: '12:00',
          icon: '🍔',
          paidBy: [{ personUuid: 'p1', share: 1 }],
          paidFor: [{ personUuid: 'p1', share: 1 }],
          shareType: 'equal' as const,
          groupId: null,
          comments: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      groups: [],
    }

    const encrypted = await createEncryptedDatabase(database, personalKey)
    const decrypted = await decryptDatabase(encrypted, personalKey)

    expect(decrypted.people.length).toBe(1)
    expect(decrypted.people[0].name).toBe('Alice')
    expect(decrypted.records.length).toBe(1)
    expect(decrypted.records[0].title).toBe('Lunch')
  })
})
