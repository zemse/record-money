/**
 * Mutation creation, signing, and verification
 *
 * Mutations are the source of truth for sync. They track all changes
 * to records, persons, groups, and devices with field-level granularity.
 */

import stringify from 'fast-json-stable-stringify'
import { signP256, verifyP256, hashSha256, bytesToBase64, base64ToBytes } from './crypto'
import type { Mutation, MutationOperation, FieldChange, ScalarChange } from './types'

// ============================================================================
// Constants
// ============================================================================

/** Current protocol version */
export const CURRENT_PROTOCOL_VERSION = 1

/** Signature validity window in milliseconds (±5 minutes) */
const SIGNATURE_VALIDITY_WINDOW_MS = 5 * 60 * 1000

// ============================================================================
// Canonical JSON Serialization
// ============================================================================

/**
 * Custom replacer to handle Uint8Array serialization
 * Converts Uint8Array to base64 strings with a type marker
 */
function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return { __type: 'Uint8Array', data: bytesToBase64(value) }
  }
  return value
}

/**
 * Custom reviver to restore Uint8Array from JSON
 */
function jsonReviver(_key: string, value: unknown): unknown {
  if (
    value &&
    typeof value === 'object' &&
    (value as Record<string, unknown>).__type === 'Uint8Array'
  ) {
    return base64ToBytes((value as Record<string, unknown>).data as string)
  }
  return value
}

/**
 * Serialize mutation to canonical JSON (sorted keys, no whitespace)
 * Used for signing and verification
 */
export function serializeForSigning(mutation: Omit<Mutation, 'signature'>): string {
  // Create a copy without signature field and convert Uint8Array to base64
  const prepared = JSON.parse(JSON.stringify(mutation, jsonReplacer))
  return stringify(prepared)
}

/**
 * Serialize mutation to JSON for storage/transport
 */
export function serializeMutation(mutation: Mutation): string {
  return JSON.stringify(mutation, jsonReplacer)
}

/**
 * Deserialize mutation from JSON
 */
export function deserializeMutation(json: string): Mutation {
  return JSON.parse(json, jsonReviver) as Mutation
}

// ============================================================================
// Mutation Creation
// ============================================================================

export interface CreateMutationParams {
  id: number // per-device incremental ID
  targetUuid: string
  targetType: 'record' | 'person' | 'group' | 'device'
  operation: MutationOperation
  timestamp?: number // defaults to current time
  authorDevicePublicKey: Uint8Array
}

/**
 * Create a new mutation (unsigned)
 */
export function createMutation(params: CreateMutationParams): Omit<Mutation, 'signature'> {
  const now = Date.now()
  return {
    version: CURRENT_PROTOCOL_VERSION,
    uuid: crypto.randomUUID(),
    id: params.id,
    targetUuid: params.targetUuid,
    targetType: params.targetType,
    operation: params.operation,
    timestamp: params.timestamp ?? now,
    signedAt: now,
    authorDevicePublicKey: params.authorDevicePublicKey,
  }
}

/**
 * Sign a mutation with a device's private key
 */
export function signMutation(
  mutation: Omit<Mutation, 'signature'>,
  privateKey: Uint8Array
): Mutation {
  const canonical = serializeForSigning(mutation)
  const hash = hashSha256(new TextEncoder().encode(canonical))
  const signature = signP256(privateKey, hash)

  return {
    ...mutation,
    signature,
  }
}

/**
 * Create and sign a mutation in one step
 */
export function createSignedMutation(
  params: CreateMutationParams,
  privateKey: Uint8Array
): Mutation {
  const mutation = createMutation(params)
  return signMutation(mutation, privateKey)
}

// ============================================================================
// Mutation Verification
// ============================================================================

export interface VerificationResult {
  valid: boolean
  error?: string
}

/**
 * Verify a mutation's signature
 */
export function verifyMutationSignature(mutation: Mutation): VerificationResult {
  try {
    // Extract the mutation without signature
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { signature, ...rest } = mutation
    const canonical = serializeForSigning(rest)
    const hash = hashSha256(new TextEncoder().encode(canonical))

    if (!verifyP256(mutation.authorDevicePublicKey, hash, mutation.signature)) {
      return { valid: false, error: 'Invalid signature' }
    }

    return { valid: true }
  } catch (error) {
    return { valid: false, error: `Verification failed: ${error}` }
  }
}

/**
 * Check if mutation's signedAt is within validity window
 */
export function verifyMutationTimestamp(
  mutation: Mutation,
  currentTime: number = Date.now()
): VerificationResult {
  const timeDiff = Math.abs(currentTime - mutation.signedAt)

  if (timeDiff > SIGNATURE_VALIDITY_WINDOW_MS) {
    return {
      valid: false,
      error: `Signature expired: signedAt ${mutation.signedAt} is ${timeDiff}ms from current time`,
    }
  }

  return { valid: true }
}

