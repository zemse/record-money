/**
 * Group Sync Service
 *
 * Handles GroupManifest publishing and polling for group data sync:
 * - Publishes own GroupManifest with group mutations
 * - Polls other members' GroupManifests
 * - Fetches and applies group mutations
 */

import {
  db,
  now,
  getGroupKey,
  getAllGroupKeys,
  getSelfPerson,
  getAllPeople,
  updatePeerSyncState,
  getPeerSyncState,
} from '../db'
import { getDeviceKeysAsBytes, getConfiguredProvider } from './device-setup'
import { deserializeMutation, verifyMutation } from './mutations'
import {
  createEncryptedMutationChunk,
  createMutationChunk,
  createEncryptedGroupManifest,
  decryptGroupManifest,
} from './schemas'
import { base64ToBytes } from './crypto'
import type { GroupManifest, Mutation, MutationChunks, Group, Person } from './types'
import type { StoredPerson } from '../types'

// ============================================================================
// Types
// ============================================================================

export interface GroupSyncResult {
  success: boolean
  groupUuid: string
  newMutations: number
  error?: string
}

export interface PublishGroupManifestResult {
  success: boolean
  manifestCid?: string
  error?: string
}

// ============================================================================
// GroupManifest Publishing
// ============================================================================

/**
 * Publish GroupManifest for a specific group
 */
