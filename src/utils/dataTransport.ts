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
