import Dexie, { type EntityTable } from 'dexie'
import type {
  ExpenseRecord,
  User,
  Group,
  Settings,
  ExchangeRates,
  Category,
  Account,
  DeviceKeys,
  SyncConfig,
  QueuedMutation,
  PeerSyncState,
  StoredConflict,
  StoredGroupKey,
  StoredPerson,
  PendingInvite,
} from '../types'
import { DEFAULT_GROUP_UUID } from '../types'
import { DEFAULT_CATEGORIES } from '../constants/categories'

const db = new Dexie('RecordMoney') as Dexie & {
  records: EntityTable<ExpenseRecord, 'uuid'>
  users: EntityTable<User, 'email'>
  groups: EntityTable<Group, 'uuid'>
  settings: EntityTable<Settings, 'key'>
  exchangeRates: EntityTable<ExchangeRates, 'key'>
  categories: EntityTable<Category, 'id'>
  accounts: EntityTable<Account, 'id'>
  // Sync-related tables
  deviceKeys: EntityTable<DeviceKeys, 'key'>
  syncConfig: EntityTable<SyncConfig, 'key'>
  mutationQueue: EntityTable<QueuedMutation, 'id'>
  peerSyncState: EntityTable<PeerSyncState, 'deviceId'>
  conflicts: EntityTable<StoredConflict, 'id'>
  // Group sync tables
  groupKeys: EntityTable<StoredGroupKey, 'groupUuid'>
  people: EntityTable<StoredPerson, 'uuid'>
  pendingInvites: EntityTable<PendingInvite, 'id'>
}

db.version(1).stores({
  records: 'uuid, groupId, date, category, sourceHash',
  users: 'email',
  groups: 'uuid',
  settings: 'key',
})

db.version(2).stores({
  records: 'uuid, groupId, date, category, sourceHash',
  users: 'email',
  groups: 'uuid',
  settings: 'key',
  exchangeRates: 'key',
})

db.version(3).stores({
  records: 'uuid, groupId, date, category, sourceHash',
  users: 'email',
  groups: 'uuid',
  settings: 'key',
  exchangeRates: 'key',
  categories: 'id, name, isSystem',
})

db.version(4).stores({
  records: 'uuid, groupId, date, category, sourceHash, account',
  users: 'email',
  groups: 'uuid',
  settings: 'key',
  exchangeRates: 'key',
  categories: 'id, name, isSystem',
  accounts: 'id, name',
})

// Version 5: Add sync-related tables
db.version(5).stores({
  records: 'uuid, groupId, date, category, sourceHash, account',
  users: 'email',
  groups: 'uuid',
  settings: 'key',
  exchangeRates: 'key',
  categories: 'id, name, isSystem',
  accounts: 'id, name',
  // Sync tables
  deviceKeys: 'key',
  syncConfig: 'key',
  mutationQueue: '++id, status',
  peerSyncState: 'deviceId',
})

// Version 6: Add conflicts table
db.version(6).stores({
  records: 'uuid, groupId, date, category, sourceHash, account',
  users: 'email',
  groups: 'uuid',
  settings: 'key',
  exchangeRates: 'key',
  categories: 'id, name, isSystem',
  accounts: 'id, name',
  // Sync tables
  deviceKeys: 'key',
  syncConfig: 'key',
  mutationQueue: '++id, status',
  peerSyncState: 'deviceId',
  conflicts: 'id, status, targetUuid',
})

// Version 7: Add group sync tables
db.version(7).stores({
  records: 'uuid, groupId, date, category, sourceHash, account',
  users: 'email',
  groups: 'uuid',
  settings: 'key',
  exchangeRates: 'key',
  categories: 'id, name, isSystem',
  accounts: 'id, name',
  // Sync tables
  deviceKeys: 'key',
  syncConfig: 'key',
  mutationQueue: '++id, status',
  peerSyncState: 'deviceId',
  conflicts: 'id, status, targetUuid',
  // Group sync tables
  groupKeys: 'groupUuid',
  people: 'uuid, isSelf',
  pendingInvites: 'id, groupUuid, status',
})