/**
 * Fully verify a mutation (signature + timestamp)
 * Note: Author verification (is author in DeviceRing?) should be done separately
 */
export function verifyMutation(
  mutation: Mutation,
  currentTime: number = Date.now()
): VerificationResult {
  // Verify signature
  const sigResult = verifyMutationSignature(mutation)
  if (!sigResult.valid) {
    return sigResult
  }

  // Verify timestamp (only for newly received mutations)
  const timeResult = verifyMutationTimestamp(mutation, currentTime)
  if (!timeResult.valid) {
    return timeResult
  }

  return { valid: true }
}

// ============================================================================
// Field Change Helpers
// ============================================================================

/**
 * Create a scalar field change
 */
export function createScalarChange(
  field: string,
  oldValue: unknown,
  newValue: unknown
): ScalarChange {
  return { field, old: oldValue, new: newValue }
}

/**
 * Compute field-level changes between two objects
 * Only includes fields that actually changed
 */
export function computeFieldChanges(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  excludeFields: string[] = ['updatedAt'] // fields to ignore
): FieldChange[] {
  const changes: FieldChange[] = []
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)])

  for (const key of allKeys) {
    if (excludeFields.includes(key)) continue

    const oldVal = oldObj[key]
    const newVal = newObj[key]

    // Handle arrays specially (paidBy, paidFor, devices)
    if (key === 'paidBy' || key === 'paidFor' || key === 'devices') {
      const arrayChanges = computeArrayChanges(
        key as 'paidBy' | 'paidFor' | 'devices',
        oldVal as unknown[],
        newVal as unknown[]
      )
      changes.push(...arrayChanges)
      continue
    }

    // Scalar comparison (deep equality check via JSON)
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push(createScalarChange(key, oldVal, newVal))
    }
  }

  return changes
}

/**
 * Compute changes for array fields (paidBy, paidFor, devices)
 * Uses personUuid or deviceId as the key
 */
function computeArrayChanges(
  field: 'paidBy' | 'paidFor' | 'devices',
  oldArr: unknown[] | undefined,
  newArr: unknown[] | undefined
): FieldChange[] {
  const changes: FieldChange[] = []
  const old = oldArr ?? []
  const current = newArr ?? []

  // Create maps keyed by identifier
  const getKey = (item: unknown): string => {
    const obj = item as Record<string, unknown>
    if (field === 'devices') {
      return obj.deviceId as string
    }
    return obj.personUuid as string
  }

  const oldMap = new Map(old.map((item) => [getKey(item), item]))
  const newMap = new Map(current.map((item) => [getKey(item), item]))

  // Find removals
  for (const [key, oldItem] of oldMap) {
    if (!newMap.has(key)) {
      changes.push({
        field,
        op: 'remove',
        key,
        oldValue: oldItem,
      } as FieldChange)
    }
  }

  // Find additions and updates
  for (const [key, newItem] of newMap) {
    const oldItem = oldMap.get(key)
    if (!oldItem) {
      changes.push({
        field,
        op: 'add',
        key,
        value: newItem,
      } as FieldChange)
    } else if (JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
      changes.push({
        field,
        op: 'update',
        key,
        old: oldItem,
        new: newItem,
      } as FieldChange)
    }
  }

  return changes
}

// ============================================================================
// Mutation Application
// ============================================================================

/**
 * Apply field changes to an object
 * Returns a new object with changes applied
 */
export function applyFieldChanges<T extends Record<string, unknown>>(
  obj: T,
  changes: FieldChange[]
): T {
  const result = { ...obj }

  for (const change of changes) {
    if ('op' in change) {
      // Array operation
      const arr = (result[change.field] as unknown[]) ?? []
      const getKey = (item: unknown): string => {
        const o = item as Record<string, unknown>
        return change.field === 'devices' ? (o.deviceId as string) : (o.personUuid as string)
      }

      if (change.op === 'add') {
        result[change.field as keyof T] = [...arr, change.value] as T[keyof T]
      } else if (change.op === 'remove') {
        result[change.field as keyof T] = arr.filter(
          (item) => getKey(item) !== change.key
        ) as T[keyof T]
      } else if (change.op === 'update') {
        result[change.field as keyof T] = arr.map((item) =>
          getKey(item) === change.key ? change.new : item
        ) as T[keyof T]
      }
    } else {
      // Scalar change
      result[change.field as keyof T] = change.new as T[keyof T]
    }
  }

  return result
}
