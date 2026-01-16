import Dexie, { type EntityTable } from 'dexie'
import type {
  ExpenseRecord,
  User,
  Group,
  Settings,
  ExchangeRates,
  Category,
  Account,
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
