import type { ExpenseRecord } from '../types'

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

export function findPotentialDuplicates(
  records: ExpenseRecord[],
  options: {
    dateBuffer?: number // days difference allowed (default 1)
    minSimilarity?: number // minimum similarity to report (default 0.7)
  } = {}
): PotentialDuplicate[] {
  const { dateBuffer = 1, minSimilarity = 0.7 } = options
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

      const result = checkSimilarity(r1, r2, dateBuffer)

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

function checkSimilarity(
  r1: ExpenseRecord,
  r2: ExpenseRecord,
  dateBuffer: number
): { similarity: number; reasons: string[] } {
  let score = 0
  const reasons: string[] = []

  // Amount match is required
  if (r1.amount !== r2.amount) {
    return { similarity: 0, reasons: [] }
  }
  score += 0.4
  reasons.push('Same amount')

  // Check date similarity
  const d1 = new Date(r1.date)
  const d2 = new Date(r2.date)
  const daysDiff = Math.abs(d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24)

  if (daysDiff === 0) {
    score += 0.3
    reasons.push('Same date')
  } else if (daysDiff <= dateBuffer) {
    score += 0.15
    reasons.push(`Dates within ${dateBuffer} day(s)`)
  } else {
    // Dates too far apart
    return { similarity: 0, reasons: [] }
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
    score += 0.2
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

  return { similarity: score, reasons }
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