export { db }

// Helper to generate UUID
export function generateUUID(): string {
  return crypto.randomUUID()
}

// Email normalization
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim()
}

// Get current timestamp
export function now(): number {
  return Date.now()
}

// Get current date in YYYY-MM-DD format
export function getCurrentDate(): string {
  return new Date().toISOString().split('T')[0]
}

// Get current time in HH:MM format
export function getCurrentTime(): string {
  return new Date().toTimeString().slice(0, 5)
}

// Settings helpers
export async function getSettings(): Promise<Settings | undefined> {
  return db.settings.get('main')
}

export async function updateSettings(updates: Partial<Omit<Settings, 'key'>>): Promise<void> {
  const existing = await getSettings()
  if (existing) {
    await db.settings.update('main', updates)
  } else {
    await db.settings.add({
      key: 'main',
      autoApplyAiChanges: false,
      enableAiMemory: true,
      lastUsedCurrency: 'INR',
      defaultDisplayCurrency: 'INR',
      theme: 'system',
      ...updates,
    })
  }
}

// Initialize default settings if not exists
export async function initializeSettings(): Promise<void> {
  const settings = await getSettings()
  if (!settings) {
    await db.settings.add({
      key: 'main',
      autoApplyAiChanges: false,
      enableAiMemory: true,
      lastUsedCurrency: 'INR',
      defaultDisplayCurrency: 'INR',
      theme: 'system',
    })
  } else {
    // Migrations for existing users
    const migrations: Partial<Settings> = {}
    if (!settings.defaultDisplayCurrency) {
      migrations.defaultDisplayCurrency = 'INR'
    }
    if (settings.enableAiMemory === undefined) {
      migrations.enableAiMemory = true
    }
    if (Object.keys(migrations).length > 0) {
      await db.settings.update('main', migrations)
    }
  }
}

