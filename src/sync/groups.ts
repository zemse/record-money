/**
 * Group Service
 *
 * Handles group creation, membership, and key management:
 * - Group Key generation and storage
 * - Personal Ledger (special self-only group)
 * - Invite link generation and parsing
 * - Join request flow with emoji verification
 * - Member add/remove with key rotation
 * - Group exit
 */

import {
  db,
  generateUUID,
  now,
  getGroupKey,
  saveGroupKey,
  getPerson,
  savePerson,
  getSelfPerson,
  getAllPeople,
  getPendingInvite,
  savePendingInvite,
  deletePendingInvite,
  getPendingInvitesByStatus,
  getSyncConfig,
  queueMutation,
} from '../db'
import { getDeviceKeysAsBytes, getConfiguredProvider } from './device-setup'
import { createSignedMutation, serializeMutation } from './mutations'
import { generateSymmetricKey, bytesToBase64, base64ToBytes, deriveEmojis, sha256 } from './crypto'
import { generateEd25519KeyPair } from './crypto'
import type { StoredGroupKey, StoredPerson, PendingInvite, DeviceInfo } from '../types'
import type { Group, Person, CreateOp, DeleteOp, ExitOp } from './types'

// ============================================================================
// Constants
// ============================================================================

export const PERSONAL_LEDGER_NAME = 'Personal Ledger'

// ============================================================================
// Types
// ============================================================================

export interface CreateGroupResult {
  success: boolean
  groupUuid?: string
  error?: string
}

export interface InviteLinkPayload {
  groupUuid: string
  groupName: string
  inviterAuthPublicKey: string // base64
  inviterIpnsPublicKey: string // base64
  tempIpnsPrivateKey: string // base64
  tempIpnsPublicKey: string // base64
  tempSymmetricKey: string // base64
}

export interface InviteResponse {
  recipientAuthPublicKey: string // base64
  recipientIpnsPublicKey: string // base64
  recipientName?: string
}

// ============================================================================
// Group Key Management
// ============================================================================

/**
 * Generate a new 256-bit Group Key
 */
export async function generateGroupKey(): Promise<Uint8Array> {
  return generateSymmetricKey()
}

/**
 * Store a group key
 */
export async function storeGroupKey(groupUuid: string, key: Uint8Array): Promise<void> {
  await saveGroupKey({
    groupUuid,
    symmetricKey: bytesToBase64(key),
    createdAt: now(),
  })
}

/**
 * Get a group key as bytes
 */
export async function getGroupKeyAsBytes(groupUuid: string): Promise<Uint8Array | null> {
  const stored = await getGroupKey(groupUuid)
  if (!stored) return null
  return base64ToBytes(stored.symmetricKey)
}

/**
 * Rotate a group key (after member removal)
 */
export async function rotateGroupKey(groupUuid: string): Promise<Uint8Array> {
  const newKey = await generateGroupKey()
  const stored = await getGroupKey(groupUuid)

  await saveGroupKey({
    groupUuid,
    symmetricKey: bytesToBase64(newKey),
    createdAt: stored?.createdAt || now(),
    rotatedAt: now(),
  })

  return newKey
}

// ============================================================================
// Group Creation
// ============================================================================

/**
 * Create a new group
 */
