/**
 * Tests for mutations module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  serializeForSigning,
  serializeMutation,
  deserializeMutation,
  createMutation,
  signMutation,
  createSignedMutation,
  verifyMutationSignature,
  verifyMutationTimestamp,
  verifyMutation,
  createScalarChange,
  computeFieldChanges,
  applyFieldChanges,
  CURRENT_PROTOCOL_VERSION,
} from './mutations'
import { generateP256KeyPair, stringToBytes } from './crypto'
import type { Mutation, FieldChange } from './types'

describe('Canonical JSON Serialization', () => {
  it('should produce deterministic JSON with sorted keys', () => {
    const mutation = createMutation({
      id: 1,
      targetUuid: 'record-123',
      targetType: 'record',
      operation: { type: 'delete' },
      authorDevicePublicKey: new Uint8Array([1, 2, 3]),
    })

    const json1 = serializeForSigning(mutation)
    const json2 = serializeForSigning(mutation)

    expect(json1).toBe(json2)
  })

  it('should produce same JSON regardless of property order', () => {
    const keyPair = generateP256KeyPair()

    const obj1 = {
      version: 1,
      uuid: 'test',
      id: 1,
      targetUuid: 'target',
      targetType: 'record' as const,
      operation: { type: 'delete' as const },
      timestamp: 1000,
      signedAt: 1000,
      authorDevicePublicKey: keyPair.publicKey,
    }

    const obj2 = {
      signedAt: 1000,
      operation: { type: 'delete' as const },
      targetType: 'record' as const,
      version: 1,
      authorDevicePublicKey: keyPair.publicKey,
      uuid: 'test',
      timestamp: 1000,
      id: 1,
      targetUuid: 'target',
    }

    const json1 = serializeForSigning(obj1)
    const json2 = serializeForSigning(obj2)

    expect(json1).toBe(json2)
  })

  it('should handle Uint8Array serialization', () => {
    const mutation = createMutation({
      id: 1,
      targetUuid: 'test',
      targetType: 'record',
      operation: { type: 'delete' },
      authorDevicePublicKey: new Uint8Array([1, 2, 3]),
    })

    const json = serializeForSigning(mutation)
    expect(json).toContain('__type')
    expect(json).toContain('Uint8Array')
  })
})

describe('Mutation Serialization', () => {
  it('should serialize and deserialize a mutation', () => {
    const keyPair = generateP256KeyPair()
    const mutation = createSignedMutation(
      {
        id: 1,
        targetUuid: 'record-123',
        targetType: 'record',
        operation: {
          type: 'create',
          data: { uuid: 'record-123', title: 'Test', amount: 100 },
        },
        authorDevicePublicKey: keyPair.publicKey,
      },
      keyPair.privateKey
    )

    const json = serializeMutation(mutation)
    const deserialized = deserializeMutation(json)

    expect(deserialized.uuid).toBe(mutation.uuid)
    expect(deserialized.id).toBe(mutation.id)
    expect(deserialized.targetUuid).toBe(mutation.targetUuid)
    expect(deserialized.targetType).toBe(mutation.targetType)
    expect(deserialized.operation).toEqual(mutation.operation)
    expect(deserialized.authorDevicePublicKey).toEqual(mutation.authorDevicePublicKey)
    expect(deserialized.signature).toEqual(mutation.signature)
  })
})

describe('Mutation Creation', () => {
  it('should create a mutation with correct fields', () => {
    const keyPair = generateP256KeyPair()
    const mutation = createMutation({
      id: 5,
      targetUuid: 'record-abc',
      targetType: 'record',
      operation: { type: 'delete' },
      authorDevicePublicKey: keyPair.publicKey,
    })

    expect(mutation.version).toBe(CURRENT_PROTOCOL_VERSION)
    expect(mutation.uuid).toBeDefined()
    expect(mutation.uuid).toMatch(/^[a-f0-9-]{36}$/)
    expect(mutation.id).toBe(5)
    expect(mutation.targetUuid).toBe('record-abc')
    expect(mutation.targetType).toBe('record')
    expect(mutation.operation).toEqual({ type: 'delete' })
    expect(mutation.timestamp).toBeDefined()
    expect(mutation.signedAt).toBeDefined()
    expect(mutation.authorDevicePublicKey).toEqual(keyPair.publicKey)
  })

  it('should use provided timestamp', () => {
    const keyPair = generateP256KeyPair()
    const customTimestamp = 1700000000000

    const mutation = createMutation({
      id: 1,
      targetUuid: 'test',
      targetType: 'record',
      operation: { type: 'delete' },
      timestamp: customTimestamp,
      authorDevicePublicKey: keyPair.publicKey,
    })

    expect(mutation.timestamp).toBe(customTimestamp)
    expect(mutation.signedAt).not.toBe(customTimestamp) // signedAt should be current time
  })
})

describe('Mutation Signing', () => {
  it('should sign a mutation', () => {
    const keyPair = generateP256KeyPair()
    const mutation = createMutation({
      id: 1,
      targetUuid: 'test',
      targetType: 'record',
      operation: { type: 'delete' },
      authorDevicePublicKey: keyPair.publicKey,
    })

    const signed = signMutation(mutation, keyPair.privateKey)

    expect(signed.signature).toBeInstanceOf(Uint8Array)
    expect(signed.signature.length).toBe(64)
  })

  it('should create and sign in one step', () => {
    const keyPair = generateP256KeyPair()

    const mutation = createSignedMutation(
      {
        id: 1,
        targetUuid: 'test',
        targetType: 'record',
        operation: { type: 'delete' },
        authorDevicePublicKey: keyPair.publicKey,
      },
      keyPair.privateKey
    )

    expect(mutation.signature).toBeDefined()
    expect(mutation.signature.length).toBe(64)
  })
})

describe('Mutation Verification', () => {
  it('should verify a valid mutation signature', () => {
    const keyPair = generateP256KeyPair()
    const mutation = createSignedMutation(
      {
        id: 1,
        targetUuid: 'test',
        targetType: 'record',
        operation: { type: 'delete' },
        authorDevicePublicKey: keyPair.publicKey,
      },
      keyPair.privateKey
    )

    const result = verifyMutationSignature(mutation)

    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('should reject tampered signature', () => {
    const keyPair = generateP256KeyPair()
    const mutation = createSignedMutation(
      {
        id: 1,
        targetUuid: 'test',
        targetType: 'record',
        operation: { type: 'delete' },
        authorDevicePublicKey: keyPair.publicKey,
      },
      keyPair.privateKey
    )

    // Tamper with signature
    mutation.signature[0] ^= 0xff

    const result = verifyMutationSignature(mutation)

    expect(result.valid).toBe(false)
    expect(result.error).toBe('Invalid signature')
  })

  it('should reject mutation with wrong public key', () => {
    const kp1 = generateP256KeyPair()
    const kp2 = generateP256KeyPair()

    const mutation = createSignedMutation(
      {
        id: 1,
        targetUuid: 'test',
        targetType: 'record',
        operation: { type: 'delete' },
        authorDevicePublicKey: kp1.publicKey,
      },
      kp1.privateKey
    )

    // Replace public key with different one
    mutation.authorDevicePublicKey = kp2.publicKey

    const result = verifyMutationSignature(mutation)

    expect(result.valid).toBe(false)
  })

  it('should reject mutation with tampered content', () => {
    const keyPair = generateP256KeyPair()
    const mutation = createSignedMutation(
      {
        id: 1,
        targetUuid: 'test',
        targetType: 'record',
        operation: { type: 'delete' },
        authorDevicePublicKey: keyPair.publicKey,
      },
      keyPair.privateKey
    )

    // Tamper with content
    mutation.targetUuid = 'different-target'

    const result = verifyMutationSignature(mutation)

    expect(result.valid).toBe(false)
  })
})

describe('Mutation Timestamp Verification', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should accept mutation within validity window', () => {
    const now = Date.now()
    vi.setSystemTime(now)

    const keyPair = generateP256KeyPair()
    const mutation = createSignedMutation(
      {
        id: 1,
        targetUuid: 'test',
        targetType: 'record',
        operation: { type: 'delete' },
        authorDevicePublicKey: keyPair.publicKey,
      },
      keyPair.privateKey
    )

    // Advance time by 2 minutes (within 5 minute window)
    vi.advanceTimersByTime(2 * 60 * 1000)

    const result = verifyMutationTimestamp(mutation)

    expect(result.valid).toBe(true)
  })

  it('should reject mutation outside validity window', () => {
    const now = Date.now()
    vi.setSystemTime(now)

    const keyPair = generateP256KeyPair()
    const mutation = createSignedMutation(
      {
        id: 1,
        targetUuid: 'test',
        targetType: 'record',
        operation: { type: 'delete' },
        authorDevicePublicKey: keyPair.publicKey,
      },
      keyPair.privateKey
    )

    // Advance time by 10 minutes (outside 5 minute window)
    vi.advanceTimersByTime(10 * 60 * 1000)

    const result = verifyMutationTimestamp(mutation)

    expect(result.valid).toBe(false)
    expect(result.error).toContain('expired')
  })

  it('should accept mutation from slightly in the future', () => {
    const now = Date.now()
    vi.setSystemTime(now)

    const keyPair = generateP256KeyPair()

    // Create mutation with signedAt 1 minute in the future
    const mutation = createMutation({
      id: 1,
      targetUuid: 'test',
      targetType: 'record',
      operation: { type: 'delete' },
      authorDevicePublicKey: keyPair.publicKey,
    })
    mutation.signedAt = now + 60 * 1000

    const signed = signMutation(mutation, keyPair.privateKey)
    const result = verifyMutationTimestamp(signed)

    expect(result.valid).toBe(true)
  })
})

describe('Full Mutation Verification', () => {
  it('should verify valid mutation', () => {
    const keyPair = generateP256KeyPair()
    const mutation = createSignedMutation(
      {
        id: 1,
        targetUuid: 'test',
        targetType: 'record',
        operation: { type: 'delete' },
        authorDevicePublicKey: keyPair.publicKey,
      },
      keyPair.privateKey
    )

    const result = verifyMutation(mutation)

    expect(result.valid).toBe(true)
  })
})

describe('Field Change Helpers', () => {
  it('should create scalar change', () => {
    const change = createScalarChange('amount', 100, 200)

    expect(change.field).toBe('amount')
    expect(change.old).toBe(100)
    expect(change.new).toBe(200)
  })

  it('should compute changes for scalar fields', () => {
    const oldObj = { title: 'Old', amount: 100, category: 'food' }
    const newObj = { title: 'New', amount: 200, category: 'food' }

    const changes = computeFieldChanges(oldObj, newObj)

    expect(changes).toHaveLength(2)
    expect(changes).toContainEqual({ field: 'title', old: 'Old', new: 'New' })
    expect(changes).toContainEqual({ field: 'amount', old: 100, new: 200 })
  })

  it('should not include unchanged fields', () => {
    const oldObj = { a: 1, b: 2, c: 3 }
    const newObj = { a: 1, b: 5, c: 3 }

    const changes = computeFieldChanges(oldObj, newObj)

    expect(changes).toHaveLength(1)
    expect(changes[0]).toEqual({ field: 'b', old: 2, new: 5 })
  })

  it('should exclude specified fields', () => {
    const oldObj = { a: 1, b: 2, updatedAt: 1000 }
    const newObj = { a: 1, b: 3, updatedAt: 2000 }

    const changes = computeFieldChanges(oldObj, newObj, ['updatedAt'])

    expect(changes).toHaveLength(1)
    expect(changes[0].field).toBe('b')
  })

  it('should detect array additions', () => {
    const oldObj = {
      paidBy: [{ personUuid: 'p1', share: 1 }],
    }
    const newObj = {
      paidBy: [
        { personUuid: 'p1', share: 1 },
        { personUuid: 'p2', share: 1 },
      ],
    }

    const changes = computeFieldChanges(oldObj, newObj)

    expect(changes).toHaveLength(1)
    expect(changes[0]).toEqual({
      field: 'paidBy',
      op: 'add',
      key: 'p2',
      value: { personUuid: 'p2', share: 1 },
    })
  })

  it('should detect array removals', () => {
    const oldObj = {
      paidFor: [
        { personUuid: 'p1', share: 1 },
        { personUuid: 'p2', share: 1 },
      ],
    }
    const newObj = {
      paidFor: [{ personUuid: 'p1', share: 1 }],
    }

    const changes = computeFieldChanges(oldObj, newObj)

    expect(changes).toHaveLength(1)
    expect(changes[0]).toEqual({
      field: 'paidFor',
      op: 'remove',
      key: 'p2',
      oldValue: { personUuid: 'p2', share: 1 },
    })
  })

  it('should detect array updates', () => {
    const oldObj = {
      paidBy: [{ personUuid: 'p1', share: 1 }],
    }
    const newObj = {
      paidBy: [{ personUuid: 'p1', share: 2 }],
    }

    const changes = computeFieldChanges(oldObj, newObj)

    expect(changes).toHaveLength(1)
    expect(changes[0]).toEqual({
      field: 'paidBy',
      op: 'update',
      key: 'p1',
      old: { personUuid: 'p1', share: 1 },
      new: { personUuid: 'p1', share: 2 },
    })
  })

  it('should handle device array changes', () => {
    const oldObj = {
      devices: [
        { deviceId: 'd1', ipnsPublicKey: new Uint8Array([1]), authPublicKey: new Uint8Array([2]) },
      ],
    }
    const newObj = {
      devices: [
        { deviceId: 'd1', ipnsPublicKey: new Uint8Array([1]), authPublicKey: new Uint8Array([2]) },
        { deviceId: 'd2', ipnsPublicKey: new Uint8Array([3]), authPublicKey: new Uint8Array([4]) },
      ],
    }

    const changes = computeFieldChanges(oldObj, newObj)

    expect(changes).toHaveLength(1)
    expect((changes[0] as { field: string; op: string; key: string }).op).toBe('add')
    expect((changes[0] as { field: string; op: string; key: string }).key).toBe('d2')
  })
})

describe('Apply Field Changes', () => {
  it('should apply scalar changes', () => {
    const obj = { title: 'Old', amount: 100 }
    const changes: FieldChange[] = [
      { field: 'title', old: 'Old', new: 'New' },
      { field: 'amount', old: 100, new: 200 },
    ]

    const result = applyFieldChanges(obj, changes)

    expect(result.title).toBe('New')
    expect(result.amount).toBe(200)
  })

  it('should apply array add', () => {
    const obj = {
      paidBy: [{ personUuid: 'p1', share: 1 }],
    }
    const changes: FieldChange[] = [
      { field: 'paidBy', op: 'add', key: 'p2', value: { personUuid: 'p2', share: 1 } },
    ]

    const result = applyFieldChanges(obj, changes)

    expect(result.paidBy).toHaveLength(2)
    expect(result.paidBy[1]).toEqual({ personUuid: 'p2', share: 1 })
  })

  it('should apply array remove', () => {
    const obj = {
      paidFor: [
        { personUuid: 'p1', share: 1 },
        { personUuid: 'p2', share: 1 },
      ],
    }
    const changes: FieldChange[] = [
      { field: 'paidFor', op: 'remove', key: 'p2', oldValue: { personUuid: 'p2', share: 1 } },
    ]

    const result = applyFieldChanges(obj, changes)

    expect(result.paidFor).toHaveLength(1)
    expect(result.paidFor[0].personUuid).toBe('p1')
  })

  it('should apply array update', () => {
    const obj = {
      paidBy: [{ personUuid: 'p1', share: 1 }],
    }
    const changes: FieldChange[] = [
      {
        field: 'paidBy',
        op: 'update',
        key: 'p1',
        old: { personUuid: 'p1', share: 1 },
        new: { personUuid: 'p1', share: 2 },
      },
    ]

    const result = applyFieldChanges(obj, changes)

    expect(result.paidBy).toHaveLength(1)
    expect(result.paidBy[0].share).toBe(2)
  })

  it('should not mutate original object', () => {
    const obj = { title: 'Original', amount: 100 }
    const changes: FieldChange[] = [{ field: 'title', old: 'Original', new: 'Changed' }]

    const result = applyFieldChanges(obj, changes)

    expect(obj.title).toBe('Original')
    expect(result.title).toBe('Changed')
  })
})