// Initialize default group if not exists
export async function initializeDefaultGroup(): Promise<void> {
  const defaultGroup = await db.groups.get(DEFAULT_GROUP_UUID)
  if (!defaultGroup) {
    const timestamp = now()
    await db.groups.add({
      uuid: DEFAULT_GROUP_UUID,
      name: 'Ungrouped',
      members: [],
      isDefault: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  }
}

// Initialize default categories if not exists
export async function initializeDefaultCategories(): Promise<void> {
  const existingCategories = await db.categories.count()
  if (existingCategories === 0) {
    await db.categories.bulkAdd(DEFAULT_CATEGORIES)
  }
}

// Migrate records with null groupId to default group
export async function migrateUngroupedRecords(): Promise<void> {
  const ungroupedRecords = await db.records.where('groupId').equals('').toArray()
  const nullGroupRecords = await db.records.filter((r) => r.groupId === null).toArray()
  const allUngrouped = [...ungroupedRecords, ...nullGroupRecords]

  for (const record of allUngrouped) {
    await db.records.update(record.uuid, { groupId: DEFAULT_GROUP_UUID })
  }
}

// Get default group
export async function getDefaultGroup(): Promise<Group | undefined> {
  return db.groups.get(DEFAULT_GROUP_UUID)
}

// Add a new user
export async function addUser(
  email: string,
  alias: string
): Promise<{ success: true; email: string } | { success: false; error: string }> {
  const normalizedEmail = normalizeEmail(email)

  if (!normalizedEmail) {
    return { success: false, error: 'Email is required' }
  }

  if (!alias.trim()) {
    return { success: false, error: 'Name is required' }
  }

  const existing = await db.users.get(normalizedEmail)
  if (existing) {
    return { success: false, error: 'User with this email already exists' }
  }

  await db.users.add({
    email: normalizedEmail,
    alias: alias.trim(),
  })

  return { success: true, email: normalizedEmail }
}

// Change a user's email and update all references
export async function changeUserEmail(
  oldEmail: string,
  newEmail: string,
  onProgress?: (current: number, total: number) => void
): Promise<{ success: boolean; error?: string }> {
  const normalizedOld = normalizeEmail(oldEmail)
  const normalizedNew = normalizeEmail(newEmail)

  if (normalizedOld === normalizedNew) {
    return { success: true } // No change needed
  }

  if (!normalizedNew) {
    return { success: false, error: 'New email is required' }
  }

  // Check if new email already exists
  const existing = await db.users.get(normalizedNew)
  if (existing) {
    return { success: false, error: 'Email already in use by another user' }
  }

  // Get user to preserve alias
  const user = await db.users.get(normalizedOld)
  if (!user) {
    return { success: false, error: 'User not found' }
  }

  // Get all data that needs updating
  const records = await db.records.toArray()
  const groups = await db.groups.toArray()
  const settings = await db.settings.get('main')

  // Calculate total operations for progress tracking
  let total = 0
  let current = 0

  // Count records that need updating
  for (const record of records) {
    const hasPaidBy = record.paidBy.some((p) => p.email === normalizedOld)
    const hasPaidFor = record.paidFor.some((p) => p.email === normalizedOld)
    if (hasPaidBy || hasPaidFor) total++
  }

  // Count groups that need updating
  for (const group of groups) {
    if (group.members.includes(normalizedOld)) total++
  }

  // Count settings update if needed
  if (settings?.currentUserEmail === normalizedOld) total++

  // Add 2 for delete old + add new user
  total += 2

  // Update records
  for (const record of records) {
    const hasPaidBy = record.paidBy.some((p) => p.email === normalizedOld)
    const hasPaidFor = record.paidFor.some((p) => p.email === normalizedOld)

    if (hasPaidBy || hasPaidFor) {
      const newPaidBy = record.paidBy.map((p) =>
        p.email === normalizedOld ? { ...p, email: normalizedNew } : p
      )
      const newPaidFor = record.paidFor.map((p) =>
        p.email === normalizedOld ? { ...p, email: normalizedNew } : p
      )

      await db.records.update(record.uuid, {
        paidBy: newPaidBy,
        paidFor: newPaidFor,
        updatedAt: now(),
      })

      current++
      onProgress?.(current, total)
    }
  }

  // Update groups
  for (const group of groups) {
    if (group.members.includes(normalizedOld)) {
      const newMembers = group.members.map((m) => (m === normalizedOld ? normalizedNew : m))
      await db.groups.update(group.uuid, {
        members: newMembers,
        updatedAt: now(),
      })

      current++
      onProgress?.(current, total)
    }
  }

  // Update settings if this user is "Me"
  if (settings?.currentUserEmail === normalizedOld) {
    await db.settings.update('main', { currentUserEmail: normalizedNew })
    current++
    onProgress?.(current, total)
  }

  // Delete old user
  await db.users.delete(normalizedOld)
  current++
  onProgress?.(current, total)

  // Add new user with same alias
  await db.users.add({ email: normalizedNew, alias: user.alias })
  current++
  onProgress?.(current, total)

  return { success: true }
}

// ============================================================================
// Sync-related helpers
// ============================================================================

// Device keys
export async function getDeviceKeys(): Promise<DeviceKeys | undefined> {
  return db.deviceKeys.get('device-keys')
}

export async function saveDeviceKeys(keys: Omit<DeviceKeys, 'key'>): Promise<void> {
  await db.deviceKeys.put({ key: 'device-keys', ...keys })
}

// Sync config
export async function getSyncConfig(): Promise<SyncConfig | undefined> {
  return db.syncConfig.get('sync-config')
}

export async function updateSyncConfig(updates: Partial<Omit<SyncConfig, 'key'>>): Promise<void> {
  const existing = await getSyncConfig()
  if (existing) {
    await db.syncConfig.update('sync-config', updates)
  } else {
    await db.syncConfig.add({
      key: 'sync-config',
      mode: 'solo',
      migrated: false,
      ...updates,
    })
  }
}

export async function initializeSyncConfig(): Promise<void> {
  const config = await getSyncConfig()
  if (!config) {
    await db.syncConfig.add({
      key: 'sync-config',
      mode: 'solo',
      migrated: false,
    })
  }
}

// Mutation queue
export async function getNextMutationId(): Promise<number> {
  const lastMutation = await db.mutationQueue.orderBy('id').last()
  return lastMutation ? lastMutation.id + 1 : 1
}

export async function queueMutation(mutationJson: string): Promise<number> {
  return db.mutationQueue.add({
    mutationJson,
    status: 'pending',
    createdAt: now(),
  } as QueuedMutation)
}

export async function getPendingMutations(): Promise<QueuedMutation[]> {
  return db.mutationQueue.where('status').equals('pending').sortBy('id')
}

export async function markMutationsPublished(ids: number[]): Promise<void> {
  const timestamp = now()
  await db.mutationQueue.where('id').anyOf(ids).modify({
    status: 'published',
    publishedAt: timestamp,
  })
}

// Peer sync state
export async function getPeerSyncState(deviceId: string): Promise<PeerSyncState | undefined> {
  return db.peerSyncState.get(deviceId)
}

export async function updatePeerSyncState(
  deviceId: string,
  updates: Partial<Omit<PeerSyncState, 'deviceId'>>
): Promise<void> {
  const existing = await getPeerSyncState(deviceId)
  if (existing) {
    await db.peerSyncState.update(deviceId, updates)
  } else {
    await db.peerSyncState.add({
      deviceId,
      ipnsPublicKey: '',
      lastSyncedId: 0,
      lastSyncedAt: 0,
      consecutiveFailures: 0,
      ...updates,
    } as PeerSyncState)
  }
}

export async function getAllPeerSyncStates(): Promise<PeerSyncState[]> {
  return db.peerSyncState.toArray()
}

// ============================================================================
// Group sync helpers
// ============================================================================

// Group keys
export async function getGroupKey(groupUuid: string): Promise<StoredGroupKey | undefined> {
  return db.groupKeys.get(groupUuid)
}

export async function saveGroupKey(groupKey: StoredGroupKey): Promise<void> {
  await db.groupKeys.put(groupKey)
}

export async function deleteGroupKey(groupUuid: string): Promise<void> {
  await db.groupKeys.delete(groupUuid)
}

export async function getAllGroupKeys(): Promise<StoredGroupKey[]> {
  return db.groupKeys.toArray()
}

// People
export async function getPerson(uuid: string): Promise<StoredPerson | undefined> {
  return db.people.get(uuid)
}

export async function savePerson(person: StoredPerson): Promise<void> {
  await db.people.put(person)
}

export async function deletePerson(uuid: string): Promise<void> {
  await db.people.delete(uuid)
}

export async function getSelfPerson(): Promise<StoredPerson | undefined> {
  return db.people.where('isSelf').equals(1).first()
}

export async function getAllPeople(): Promise<StoredPerson[]> {
  return db.people.toArray()
}

// Pending invites
export async function getPendingInvite(id: string): Promise<PendingInvite | undefined> {
  return db.pendingInvites.get(id)
}

export async function savePendingInvite(invite: PendingInvite): Promise<void> {
  await db.pendingInvites.put(invite)
}

export async function deletePendingInvite(id: string): Promise<void> {
  await db.pendingInvites.delete(id)
}

export async function getPendingInvitesByGroup(groupUuid: string): Promise<PendingInvite[]> {
  return db.pendingInvites.where('groupUuid').equals(groupUuid).toArray()
}

export async function getPendingInvitesByStatus(
  status: PendingInvite['status']
): Promise<PendingInvite[]> {
  return db.pendingInvites.where('status').equals(status).toArray()
}

export async function getAllPendingInvites(): Promise<PendingInvite[]> {
  return db.pendingInvites.toArray()
}