export async function createGroup(name: string): Promise<CreateGroupResult> {
  try {
    const deviceKeys = await getDeviceKeysAsBytes()
    if (!deviceKeys) {
      return { success: false, error: 'Device keys not configured' }
    }

    const selfPerson = await getSelfPerson()
    if (!selfPerson) {
      return { success: false, error: 'Self person not configured' }
    }

    // Generate group UUID and key
    const groupUuid = generateUUID()
    const groupKey = await generateGroupKey()

    // Store group key
    await storeGroupKey(groupUuid, groupKey)

    // Create group entity in local DB
    const timestamp = now()
    await db.groups.add({
      uuid: groupUuid,
      name,
      members: [selfPerson.uuid],
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    // Create group mutation
    const groupData: Group = {
      uuid: groupUuid,
      name,
      createdAt: timestamp,
      createdBy: selfPerson.uuid,
      protocolVersion: 1,
    }

    await createGroupMutation(groupUuid, groupData, deviceKeys)

    // Create person mutation to add self as first member
    const personData: Person = {
      uuid: selfPerson.uuid,
      name: selfPerson.name,
      email: selfPerson.email,
      devices: selfPerson.devices?.map((d) => ({
        deviceId: d.deviceId,
        ipnsPublicKey: base64ToBytes(d.ipnsPublicKey),
        authPublicKey: base64ToBytes(d.authPublicKey),
      })),
      addedAt: timestamp,
      isSelf: true,
    }

    await createPersonMutation(selfPerson.uuid, personData, deviceKeys)

    return { success: true, groupUuid }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create group',
    }
  }
}

/**
 * Create the Personal Ledger (special self-only group)
 * Called automatically during first device setup
 */
export async function createPersonalLedger(
  selfPersonUuid: string,
  selfName: string,
  deviceInfo: DeviceInfo
): Promise<CreateGroupResult> {
  try {
    const deviceKeys = await getDeviceKeysAsBytes()
    if (!deviceKeys) {
      return { success: false, error: 'Device keys not configured' }
    }

    // Check if Personal Ledger already exists
    const existing = await db.groups.where('name').equals(PERSONAL_LEDGER_NAME).first()
    if (existing) {
      return { success: true, groupUuid: existing.uuid }
    }

    // Generate group UUID and key
    const groupUuid = generateUUID()
    const groupKey = await generateGroupKey()

    // Store group key
    await storeGroupKey(groupUuid, groupKey)

    // Create group entity in local DB
    const timestamp = now()
    await db.groups.add({
      uuid: groupUuid,
      name: PERSONAL_LEDGER_NAME,
      members: [selfPersonUuid],
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    // Create self person entity
    const selfPerson: StoredPerson = {
      uuid: selfPersonUuid,
      name: selfName,
      devices: [deviceInfo],
      addedAt: timestamp,
      isSelf: true,
    }
    await savePerson(selfPerson)

    // Create group mutation
    const groupData: Group = {
      uuid: groupUuid,
      name: PERSONAL_LEDGER_NAME,
      createdAt: timestamp,
      createdBy: selfPersonUuid,
      protocolVersion: 1,
    }

    await createGroupMutation(groupUuid, groupData, deviceKeys)

    // Create person mutation
    const personData: Person = {
      uuid: selfPersonUuid,
      name: selfName,
      devices: [
        {
          deviceId: deviceInfo.deviceId,
          ipnsPublicKey: base64ToBytes(deviceInfo.ipnsPublicKey),
          authPublicKey: base64ToBytes(deviceInfo.authPublicKey),
        },
      ],
      addedAt: timestamp,
      isSelf: true,
    }

    await createPersonMutation(selfPersonUuid, personData, deviceKeys)

    return { success: true, groupUuid }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create Personal Ledger',
    }
  }
}

/**
 * Get the Personal Ledger group
 */
export async function getPersonalLedger() {
  return db.groups.where('name').equals(PERSONAL_LEDGER_NAME).first()
}

// ============================================================================
// Invite Link Generation
// ============================================================================

/**
 * Generate an invite link for a group
 */
export async function generateInviteLink(groupUuid: string): Promise<{
  success: boolean
  inviteLink?: string
  inviteId?: string
  error?: string
}> {
  try {
    const deviceKeys = await getDeviceKeysAsBytes()
    if (!deviceKeys) {
      return { success: false, error: 'Device keys not configured' }
    }

    const group = await db.groups.get(groupUuid)
    if (!group) {
      return { success: false, error: 'Group not found' }
    }

    // Generate temp IPNS key pair for handshake
    const tempIpnsKeyPair = await generateEd25519KeyPair()

    // Generate temp symmetric key for encryption
    const tempSymmetricKey = await generateSymmetricKey()

    // Create invite payload
    const payload: InviteLinkPayload = {
      groupUuid,
      groupName: group.name,
      inviterAuthPublicKey: bytesToBase64(deviceKeys.authPublicKey),
      inviterIpnsPublicKey: bytesToBase64(deviceKeys.ipnsPublicKey),
      tempIpnsPrivateKey: bytesToBase64(tempIpnsKeyPair.privateKey),
      tempIpnsPublicKey: bytesToBase64(tempIpnsKeyPair.publicKey),
      tempSymmetricKey: bytesToBase64(tempSymmetricKey),
    }

    // Encode as base64
    const payloadJson = JSON.stringify(payload)
    const payloadBytes = new TextEncoder().encode(payloadJson)
    const inviteLink = bytesToBase64(payloadBytes)

    // Store pending invite for polling
    const inviteId = generateUUID()
    const invite: PendingInvite = {
      id: inviteId,
      groupUuid,
      groupName: group.name,
      tempIpnsPrivateKey: bytesToBase64(tempIpnsKeyPair.privateKey),
      tempIpnsPublicKey: bytesToBase64(tempIpnsKeyPair.publicKey),
      tempSymmetricKey: bytesToBase64(tempSymmetricKey),
      status: 'pending',
      createdAt: now(),
    }
    await savePendingInvite(invite)

    return { success: true, inviteLink, inviteId }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate invite link',
    }
  }
}

/**
 * Parse an invite link payload
 */
export function parseInviteLink(inviteLink: string): InviteLinkPayload | null {
  try {
    const payloadBytes = base64ToBytes(inviteLink)
    const payloadJson = new TextDecoder().decode(payloadBytes)
    return JSON.parse(payloadJson) as InviteLinkPayload
  } catch {
    return null
  }
}

// ============================================================================
// Join Request Flow
// ============================================================================

/**
 * Respond to an invite link (recipient side)
 * Publishes response to temp IPNS and returns emojis for verification
 */
export async function respondToInvite(inviteLink: string): Promise<{
  success: boolean
  emojis?: string[]
  error?: string
}> {
  try {
    const payload = parseInviteLink(inviteLink)
    if (!payload) {
      return { success: false, error: 'Invalid invite link' }
    }

    const deviceKeys = await getDeviceKeysAsBytes()
    if (!deviceKeys) {
      return { success: false, error: 'Device keys not configured' }
    }

    const provider = await getConfiguredProvider()
    if (!provider) {
      return { success: false, error: 'No provider configured' }
    }

    const config = await getSyncConfig()
    const selfPerson = await getSelfPerson()

    // Create response
    const response: InviteResponse = {
      recipientAuthPublicKey: bytesToBase64(deviceKeys.authPublicKey),
      recipientIpnsPublicKey: bytesToBase64(deviceKeys.ipnsPublicKey),
      recipientName: selfPerson?.name || config?.selfPersonUuid,
    }

    // Encrypt response with temp symmetric key
    const tempSymmetricKey = base64ToBytes(payload.tempSymmetricKey)
    const responseJson = JSON.stringify(response)
    const responseBytes = new TextEncoder().encode(responseJson)

    // Simple XOR encryption for the response (in real implementation, use AES-GCM)
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      tempSymmetricKey,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    )
    const encryptedResponse = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      responseBytes
    )

    // Combine IV + ciphertext
    const combined = new Uint8Array(iv.length + encryptedResponse.byteLength)
    combined.set(iv)
    combined.set(new Uint8Array(encryptedResponse), iv.length)

    // Upload to IPFS
    const { cid } = await provider.upload(combined, 'invite-response')

    // Publish to temp IPNS
    const tempIpnsPrivateKey = base64ToBytes(payload.tempIpnsPrivateKey)
    await provider.publishIpns(tempIpnsPrivateKey, cid)

    // Derive emojis from response hash
    const responseHash = await sha256(responseBytes)
    const emojis = deriveEmojis(responseHash)

    return { success: true, emojis }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to respond to invite',
    }
  }
}

