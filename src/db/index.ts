import Dexie, { type EntityTable } from 'dexie'
import type { ExpenseRecord, User, Group, Settings } from '../types'
import { DEFAULT_GROUP_UUID } from '../types'

const db = new Dexie('RecordMoney') as Dexie & {
  records: EntityTable<ExpenseRecord, 'uuid'>
  users: EntityTable<User, 'email'>
  groups: EntityTable<Group, 'uuid'>
  settings: EntityTable<Settings, 'key'>
}

db.version(1).stores({
  records: 'uuid, groupId, date, category, sourceHash',
  users: 'email',
  groups: 'uuid',
  settings: 'key',
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
      lastUsedCurrency: 'INR',
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
      lastUsedCurrency: 'INR',
      theme: 'system',
    })
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
