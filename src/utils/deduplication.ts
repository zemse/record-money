import type { ExpenseRecord } from '../types'

// Levenshtein distance for string similarity
function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length
  const n = s2.length

  if (m === 0) return n
  if (n === 0) return m

  // Use single array optimization
  const prev = Array.from({ length: n + 1 }, (_, i) => i)
  const curr = new Array(n + 1)

  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= n; j++) {
      prev[j] = curr[j]
    }
  }

  return prev[n]
}

// Calculate string similarity (0-1, where 1 is identical)
function stringSimilarity(s1: string, s2: string): number {
  const str1 = s1.toLowerCase().trim()
  const str2 = s2.toLowerCase().trim()

  if (str1 === str2) return 1
  if (str1.length === 0 || str2.length === 0) return 0

  const maxLen = Math.max(str1.length, str2.length)
  const distance = levenshteinDistance(str1, str2)
  return 1 - distance / maxLen
}

// Types of duplicates
export type DuplicateType = 'uuid' | 'exact' | 'sourceHash'

export interface DuplicateMatch {
  type: DuplicateType
  incomingRecord: ExpenseRecord
  existingRecord: ExpenseRecord
}

export interface ImportAnalysis {
  newRecords: ExpenseRecord[]
  uuidConflicts: DuplicateMatch[]
  exactMatches: DuplicateMatch[]
  sourceHashMatches: DuplicateMatch[]
}

// Analyze incoming records for duplicates
export function analyzeImport(
  incomingRecords: ExpenseRecord[],
  existingRecords: ExpenseRecord[]
): ImportAnalysis {
  const result: ImportAnalysis = {
    newRecords: [],
    uuidConflicts: [],
    exactMatches: [],
    sourceHashMatches: [],
  }

  // Create lookup maps for faster checking
  const existingByUuid = new Map<string, ExpenseRecord>()
  const existingByHash = new Map<string, ExpenseRecord>()

  for (const record of existingRecords) {
    existingByUuid.set(record.uuid, record)
    if (record.sourceHash) {
      existingByHash.set(record.sourceHash, record)
    }
  }

  for (const incoming of incomingRecords) {
    // Check UUID match
    const uuidMatch = existingByUuid.get(incoming.uuid)
    if (uuidMatch) {
      result.uuidConflicts.push({
        type: 'uuid',
        incomingRecord: incoming,
        existingRecord: uuidMatch,
      })
      continue
    }

    // Check sourceHash match (for bank statement dedup)
    if (incoming.sourceHash) {
      const hashMatch = existingByHash.get(incoming.sourceHash)
      if (hashMatch) {
        result.sourceHashMatches.push({
          type: 'sourceHash',
          incomingRecord: incoming,
          existingRecord: hashMatch,
        })
        continue
      }
    }

    // Check exact field match
    const exactMatch = findExactMatch(incoming, existingRecords)
    if (exactMatch) {
      result.exactMatches.push({
        type: 'exact',
        incomingRecord: incoming,
        existingRecord: exactMatch,
      })
      continue
    }

    // No duplicates found - it's a new record
    result.newRecords.push(incoming)
  }

  return result
}

// Check for exact field match (amount, date, paidBy, paidFor)
function findExactMatch(
  incoming: ExpenseRecord,
  existingRecords: ExpenseRecord[]
): ExpenseRecord | null {
  const incomingPaidByEmails = [...incoming.paidBy.map((p) => p.email)].sort().join(',')
  const incomingPaidForEmails = [...incoming.paidFor.map((p) => p.email)].sort().join(',')

  for (const existing of existingRecords) {
    // Skip if UUID matches (already handled)
    if (existing.uuid === incoming.uuid) continue

    // Check amount and date
    if (existing.amount !== incoming.amount) continue
    if (existing.date !== incoming.date) continue

    // Check paidBy emails (sorted)
    const existingPaidByEmails = [...existing.paidBy.map((p) => p.email)].sort().join(',')
    if (existingPaidByEmails !== incomingPaidByEmails) continue

    // Check paidFor emails (sorted)
    const existingPaidForEmails = [...existing.paidFor.map((p) => p.email)].sort().join(',')
    if (existingPaidForEmails !== incomingPaidForEmails) continue

    // All checks passed - exact match
    return existing
  }

  return null
}