/**
 * Poll for invite response (inviter side)
 */
export async function pollInviteResponse(inviteId: string): Promise<{
  success: boolean
  hasResponse: boolean
  emojis?: string[]
  recipientName?: string
  error?: string
}> {
  try {
    const invite = await getPendingInvite(inviteId)
    if (!invite) {
      return { success: false, hasResponse: false, error: 'Invite not found' }
    }

    if (invite.status !== 'pending') {
      return { success: false, hasResponse: false, error: 'Invite already processed' }
    }

    const provider = await getConfiguredProvider()
    if (!provider) {
      return { success: false, hasResponse: false, error: 'No provider configured' }
    }

    // Resolve temp IPNS
    const tempIpnsPublicKey = invite.tempIpnsPublicKey
    const cid = await provider.resolveIpns(tempIpnsPublicKey)

    if (!cid) {
      return { success: true, hasResponse: false }
    }

    // Fetch and decrypt response
    const encryptedData = await provider.fetch(cid)
    const tempSymmetricKey = base64ToBytes(invite.tempSymmetricKey)

    // Extract IV and ciphertext
    const iv = encryptedData.slice(0, 12)
    const ciphertext = encryptedData.slice(12)

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      tempSymmetricKey,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    )

    const decryptedBytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      ciphertext
    )

    const responseJson = new TextDecoder().decode(decryptedBytes)
    const response: InviteResponse = JSON.parse(responseJson)

    // Update invite with response
    await savePendingInvite({
      ...invite,
      status: 'responded',
      recipientAuthPublicKey: response.recipientAuthPublicKey,
      recipientIpnsPublicKey: response.recipientIpnsPublicKey,
      recipientName: response.recipientName,
      respondedAt: now(),
    })

    // Derive emojis for verification
    const responseBytes = new TextEncoder().encode(responseJson)
    const responseHash = await sha256(responseBytes)
    const emojis = deriveEmojis(responseHash)

    return {
      success: true,
      hasResponse: true,
      emojis,
      recipientName: response.recipientName,
    }
  } catch (error) {
    return {
      success: false,
      hasResponse: false,
      error: error instanceof Error ? error.message : 'Failed to poll invite response',
    }
  }
}