export async function publishGroupManifest(groupUuid: string): Promise<PublishGroupManifestResult> {
  try {
    const deviceKeys = await getDeviceKeysAsBytes()
    if (!deviceKeys) {
      return { success: false, error: 'Device keys not configured' }
    }

    const provider = await getConfiguredProvider()
    if (!provider) {
      return { success: false, error: 'No provider configured' }
    }

    const groupKeyData = await getGroupKey(groupUuid)
    if (!groupKeyData) {
      return { success: false, error: 'Group key not found' }
    }

    const groupKey = base64ToBytes(groupKeyData.symmetricKey)
    const group = await db.groups.get(groupUuid)
    if (!group) {
      return { success: false, error: 'Group not found' }
    }

    // Get all mutations for this group from queue
    const allMutations = await db.mutationQueue.toArray()
    const groupMutations = allMutations
      .filter((m) => {
        try {
          const mutation = deserializeMutation(m.mutationJson)
          // Filter mutations related to this group
          // This includes group mutations, person mutations for members, and record mutations with this groupId
          return (
            (mutation.targetType === 'group' && mutation.targetUuid === groupUuid) ||
            (mutation.targetType === 'person' && group.members.includes(mutation.targetUuid)) ||
            (mutation.targetType === 'record' && isRecordForGroup(mutation, groupUuid))
          )
        } catch {
          return false
        }
      })
      .map((m) => deserializeMutation(m.mutationJson))

    // Build chunk index
    const chunkIndex: MutationChunks = []
    let latestMutationId = 0

    if (groupMutations.length > 0) {
      const startId = Math.min(...groupMutations.map((m) => m.id))
      const endId = Math.max(...groupMutations.map((m) => m.id))
      latestMutationId = endId

      // Encrypt mutations chunk
      const encryptedChunk = await createEncryptedMutationChunk(groupMutations, groupKey)
      const { cid: chunkCid } = await provider.upload(
        encryptedChunk,
        `group-${groupUuid}-mutations-${startId}-${endId}`
      )

      chunkIndex.push(createMutationChunk(startId, endId, chunkCid))
    }

    // Get group database (records and people)
    const records = await db.records.where('groupId').equals(groupUuid).toArray()
    const people = await getAllPeople()
    const groupPeople = people.filter((p) => group.members.includes(p.uuid))

    // Create group manifest
    const manifest: GroupManifest = {
      group: {
        uuid: group.uuid,
        name: group.name,
        createdAt: group.createdAt,
        createdBy: group.members[0], // First member is creator
        protocolVersion: 1,
      },
      database: {
        records: records.map((r) => ({
          uuid: r.uuid,
          title: r.title,
          description: r.description,
          category: r.category,
          amount: r.amount,
          currency: r.currency,
          date: r.date,
          time: r.time,
          icon: r.icon,
          paidBy: r.paidBy.map((p) => ({ personUuid: p.email, share: p.share })),
          paidFor: r.paidFor.map((p) => ({ personUuid: p.email, share: p.share })),
          shareType: r.shareType,
          groupId: r.groupId,
          accounts: r.accounts,
          comments: r.comments,
          sourceHash: r.sourceHash,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
        people: groupPeople.map((p) => storedPersonToPerson(p)),
      },
      chunkIndex,
      latestMutationId,
    }

    // Encrypt manifest
    const encrypted = await createEncryptedGroupManifest(manifest, groupKey)

    // Upload to IPFS
    const { cid: manifestCid } = await provider.upload(encrypted, `group-${groupUuid}-manifest`)

    // TODO: Publish to IPNS for this group
    // For now, the CID is stored and shared via PeerDirectory

    return { success: true, manifestCid }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to publish group manifest',
    }
  }
}

// ============================================================================
// GroupManifest Polling
// ============================================================================

/**
 * Sync a group by polling all members' manifests
 */
export async function syncGroup(groupUuid: string): Promise<GroupSyncResult> {
  try {
    const deviceKeys = await getDeviceKeysAsBytes()
    if (!deviceKeys) {
      return { success: false, groupUuid, newMutations: 0, error: 'Device keys not configured' }
    }

    const provider = await getConfiguredProvider()
    if (!provider) {
      return { success: false, groupUuid, newMutations: 0, error: 'No provider configured' }
    }

    const groupKeyData = await getGroupKey(groupUuid)
    if (!groupKeyData) {
      return { success: false, groupUuid, newMutations: 0, error: 'Group key not found' }
    }

    const groupKey = base64ToBytes(groupKeyData.symmetricKey)
    const group = await db.groups.get(groupUuid)
    if (!group) {
      return { success: false, groupUuid, newMutations: 0, error: 'Group not found' }
    }

    const selfPerson = await getSelfPerson()
    if (!selfPerson) {
      return { success: false, groupUuid, newMutations: 0, error: 'Self person not configured' }
    }

    // Get all people in the group
    const allPeople = await getAllPeople()
    const groupMembers = allPeople.filter((p) => group.members.includes(p.uuid) && !p.isSelf)

    let totalNewMutations = 0

    // Poll each member's manifest
    for (const member of groupMembers) {
      if (!member.devices || member.devices.length === 0) continue

      for (const device of member.devices) {
        try {
          const result = await syncFromDevice(groupUuid, groupKey, device, member)
          totalNewMutations += result.newMutations
        } catch (error) {
          console.error(`Failed to sync from device ${device.deviceId}:`, error)
        }
      }
    }

    return { success: true, groupUuid, newMutations: totalNewMutations }
  } catch (error) {
    return {
      success: false,
      groupUuid,
      newMutations: 0,
      error: error instanceof Error ? error.message : 'Failed to sync group',
    }
  }
}

/**
 * Sync from a specific device
 */
async function syncFromDevice(
  groupUuid: string,
  groupKey: Uint8Array,
  device: StoredPerson['devices'][0],
  member: StoredPerson
): Promise<{ newMutations: number }> {
  const provider = await getConfiguredProvider()
  if (!provider) {
    return { newMutations: 0 }
  }

  // Resolve device's IPNS
  const manifestCid = await provider.resolveIpns(device.ipnsPublicKey)
  if (!manifestCid) {
    return { newMutations: 0 }
  }

  // Get last synced state
  const syncState = await getPeerSyncState(device.deviceId)
  const lastSyncedId = syncState?.lastSyncedId || 0

  // Fetch and decrypt manifest
  const encryptedManifest = await provider.fetch(manifestCid)
  let manifest: GroupManifest

  try {
    manifest = await decryptGroupManifest(encryptedManifest, groupKey)
  } catch {
    // Failed to decrypt - might be old key or wrong group
    return { newMutations: 0 }
  }

  // Check if this manifest is for our group
  if (manifest.group.uuid !== groupUuid) {
    return { newMutations: 0 }
  }

  // No new mutations
  if (manifest.latestMutationId <= lastSyncedId) {
    return { newMutations: 0 }
  }

  // Fetch new mutation chunks
  let newMutations = 0
  const memberAuthPublicKey = base64ToBytes(device.authPublicKey)

  for (const chunk of manifest.chunkIndex) {
    if (chunk.endId <= lastSyncedId) continue

    // Fetch and decrypt chunk
    const encryptedChunk = await provider.fetch(chunk.cid)
    const iv = encryptedChunk.slice(0, 12)
    const ciphertext = encryptedChunk.slice(12)

    const cryptoKey = await crypto.subtle.importKey('raw', groupKey, { name: 'AES-GCM' }, false, [
      'decrypt',
    ])

    const decryptedBytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      ciphertext
    )

    const chunkJson = new TextDecoder().decode(decryptedBytes)
    const mutations: Mutation[] = JSON.parse(chunkJson)

    // Verify and apply mutations
    for (const mutation of mutations) {
      if (mutation.id <= lastSyncedId) continue

      // Verify signature
      const isValid = await verifyMutation(mutation, memberAuthPublicKey)
      if (!isValid) {
        console.warn(`Invalid mutation signature from ${device.deviceId}:`, mutation.uuid)
        continue
      }

      // Apply mutation (TODO: integrate with mutation application logic)
      // For now, just count it
      newMutations++
    }
  }

  // Update sync state
  await updatePeerSyncState(device.deviceId, {
    ipnsPublicKey: device.ipnsPublicKey,
    lastSyncedId: manifest.latestMutationId,
    lastSyncedAt: now(),
    consecutiveFailures: 0,
  })

  return { newMutations }
}

/**
 * Sync all groups
 */
export async function syncAllGroups(): Promise<{
  success: boolean
  results: GroupSyncResult[]
}> {
  const groupKeys = await getAllGroupKeys()
  const results: GroupSyncResult[] = []

  for (const groupKey of groupKeys) {
    const result = await syncGroup(groupKey.groupUuid)
    results.push(result)
  }

  return {
    success: results.every((r) => r.success),
    results,
  }
}

// ============================================================================
// Helpers
// ============================================================================

function isRecordForGroup(mutation: Mutation, groupUuid: string): boolean {
  if (mutation.operation.type !== 'create' && mutation.operation.type !== 'update') {
    return false
  }

  if (mutation.operation.type === 'create') {
    const data = mutation.operation.data as { groupId?: string }
    return data.groupId === groupUuid
  }

  return false
}

function storedPersonToPerson(stored: StoredPerson): Person {
  return {
    uuid: stored.uuid,
    name: stored.name,
    email: stored.email,
    devices: stored.devices?.map((d) => ({
      deviceId: d.deviceId,
      ipnsPublicKey: base64ToBytes(d.ipnsPublicKey),
      authPublicKey: base64ToBytes(d.authPublicKey),
    })),
    addedAt: stored.addedAt,
    addedBy: stored.addedBy,
    isSelf: stored.isSelf,
    isPlaceholder: stored.isPlaceholder,
  }
}

// ============================================================================
// Invite Existing Peer (via PeerDirectory)
// ============================================================================

/**
 * Invite an existing peer to a group
 * This shares the group key via PeerDirectory
 */
export async function inviteExistingPeer(
  groupUuid: string,
  personUuid: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const group = await db.groups.get(groupUuid)
    if (!group) {
      return { success: false, error: 'Group not found' }
    }

    const person = await db.people.get(personUuid)
    if (!person) {
      return { success: false, error: 'Person not found' }
    }

    // Check if already a member
    if (group.members.includes(personUuid)) {
      return { success: false, error: 'Person is already a member' }
    }

    // Add to group members
    await db.groups.update(groupUuid, {
      members: [...group.members, personUuid],
      updatedAt: now(),
    })

    // TODO: Update PeerDirectory to share group key with this person
    // The group key will be added to their PeerDirectoryPayload.sharedGroups

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to invite peer',
    }
  }
}