// Generate a new UUID for a record (for "Keep as new" action)
export function regenerateUuid(record: ExpenseRecord): ExpenseRecord {
  return {
    ...record,
    uuid: crypto.randomUUID(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

// Generate source hash for bank statement dedup
export function generateSourceHash(
  filename: string,
  date: string,
  amount: number,
  description: string
): string {
  const normalized = `${date}|${amount}|${description.toLowerCase().trim()}`
  const hash = simpleHash(normalized)
  return `${filename}:${hash}`
}

// Simple hash function (for PoC)
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16)
}

// Find potential duplicates within existing records
export interface PotentialDuplicate {
  record1: ExpenseRecord
  record2: ExpenseRecord
  similarity: number // 0-1 score
  reasons: string[]
}

// Grouped duplicates - all records that are similar to each other
export interface DuplicateGroup {
  records: ExpenseRecord[]
  avgSimilarity: number
  reasons: string[]
}

export interface DeduplicationOptions {
  dateBuffer?: number // days difference allowed (default 1)
  minSimilarity?: number // minimum similarity to report (default 0.7)
  amountTolerance?: number // percentage tolerance for amount (default 0.02 = 2%)
}

export function findPotentialDuplicates(
  records: ExpenseRecord[],
  options: DeduplicationOptions = {}
): PotentialDuplicate[] {
  const { dateBuffer = 1, minSimilarity = 0.7, amountTolerance = 0.02 } = options
  const duplicates: PotentialDuplicate[] = []
  const checked = new Set<string>()

  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const r1 = records[i]
      const r2 = records[j]

      // Skip if already found as duplicates (by original key)
      const key = `${r1.uuid}:${r2.uuid}`
      if (checked.has(key)) continue
      checked.add(key)

      const result = checkSimilarity(r1, r2, dateBuffer, amountTolerance)

      if (result.similarity >= minSimilarity) {
        duplicates.push({
          record1: r1,
          record2: r2,
          ...result,
        })
      }
    }
  }

  // Sort by similarity (highest first)
  return duplicates.sort((a, b) => b.similarity - a.similarity)
}

// Group duplicates using Union-Find to find connected components
export function groupDuplicates(duplicates: PotentialDuplicate[]): DuplicateGroup[] {
  if (duplicates.length === 0) return []

  // Build a map of all unique records
  const recordMap = new Map<string, ExpenseRecord>()
  const parent = new Map<string, string>()
  const similarities = new Map<string, { sum: number; count: number; reasons: Set<string> }>()

  for (const dup of duplicates) {
    recordMap.set(dup.record1.uuid, dup.record1)
    recordMap.set(dup.record2.uuid, dup.record2)
    if (!parent.has(dup.record1.uuid)) parent.set(dup.record1.uuid, dup.record1.uuid)
    if (!parent.has(dup.record2.uuid)) parent.set(dup.record2.uuid, dup.record2.uuid)
  }

  // Find with path compression
  const find = (x: string): string => {
    if (parent.get(x) !== x) {
      parent.set(x, find(parent.get(x)!))
    }
    return parent.get(x)!
  }

  // Union
  const union = (x: string, y: string) => {
    const px = find(x)
    const py = find(y)
    if (px !== py) {
      parent.set(px, py)
    }
  }

  // Union all duplicate pairs
  for (const dup of duplicates) {
    union(dup.record1.uuid, dup.record2.uuid)

    // Track similarity info for this pair
    const key = [dup.record1.uuid, dup.record2.uuid].sort().join(':')
    if (!similarities.has(key)) {
      similarities.set(key, { sum: 0, count: 0, reasons: new Set() })
    }
    const info = similarities.get(key)!
    info.sum += dup.similarity
    info.count++
    dup.reasons.forEach((r) => info.reasons.add(r))
  }

  // Group by root parent
  const groups = new Map<string, ExpenseRecord[]>()
  for (const [uuid] of recordMap) {
    const root = find(uuid)
    if (!groups.has(root)) {
      groups.set(root, [])
    }
    groups.get(root)!.push(recordMap.get(uuid)!)
  }

  // Convert to DuplicateGroup array
  const result: DuplicateGroup[] = []
  for (const [, records] of groups) {
    if (records.length < 2) continue

    // Calculate average similarity and collect reasons for this group
    let totalSim = 0
    let simCount = 0
    const allReasons = new Set<string>()

    for (let i = 0; i < records.length; i++) {
      for (let j = i + 1; j < records.length; j++) {
        const key = [records[i].uuid, records[j].uuid].sort().join(':')
        const info = similarities.get(key)
        if (info) {
          totalSim += info.sum / info.count
          simCount++
          info.reasons.forEach((r) => allReasons.add(r))
        }
      }
    }

    result.push({
      records: records.sort((a, b) => a.createdAt - b.createdAt), // Sort by creation time
      avgSimilarity: simCount > 0 ? totalSim / simCount : 0,
      reasons: Array.from(allReasons),
    })
  }

  // Sort groups by average similarity (highest first)
  return result.sort((a, b) => b.avgSimilarity - a.avgSimilarity)
}