/**
 * Approve a join request (inviter side, after emoji verification)
 */
export async function approveJoinRequest(inviteId: string): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const invite = await getPendingInvite(inviteId)
    if (!invite) {
      return { success: false, error: 'Invite not found' }
    }

    if (invite.status !== 'responded') {
      return { success: false, error: 'Invite has not been responded to' }
    }

    if (!invite.recipientAuthPublicKey || !invite.recipientIpnsPublicKey) {
      return { success: false, error: 'Missing recipient keys' }
    }

    const deviceKeys = await getDeviceKeysAsBytes()
    if (!deviceKeys) {
      return { success: false, error: 'Device keys not configured' }
    }

    // Get group key to share
    const groupKey = await getGroupKeyAsBytes(invite.groupUuid)
    if (!groupKey) {
      return { success: false, error: 'Group key not found' }
    }

    // Create new person entry for recipient
    const personUuid = generateUUID()
    const timestamp = now()

    const newPerson: StoredPerson = {
      uuid: personUuid,
      name: invite.recipientName || 'New Member',
      devices: [
        {
          deviceId: await deriveDeviceId(base64ToBytes(invite.recipientAuthPublicKey)),
          ipnsPublicKey: invite.recipientIpnsPublicKey,
          authPublicKey: invite.recipientAuthPublicKey,
        },
      ],
      addedAt: timestamp,
      addedBy: (await getSelfPerson())?.uuid,
    }
    await savePerson(newPerson)

    // Add to group members
    const group = await db.groups.get(invite.groupUuid)
    if (group) {
      await db.groups.update(invite.groupUuid, {
        members: [...group.members, personUuid],
        updatedAt: timestamp,
      })
    }

    // Create person mutation
    const personData: Person = {
      uuid: personUuid,
      name: newPerson.name,
      devices: newPerson.devices?.map((d) => ({
        deviceId: d.deviceId,
        ipnsPublicKey: base64ToBytes(d.ipnsPublicKey),
        authPublicKey: base64ToBytes(d.authPublicKey),
      })),
      addedAt: timestamp,
      addedBy: (await getSelfPerson())?.uuid,
    }

    await createPersonMutation(personUuid, personData, deviceKeys)

    // Update invite status
    await savePendingInvite({
      ...invite,
      status: 'approved',
      approvedAt: timestamp,
    })

    // TODO: Update PeerDirectory to share Group Key with new member
    // This will be handled by the PeerDirectory update mechanism

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to approve join request',
    }
  }
}

/**
 * Reject a join request
 */
export async function rejectJoinRequest(inviteId: string): Promise<void> {
  const invite = await getPendingInvite(inviteId)
  if (invite) {
    await savePendingInvite({
      ...invite,
      status: 'rejected',
    })
  }
}

/**
 * Cancel a pending invite
 */
export async function cancelInvite(inviteId: string): Promise<void> {
  await deletePendingInvite(inviteId)
}

// ============================================================================
// Member Management
// ============================================================================

/**
 * Remove a member from a group
 */
