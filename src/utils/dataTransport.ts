import type { ExpenseRecord, User, Group } from '../types'

// Payload structures for import/export
export interface UrlPayload {
  version: 1
  records: ExpenseRecord[]
  users: User[]
}

export interface FilePayload {
  version: 1
  exportedAt: number
  records: ExpenseRecord[]
  users: User[]
  groups?: Group[]
}

// Max URL length for browser compatibility
const MAX_URL_LENGTH = 2000

// Max records allowed in a single import to prevent storage DoS
const MAX_IMPORT_RECORDS = 10000

// Max users allowed in a single import to prevent storage DoS
const MAX_IMPORT_USERS = 10000

const ALLOWED_IMPORT_CURRENCIES = new Set([
  'INR',
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'AUD',
  'CAD',
  'SGD',
  'AED',
  'THB',
])
const ALLOWED_SHARE_TYPES = new Set(['equal', 'percentage', 'exact', 'shares'])
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// URL-safe base64 encoding (replaces + with -, / with _, removes padding =)
function toUrlSafeBase64(str: string): string {
  const base64 = btoa(unescape(encodeURIComponent(str)))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// URL-safe base64 decoding
function fromUrlSafeBase64(str: string): string {
  // Restore standard base64 characters
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  // Add back padding if needed
  const pad = base64.length % 4
  if (pad) {
    base64 += '='.repeat(4 - pad)
  }
  return decodeURIComponent(escape(atob(base64)))
}

function validateParticipant(p: unknown, context: string): string | null {
  if (typeof p !== 'object' || p === null) return `${context}: not an object`
  const part = p as Record<string, unknown>
  if (typeof part.email !== 'string' || !part.email) return `${context}: missing email`
  if (typeof part.share !== 'number' || isNaN(part.share)) return `${context}: invalid share`
  return null
}

function isValidCalendarDate(dateString: string): boolean {
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function validateRecord(r: unknown, index: number): string | null {
  if (typeof r !== 'object' || r === null) return `Record ${index}: not an object`
  const rec = r as Record<string, unknown>

  if (typeof rec.uuid !== 'string' || !rec.uuid) return `Record ${index}: missing uuid`
  if (!UUID_REGEX.test(rec.uuid)) return `Record ${index}: invalid uuid format`
  if (typeof rec.title !== 'string' || !rec.title) return `Record ${index}: missing title`
  if (typeof rec.description !== 'string') return `Record ${index}: invalid description`
  if (typeof rec.category !== 'string') return `Record ${index}: invalid category`
  if (typeof rec.amount !== 'number' || isNaN(rec.amount) || rec.amount < 0 || !isFinite(rec.amount)) return `Record ${index}: invalid amount`
  if (
    typeof rec.currency !== 'string' ||
    rec.currency.length !== 3 ||
    rec.currency !== rec.currency.toUpperCase() ||
    !ALLOWED_IMPORT_CURRENCIES.has(rec.currency)
  ) {
    return `Record ${index}: invalid currency`
  }
  if (typeof rec.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(rec.date)) return `Record ${index}: invalid date format`
  if (!isValidCalendarDate(rec.date)) return `Record ${index}: invalid date`
  if (typeof rec.time !== 'string') return `Record ${index}: invalid time`
  if (typeof rec.icon !== 'string') return `Record ${index}: invalid icon`
  if (!Array.isArray(rec.paidBy) || rec.paidBy.length === 0) return `Record ${index}: missing paidBy`
  if (!Array.isArray(rec.paidFor) || rec.paidFor.length === 0) return `Record ${index}: missing paidFor`
  if (typeof rec.shareType !== 'string' || !ALLOWED_SHARE_TYPES.has(rec.shareType)) {
    return `Record ${index}: invalid shareType`
  }
  if (rec.groupId !== null && typeof rec.groupId !== 'string') return `Record ${index}: invalid groupId`
  if (typeof rec.comments !== 'string') return `Record ${index}: invalid comments`

  for (let i = 0; i < rec.paidBy.length; i++) {
    const err = validateParticipant(rec.paidBy[i], `Record ${index} paidBy[${i}]`)
    if (err) return err
  }
  for (let i = 0; i < rec.paidFor.length; i++) {
    const err = validateParticipant(rec.paidFor[i], `Record ${index} paidFor[${i}]`)
    if (err) return err
  }

  if (typeof rec.createdAt !== 'number') return `Record ${index}: missing createdAt`
  if (typeof rec.updatedAt !== 'number') return `Record ${index}: missing updatedAt`

  return null
}

export function validateUser(u: unknown, index: number): string | null {
  if (typeof u !== 'object' || u === null) return `User ${index}: not an object`
  const user = u as Record<string, unknown>
  if (typeof user.email !== 'string' || !user.email) return `User ${index}: missing email`
  if (typeof user.alias !== 'string') return `User ${index}: missing alias`
  return null
}

function validateRecordsAndUsers(
  records: unknown[],
  users: unknown[]
): string | null {
  if (records.length > MAX_IMPORT_RECORDS) {
    return `Too many records (${records.length}). Maximum allowed is ${MAX_IMPORT_RECORDS}.`
  }
  if (users.length > MAX_IMPORT_USERS) {
    return `Too many users (${users.length}). Maximum allowed is ${MAX_IMPORT_USERS}.`
  }

  for (let i = 0; i < records.length; i++) {
    const err = validateRecord(records[i], i)
    if (err) return err
  }
  for (let i = 0; i < users.length; i++) {
    const err = validateUser(users[i], i)
    if (err) return err
  }
  return null
}

// Generate export URL
export function generateExportUrl(
  records: ExpenseRecord[],
  users: User[],
  baseUrl: string = window.location.origin
): { success: true; url: string } | { success: false; error: string } {
  const payload: UrlPayload = {
    version: 1,
    records,
    users,
  }

  const json = JSON.stringify(payload)
  const encoded = toUrlSafeBase64(json)
  const url = `${baseUrl}/import?data=${encoded}`

  if (url.length > MAX_URL_LENGTH) {
    return {
      success: false,
      error: `URL too long (${url.length} chars). Use file export instead.`,
    }
  }

  return { success: true, url }
}

// Parse import URL
export function parseImportUrl(
  urlOrData: string
): { success: true; payload: UrlPayload } | { success: false; error: string } {
  try {
    let data: string

    // Check if full URL or just data
    if (urlOrData.includes('?data=')) {
      const url = new URL(urlOrData)
      data = url.searchParams.get('data') || ''
    } else {
      data = urlOrData
    }

    if (!data) {
      return { success: false, error: 'No data found in URL' }
    }

    const json = fromUrlSafeBase64(data)
    const payload = JSON.parse(json) as UrlPayload

    // Validate version
    if (payload.version !== 1) {
      return { success: false, error: `Unsupported version: ${payload.version}` }
    }

    // Basic validation
    if (!Array.isArray(payload.records)) {
      return { success: false, error: 'Invalid payload: records is not an array' }
    }

    if (!Array.isArray(payload.users)) {
      return { success: false, error: 'Invalid payload: users is not an array' }
    }

    const validationError = validateRecordsAndUsers(payload.records, payload.users)
    if (validationError) {
      return { success: false, error: `Invalid payload: ${validationError}` }
    }

    return { success: true, payload }
  } catch (e) {
    return {
      success: false,
      error: `Failed to parse: ${e instanceof Error ? e.message : 'Unknown error'}`,
    }
  }
}

// Export to file
export function exportToFile(
  records: ExpenseRecord[],
  users: User[],
  groups?: Group[],
  filename?: string
): void {
  const payload: FilePayload = {
    version: 1,
    exportedAt: Date.now(),
    records,
    users,
    ...(groups && groups.length > 0 ? { groups } : {}),
  }

  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = filename || `export-${Date.now()}.recordmoney`
  a.click()

  URL.revokeObjectURL(url)
}

// Parse file content
export function parseFileContent(
  content: string
): { success: true; payload: FilePayload } | { success: false; error: string } {
  try {
    const payload = JSON.parse(content) as FilePayload

    // Validate version
    if (payload.version !== 1) {
      return { success: false, error: `Unsupported version: ${payload.version}` }
    }

    // Basic validation
    if (!Array.isArray(payload.records)) {
      return { success: false, error: 'Invalid payload: records is not an array' }
    }

    if (!Array.isArray(payload.users)) {
      return { success: false, error: 'Invalid payload: users is not an array' }
    }

    const validationError = validateRecordsAndUsers(payload.records, payload.users)
    if (validationError) {
      return { success: false, error: `Invalid payload: ${validationError}` }
    }

    return { success: true, payload }
  } catch (e) {
    return {
      success: false,
      error: `Failed to parse file: ${e instanceof Error ? e.message : 'Unknown error'}`,
    }
  }
}

// Read file as text
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

// Check if Web Share API supports file sharing
export function canShareFile(): boolean {
  if (!navigator.share || !navigator.canShare) {
    return false
  }

  // Create a test file to check if file sharing is supported
  const testFile = new File(['test'], 'test.recordmoney', { type: 'application/json' })
  return navigator.canShare({ files: [testFile] })
}

// Share via Web Share API (for mobile)
export async function shareFile(
  records: ExpenseRecord[],
  users: User[],
  groups?: Group[]
): Promise<{ success: boolean; error?: string }> {
  const payload: FilePayload = {
    version: 1,
    exportedAt: Date.now(),
    records,
    users,
    ...(groups && groups.length > 0 ? { groups } : {}),
  }

  const json = JSON.stringify(payload, null, 2)
  const file = new File([json], `expenses-${Date.now()}.recordmoney`, {
    type: 'application/json',
  })

  if (!navigator.canShare?.({ files: [file] })) {
    return { success: false, error: 'File sharing not supported on this device' }
  }

  try {
    await navigator.share({ files: [file] })
    return { success: true }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { success: false, error: 'Share cancelled' }
    }
    return {
      success: false,
      error: `Share failed: ${e instanceof Error ? e.message : 'Unknown error'}`,
    }
  }
}

// Copy URL to clipboard
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const success = document.execCommand('copy')
    document.body.removeChild(textarea)
    return success
  }
}

// Get users referenced in records
export function getUsersFromRecords(records: ExpenseRecord[], allUsers: User[]): User[] {
  const emailSet = new Set<string>()

  for (const record of records) {
    for (const p of record.paidBy) {
      emailSet.add(p.email)
    }
    for (const p of record.paidFor) {
      emailSet.add(p.email)
    }
  }

  return allUsers.filter((u) => emailSet.has(u.email))
}

// Get groups referenced in records
export function getGroupsFromRecords(records: ExpenseRecord[], allGroups: Group[]): Group[] {
  const groupIdSet = new Set<string>()

  for (const record of records) {
    if (record.groupId) {
      groupIdSet.add(record.groupId)
    }
  }

  return allGroups.filter((g) => groupIdSet.has(g.uuid))
}

// Strip account information from records (for privacy when sharing)
export function stripAccountsFromRecords(records: ExpenseRecord[]): ExpenseRecord[] {
  return records.map((record) => {
    const { accounts, ...rest } = record
    return rest
  })
}