function checkSimilarity(
  r1: ExpenseRecord,
  r2: ExpenseRecord,
  dateBuffer: number,
  amountTolerance: number
): { similarity: number; reasons: string[] } {
  let score = 0
  const reasons: string[] = []

  // Amount match with tolerance
  const maxAmount = Math.max(r1.amount, r2.amount)
  const amountDiff = maxAmount > 0 ? Math.abs(r1.amount - r2.amount) / maxAmount : 0

  if (amountDiff === 0) {
    score += 0.35
    reasons.push('Same amount')
  } else if (amountDiff <= amountTolerance) {
    score += 0.25
    const diffPercent = Math.round(amountDiff * 100)
    reasons.push(`Amount within ${diffPercent}%`)
  } else {
    // Amounts too different
    return { similarity: 0, reasons: [] }
  }

  // Check date similarity
  const d1 = new Date(r1.date)
  const d2 = new Date(r2.date)
  const daysDiff = Math.abs(d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24)

  if (daysDiff === 0) {
    score += 0.25
    reasons.push('Same date')
  } else if (daysDiff <= dateBuffer) {
    score += 0.15
    reasons.push(`Dates within ${dateBuffer} day(s)`)
  } else {
    // Dates too far apart
    return { similarity: 0, reasons: [] }
  }

  // Check title similarity
  const titleSim = stringSimilarity(r1.title, r2.title)
  if (titleSim >= 0.9) {
    score += 0.2
    reasons.push('Very similar title')
  } else if (titleSim >= 0.7) {
    score += 0.1
    reasons.push('Similar title')
  }

  // Check participant overlap
  const r1Participants = new Set([
    ...r1.paidBy.map((p) => p.email),
    ...r1.paidFor.map((p) => p.email),
  ])
  const r2Participants = new Set([
    ...r2.paidBy.map((p) => p.email),
    ...r2.paidFor.map((p) => p.email),
  ])

  let overlap = 0
  for (const p of r1Participants) {
    if (r2Participants.has(p)) overlap++
  }

  const overlapRatio = overlap / Math.max(r1Participants.size, r2Participants.size)
  if (overlapRatio === 1) {
    score += 0.15
    reasons.push('Same participants')
  } else if (overlapRatio > 0.5) {
    score += 0.1
    reasons.push('Similar participants')
  }

  // Check category match
  if (r1.category === r2.category) {
    score += 0.1
    reasons.push('Same category')
  }

  // Check accounts match
  const r1Accounts = r1.accounts?.map((a) => `${a.accountId}:${a.amount}`).sort().join(',') || ''
  const r2Accounts = r2.accounts?.map((a) => `${a.accountId}:${a.amount}`).sort().join(',') || ''
  if (r1Accounts !== r2Accounts && r1Accounts && r2Accounts) {
    // Reduce similarity if both have accounts but they differ
    score -= 0.1
    reasons.push('Different accounts')
  }

  // Normalize to max 1.0
  return { similarity: Math.min(1, Math.max(0, score)), reasons }
}

// Merge two records (used when user chooses to merge)
export function mergeRecords(
  existing: ExpenseRecord,
  incoming: ExpenseRecord,
  preferIncoming: boolean = true
): ExpenseRecord {
  // Use the preferred record's data, but keep the existing UUID
  const base = preferIncoming ? incoming : existing
  return {
    ...base,
    uuid: existing.uuid, // Keep existing UUID
    createdAt: existing.createdAt, // Keep original creation time
    updatedAt: Date.now(),
  }
}