export async function removeMember(
  groupUuid: string,
  personUuid: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const deviceKeys = await getDeviceKeysAsBytes()
    if (!deviceKeys) {
      return { success: false, error: 'Device keys not configured' }
    }

    const selfPerson = await getSelfPerson()
    if (!selfPerson) {
      return { success: false, error: 'Self person not configured' }
    }

    // Cannot remove self (use exitGroup instead)
    if (personUuid === selfPerson.uuid) {
      return { success: false, error: 'Cannot remove yourself. Use exit group instead.' }
    }

    // Create delete mutation
    const operation: DeleteOp = { type: 'delete' }

    const mutation = createSignedMutation(
      {
        id: Date.now(),
        targetUuid: personUuid,
        targetType: 'person',
        operation,
        timestamp: now(),
        authorDevicePublicKey: deviceKeys.authPublicKey,
      },
      deviceKeys.authPrivateKey
    )

    await queueMutation(serializeMutation(mutation))

    // Remove from local group
    const group = await db.groups.get(groupUuid)
    if (group) {
      await db.groups.update(groupUuid, {
        members: group.members.filter((m) => m !== personUuid),
        updatedAt: now(),
      })
    }

    // Rotate group key (security measure after removal)
    await rotateGroupKey(groupUuid)

    // TODO: Update PeerDirectory with new key for remaining members

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove member',
    }
  }
}

// ============================================================================
// Exit Group
// ============================================================================

/**
 * Exit a group voluntarily
 */
export async function exitGroup(groupUuid: string): Promise<{ success: boolean; error?: string }> {
  try {
    const deviceKeys = await getDeviceKeysAsBytes()
    if (!deviceKeys) {
      return { success: false, error: 'Device keys not configured' }
    }

    const selfPerson = await getSelfPerson()
    if (!selfPerson) {
      return { success: false, error: 'Self person not configured' }
    }

    const group = await db.groups.get(groupUuid)
    if (!group) {
      return { success: false, error: 'Group not found' }
    }

    // Cannot exit Personal Ledger
    if (group.name === PERSONAL_LEDGER_NAME) {
      return { success: false, error: 'Cannot exit Personal Ledger' }
    }

    // Create exit mutation
    const operation: ExitOp = { type: 'exit' }

    const mutation = createSignedMutation(
      {
        id: Date.now(),
        targetUuid: selfPerson.uuid,
        targetType: 'person',
        operation,
        timestamp: now(),
        authorDevicePublicKey: deviceKeys.authPublicKey,
      },
      deviceKeys.authPrivateKey
    )

    await queueMutation(serializeMutation(mutation))

    // Archive group locally (keep for reference but mark as exited)
    // For now, just remove from active groups
    // TODO: Add 'archivedGroups' table for historical data

    // Remove group key (can no longer decrypt new data)
    // Keep local data for reference

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to exit group',
    }
  }
}

// ============================================================================
// Internal Helpers
// ============================================================================

async function createGroupMutation(
  groupUuid: string,
  groupData: Group,
  deviceKeys: Awaited<ReturnType<typeof getDeviceKeysAsBytes>>
): Promise<void> {
  if (!deviceKeys) return

  const operation: CreateOp = {
    type: 'create',
    data: groupData as unknown as Record<string, unknown>,
  }

  const mutation = createSignedMutation(
    {
      id: Date.now(),
      targetUuid: groupUuid,
      targetType: 'group',
      operation,
      timestamp: now(),
      authorDevicePublicKey: deviceKeys.authPublicKey,
    },
    deviceKeys.authPrivateKey
  )

  await queueMutation(serializeMutation(mutation))
}

async function createPersonMutation(
  personUuid: string,
  personData: Person,
  deviceKeys: Awaited<ReturnType<typeof getDeviceKeysAsBytes>>
): Promise<void> {
  if (!deviceKeys) return

  const operation: CreateOp = {
    type: 'create',
    data: personData as unknown as Record<string, unknown>,
  }

  const mutation = createSignedMutation(
    {
      id: Date.now(),
      targetUuid: personUuid,
      targetType: 'person',
      operation,
      timestamp: now(),
      authorDevicePublicKey: deviceKeys.authPublicKey,
    },
    deviceKeys.authPrivateKey
  )

  await queueMutation(serializeMutation(mutation))
}

async function deriveDeviceId(authPublicKey: Uint8Array): Promise<string> {
  const hash = await sha256(authPublicKey)
  return Array.from(hash)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ============================================================================
// Polling Helpers
// ============================================================================

/**
 * Get all pending invites that need polling
 */
export async function getPendingInvitesToPoll(): Promise<PendingInvite[]> {
  return getPendingInvitesByStatus('pending')
}

/**
 * Get all responded invites awaiting approval
 */
export async function getRespondedInvites(): Promise<PendingInvite[]> {
  return getPendingInvitesByStatus('responded')
}
