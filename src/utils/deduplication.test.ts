import { describe, it, expect } from 'vitest'
import {
  analyzeImport,
  findPotentialDuplicates,
  regenerateUuid,
  generateSourceHash,
  mergeRecords,
} from './deduplication'
import type { ExpenseRecord } from '../types'

// Helper to create test records
const createRecord = (overrides: Partial<ExpenseRecord> = {}): ExpenseRecord => ({
  uuid: crypto.randomUUID(),
  title: 'Test Expense',
  description: '',
  category: 'Food',
  amount: 100,
  currency: 'INR',
  date: '2024-01-15',
  time: '12:00',
  icon: '🍔',
  paidBy: [{ email: 'alice@test.com', share: 100 }],
  paidFor: [{ email: 'bob@test.com', share: 100 }],
  shareType: 'equal',
  groupId: 'default',
  comments: '',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
})

describe('analyzeImport', () => {
  describe('new records (no duplicates)', () => {
    it('should identify records with no matching UUID or fields as new', () => {
      const existing = [createRecord({ uuid: 'existing-1' })]
      const incoming = [createRecord({ uuid: 'incoming-1', amount: 200 })]

      const result = analyzeImport(incoming, existing)

      expect(result.newRecords).toHaveLength(1)
      expect(result.uuidConflicts).toHaveLength(0)
      expect(result.exactMatches).toHaveLength(0)
      expect(result.sourceHashMatches).toHaveLength(0)
    })

    it('should handle empty existing records', () => {
      const incoming = [createRecord(), createRecord()]

      const result = analyzeImport(incoming, [])

      expect(result.newRecords).toHaveLength(2)
    })

    it('should handle empty incoming records', () => {
      const existing = [createRecord()]

      const result = analyzeImport([], existing)

      expect(result.newRecords).toHaveLength(0)
      expect(result.uuidConflicts).toHaveLength(0)
    })
  })

  describe('UUID conflicts', () => {
    it('should detect UUID conflict when UUIDs match', () => {
      const sharedUuid = 'shared-uuid-123'
      const existing = [createRecord({ uuid: sharedUuid, title: 'Existing' })]
      const incoming = [createRecord({ uuid: sharedUuid, title: 'Incoming' })]

      const result = analyzeImport(incoming, existing)

      expect(result.uuidConflicts).toHaveLength(1)
      expect(result.uuidConflicts[0].type).toBe('uuid')
      expect(result.uuidConflicts[0].incomingRecord.title).toBe('Incoming')
      expect(result.uuidConflicts[0].existingRecord.title).toBe('Existing')
      expect(result.newRecords).toHaveLength(0)
    })

    it('should handle multiple UUID conflicts', () => {
      const existing = [
        createRecord({ uuid: 'uuid-1', amount: 100 }),
        createRecord({ uuid: 'uuid-2', amount: 200 }),
      ]
      const incoming = [
        createRecord({ uuid: 'uuid-1', amount: 100 }),
        createRecord({ uuid: 'uuid-2', amount: 200 }),
        createRecord({ uuid: 'uuid-3', amount: 300 }), // Different amount to avoid exact match
      ]

      const result = analyzeImport(incoming, existing)

      expect(result.uuidConflicts).toHaveLength(2)
      expect(result.newRecords).toHaveLength(1)
    })
  })

  describe('exact matches', () => {
    it('should detect exact match when amount, date, paidBy, paidFor match', () => {
      const existing = [
        createRecord({
          uuid: 'existing-uuid',
          amount: 500,
          date: '2024-02-20',
          paidBy: [{ email: 'alice@test.com', share: 500 }],
          paidFor: [{ email: 'bob@test.com', share: 500 }],
        }),
      ]
      const incoming = [
        createRecord({
          uuid: 'different-uuid',
          amount: 500,
          date: '2024-02-20',
          paidBy: [{ email: 'alice@test.com', share: 500 }],
          paidFor: [{ email: 'bob@test.com', share: 500 }],
          title: 'Different title', // Title doesn't matter for exact match
        }),
      ]

      const result = analyzeImport(incoming, existing)

      expect(result.exactMatches).toHaveLength(1)
      expect(result.exactMatches[0].type).toBe('exact')
      expect(result.newRecords).toHaveLength(0)
    })

    it('should not match if amount differs', () => {
      const existing = [createRecord({ amount: 500 })]
      const incoming = [createRecord({ amount: 501 })]

      const result = analyzeImport(incoming, existing)

      expect(result.exactMatches).toHaveLength(0)
      expect(result.newRecords).toHaveLength(1)
    })

    it('should not match if date differs', () => {
      const existing = [createRecord({ date: '2024-01-15' })]
      const incoming = [createRecord({ date: '2024-01-16' })]

      const result = analyzeImport(incoming, existing)

      expect(result.exactMatches).toHaveLength(0)
      expect(result.newRecords).toHaveLength(1)
    })

    it('should not match if paidBy differs', () => {
      const existing = [createRecord({ paidBy: [{ email: 'alice@test.com', share: 100 }] })]
      const incoming = [createRecord({ paidBy: [{ email: 'charlie@test.com', share: 100 }] })]

      const result = analyzeImport(incoming, existing)

      expect(result.exactMatches).toHaveLength(0)
      expect(result.newRecords).toHaveLength(1)
    })

    it('should match regardless of paidBy/paidFor order', () => {
      const existing = [
        createRecord({
          paidBy: [
            { email: 'alice@test.com', share: 50 },
            { email: 'bob@test.com', share: 50 },
          ],
          paidFor: [
            { email: 'charlie@test.com', share: 50 },
            { email: 'dave@test.com', share: 50 },
          ],
        }),
      ]
      const incoming = [
        createRecord({
          paidBy: [
            { email: 'bob@test.com', share: 50 },
            { email: 'alice@test.com', share: 50 },
          ],
          paidFor: [
            { email: 'dave@test.com', share: 50 },
            { email: 'charlie@test.com', share: 50 },
          ],
        }),
      ]

      const result = analyzeImport(incoming, existing)

      expect(result.exactMatches).toHaveLength(1)
    })
  })

  describe('sourceHash matches', () => {
    it('should detect sourceHash match for bank statement records', () => {
      const existing = [
        createRecord({
          uuid: 'existing-uuid',
          sourceHash: 'bank:abc123',
        }),
      ]
      const incoming = [
        createRecord({
          uuid: 'different-uuid',
          sourceHash: 'bank:abc123',
        }),
      ]

      const result = analyzeImport(incoming, existing)

      expect(result.sourceHashMatches).toHaveLength(1)
      expect(result.sourceHashMatches[0].type).toBe('sourceHash')
      expect(result.newRecords).toHaveLength(0)
    })

    it('should not match if sourceHash differs', () => {
      const existing = [createRecord({ sourceHash: 'bank:abc123', amount: 100 })]
      const incoming = [createRecord({ sourceHash: 'bank:xyz789', amount: 200 })] // Different amount to avoid exact match

      const result = analyzeImport(incoming, existing)

      expect(result.sourceHashMatches).toHaveLength(0)
      expect(result.newRecords).toHaveLength(1)
    })

    it('should not match if incoming has no sourceHash', () => {
      const existing = [createRecord({ sourceHash: 'bank:abc123' })]
      const incoming = [createRecord()]

      const result = analyzeImport(incoming, existing)

      expect(result.sourceHashMatches).toHaveLength(0)
    })
  })

  describe('priority order', () => {
    it('should check UUID before sourceHash', () => {
      const sharedUuid = 'shared-uuid'
      const existing = [createRecord({ uuid: sharedUuid, sourceHash: 'hash-1' })]
      const incoming = [createRecord({ uuid: sharedUuid, sourceHash: 'hash-1' })]

      const result = analyzeImport(incoming, existing)

      expect(result.uuidConflicts).toHaveLength(1)
      expect(result.sourceHashMatches).toHaveLength(0)
    })

    it('should check UUID before exact match', () => {
      const sharedUuid = 'shared-uuid'
      const existing = [
        createRecord({
          uuid: sharedUuid,
          amount: 100,
          date: '2024-01-15',
        }),
      ]
      const incoming = [
        createRecord({
          uuid: sharedUuid,
          amount: 100,
          date: '2024-01-15',
        }),
      ]

      const result = analyzeImport(incoming, existing)

      expect(result.uuidConflicts).toHaveLength(1)
      expect(result.exactMatches).toHaveLength(0)
    })

    it('should check sourceHash before exact match', () => {
      const existing = [
        createRecord({
          uuid: 'uuid-1',
          sourceHash: 'bank:abc123',
          amount: 100,
          date: '2024-01-15',
        }),
      ]
      const incoming = [
        createRecord({
          uuid: 'uuid-2',
          sourceHash: 'bank:abc123',
          amount: 100,
          date: '2024-01-15',
        }),
      ]

      const result = analyzeImport(incoming, existing)

      expect(result.sourceHashMatches).toHaveLength(1)
      expect(result.exactMatches).toHaveLength(0)
    })
  })
})

describe('findPotentialDuplicates', () => {
  it('should find records with same amount and date', () => {
    const records = [
      createRecord({ uuid: 'r1', amount: 100, date: '2024-01-15' }),
      createRecord({ uuid: 'r2', amount: 100, date: '2024-01-15' }),
    ]

    const duplicates = findPotentialDuplicates(records)

    expect(duplicates).toHaveLength(1)
    expect(duplicates[0].reasons).toContain('Same amount')
    expect(duplicates[0].reasons).toContain('Same date')
  })

  it('should find records with same amount and close dates', () => {
    const records = [
      createRecord({ uuid: 'r1', amount: 100, date: '2024-01-15' }),
      createRecord({ uuid: 'r2', amount: 100, date: '2024-01-16' }),
    ]

    const duplicates = findPotentialDuplicates(records, { dateBuffer: 1 })

    expect(duplicates).toHaveLength(1)
    expect(duplicates[0].reasons).toContain('Same amount')
  })

  it('should not match records with different amounts', () => {
    const records = [
      createRecord({ uuid: 'r1', amount: 100, date: '2024-01-15' }),
      createRecord({ uuid: 'r2', amount: 200, date: '2024-01-15' }),
    ]

    const duplicates = findPotentialDuplicates(records)

    expect(duplicates).toHaveLength(0)
  })

  it('should not match records with dates too far apart', () => {
    const records = [
      createRecord({ uuid: 'r1', amount: 100, date: '2024-01-15' }),
      createRecord({ uuid: 'r2', amount: 100, date: '2024-01-20' }),
    ]

    const duplicates = findPotentialDuplicates(records, { dateBuffer: 1 })

    expect(duplicates).toHaveLength(0)
  })

  it('should boost score for same participants', () => {
    const records = [
      createRecord({
        uuid: 'r1',
        amount: 100,
        date: '2024-01-15',
        paidBy: [{ email: 'alice@test.com', share: 100 }],
        paidFor: [{ email: 'bob@test.com', share: 100 }],
      }),
      createRecord({
        uuid: 'r2',
        amount: 100,
        date: '2024-01-15',
        paidBy: [{ email: 'alice@test.com', share: 100 }],
        paidFor: [{ email: 'bob@test.com', share: 100 }],
      }),
    ]

    const duplicates = findPotentialDuplicates(records)

    expect(duplicates).toHaveLength(1)
    expect(duplicates[0].reasons).toContain('Same participants')
    expect(duplicates[0].similarity).toBeGreaterThan(0.8)
  })

  it('should boost score for same category', () => {
    const records = [
      createRecord({ uuid: 'r1', amount: 100, date: '2024-01-15', category: 'Food' }),
      createRecord({ uuid: 'r2', amount: 100, date: '2024-01-15', category: 'Food' }),
    ]

    const duplicates = findPotentialDuplicates(records)

    expect(duplicates).toHaveLength(1)
    expect(duplicates[0].reasons).toContain('Same category')
  })

  it('should respect minSimilarity threshold', () => {
    const records = [
      createRecord({
        uuid: 'r1',
        amount: 100,
        date: '2024-01-15',
        paidBy: [{ email: 'alice@test.com', share: 100 }],
      }),
      createRecord({
        uuid: 'r2',
        amount: 100,
        date: '2024-01-16',
        paidBy: [{ email: 'bob@test.com', share: 100 }], // Different participant
      }),
    ]

    // Low threshold - should find
    const lowThreshold = findPotentialDuplicates(records, { minSimilarity: 0.5 })
    expect(lowThreshold).toHaveLength(1)

    // High threshold - should not find
    const highThreshold = findPotentialDuplicates(records, { minSimilarity: 0.9 })
    expect(highThreshold).toHaveLength(0)
  })

  it('should sort results by similarity (highest first)', () => {
    const records = [
      createRecord({ uuid: 'r1', amount: 100, date: '2024-01-15', category: 'Food' }),
      createRecord({ uuid: 'r2', amount: 100, date: '2024-01-15', category: 'Food' }), // High similarity
      createRecord({ uuid: 'r3', amount: 100, date: '2024-01-16', category: 'Travel' }), // Lower similarity
    ]

    const duplicates = findPotentialDuplicates(records)

    expect(duplicates.length).toBeGreaterThan(0)
    for (let i = 1; i < duplicates.length; i++) {
      expect(duplicates[i - 1].similarity).toBeGreaterThanOrEqual(duplicates[i].similarity)
    }
  })

  describe('title similarity', () => {
    it('should detect very similar titles (>90%)', () => {
      const records = [
        createRecord({ uuid: 'r1', amount: 100, date: '2024-01-15', title: 'Coffee at Starbucks' }),
        createRecord({ uuid: 'r2', amount: 100, date: '2024-01-15', title: 'Coffee at Starbuck' }), // Minor typo
      ]

      const duplicates = findPotentialDuplicates(records)

      expect(duplicates).toHaveLength(1)
      expect(duplicates[0].reasons).toContain('Very similar title')
    })

    it('should detect similar titles (70-90%)', () => {
      const records = [
        createRecord({
          uuid: 'r1',
          amount: 100,
          date: '2024-01-15',
          title: 'Coffee at Starbucks Downtown',
        }),
        createRecord({
          uuid: 'r2',
          amount: 100,
          date: '2024-01-15',
          title: 'Coffee at Starbucks Uptown',
        }), // ~75% similar
      ]

      const duplicates = findPotentialDuplicates(records)

      expect(duplicates).toHaveLength(1)
      expect(duplicates[0].reasons).toContain('Similar title')
    })

    it('should not boost score for very different titles', () => {
      const records = [
        createRecord({ uuid: 'r1', amount: 100, date: '2024-01-15', title: 'Coffee' }),
        createRecord({
          uuid: 'r2',
          amount: 100,
          date: '2024-01-15',
          title: 'Groceries at Walmart',
        }),
      ]

      const duplicates = findPotentialDuplicates(records)

      expect(duplicates).toHaveLength(1)
      expect(duplicates[0].reasons).not.toContain('Similar title')
      expect(duplicates[0].reasons).not.toContain('Very similar title')
    })

    it('should be case insensitive for title matching', () => {
      const records = [
        createRecord({ uuid: 'r1', amount: 100, date: '2024-01-15', title: 'COFFEE AT STARBUCKS' }),
        createRecord({ uuid: 'r2', amount: 100, date: '2024-01-15', title: 'coffee at starbucks' }),
      ]

      const duplicates = findPotentialDuplicates(records)

      expect(duplicates).toHaveLength(1)
      expect(duplicates[0].reasons).toContain('Very similar title')
    })
  })

  describe('amount tolerance', () => {
    it('should match amounts within tolerance (default 2%)', () => {
      const records = [
        createRecord({ uuid: 'r1', amount: 100, date: '2024-01-15' }),
        createRecord({ uuid: 'r2', amount: 101, date: '2024-01-15' }), // 1% difference
      ]

      const duplicates = findPotentialDuplicates(records)

      expect(duplicates).toHaveLength(1)
      expect(duplicates[0].reasons.some((r) => r.includes('Amount within'))).toBe(true)
    })

    it('should not match amounts beyond tolerance', () => {
      const records = [
        createRecord({ uuid: 'r1', amount: 100, date: '2024-01-15' }),
        createRecord({ uuid: 'r2', amount: 105, date: '2024-01-15' }), // 5% difference
      ]

      const duplicates = findPotentialDuplicates(records, { amountTolerance: 0.02 })

      expect(duplicates).toHaveLength(0)
    })

    it('should respect custom amount tolerance', () => {
      const records = [
        createRecord({ uuid: 'r1', amount: 100, date: '2024-01-15' }),
        createRecord({ uuid: 'r2', amount: 110, date: '2024-01-15' }), // 10% difference
      ]

      // With default tolerance (2%), should not match
      const defaultTolerance = findPotentialDuplicates(records)
      expect(defaultTolerance).toHaveLength(0)

      // With higher tolerance (15%), should match
      const higherTolerance = findPotentialDuplicates(records, { amountTolerance: 0.15 })
      expect(higherTolerance).toHaveLength(1)
    })

    it('should give higher score for exact amount match', () => {
      const records = [
        createRecord({ uuid: 'r1', amount: 100, date: '2024-01-15' }),
        createRecord({ uuid: 'r2', amount: 100, date: '2024-01-15' }), // Exact match
        createRecord({ uuid: 'r3', amount: 101, date: '2024-01-15' }), // 1% difference
      ]

      const duplicates = findPotentialDuplicates(records)

      // Find the pair with exact amount match
      const exactPair = duplicates.find(
        (d) =>
          (d.record1.uuid === 'r1' && d.record2.uuid === 'r2') ||
          (d.record1.uuid === 'r2' && d.record2.uuid === 'r1')
      )
      // Find the pair with approximate amount match
      const approxPair = duplicates.find(
        (d) =>
          (d.record1.uuid === 'r1' && d.record2.uuid === 'r3') ||
          (d.record1.uuid === 'r3' && d.record2.uuid === 'r1')
      )

      expect(exactPair).toBeDefined()
      expect(approxPair).toBeDefined()
      expect(exactPair!.similarity).toBeGreaterThan(approxPair!.similarity)
    })
  })

  describe('combined scoring', () => {
    it('should accumulate scores from multiple factors', () => {
      const records = [
        createRecord({
          uuid: 'r1',
          amount: 100,
          date: '2024-01-15',
          title: 'Coffee at Starbucks',
          category: 'Food',
          paidBy: [{ email: 'alice@test.com', share: 100 }],
          paidFor: [{ email: 'bob@test.com', share: 100 }],
        }),
        createRecord({
          uuid: 'r2',
          amount: 100,
          date: '2024-01-15',
          title: 'Coffee at Starbucks',
          category: 'Food',
          paidBy: [{ email: 'alice@test.com', share: 100 }],
          paidFor: [{ email: 'bob@test.com', share: 100 }],
        }),
      ]

      const duplicates = findPotentialDuplicates(records)

      expect(duplicates).toHaveLength(1)
      expect(duplicates[0].similarity).toBeGreaterThanOrEqual(0.9)
      expect(duplicates[0].reasons).toContain('Same amount')
      expect(duplicates[0].reasons).toContain('Same date')
      expect(duplicates[0].reasons).toContain('Very similar title')
      expect(duplicates[0].reasons).toContain('Same participants')
      expect(duplicates[0].reasons).toContain('Same category')
    })

    it('should cap similarity at 1.0', () => {
      const records = [
        createRecord({
          uuid: 'r1',
          amount: 100,
          date: '2024-01-15',
          title: 'Exact Title Match',
          category: 'Food',
          paidBy: [{ email: 'alice@test.com', share: 100 }],
        }),
        createRecord({
          uuid: 'r2',
          amount: 100,
          date: '2024-01-15',
          title: 'Exact Title Match',
          category: 'Food',
          paidBy: [{ email: 'alice@test.com', share: 100 }],
        }),
      ]

      const duplicates = findPotentialDuplicates(records)

      expect(duplicates).toHaveLength(1)
      expect(duplicates[0].similarity).toBeLessThanOrEqual(1)
    })
  })
})

describe('regenerateUuid', () => {
  it('should create a new UUID', () => {
    const original = createRecord({ uuid: 'original-uuid' })

    const regenerated = regenerateUuid(original)

    expect(regenerated.uuid).not.toBe(original.uuid)
    expect(regenerated.uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    )
  })

  it('should preserve all other fields', () => {
    const original = createRecord({
      title: 'Test',
      amount: 123,
      category: 'Shopping',
    })

    const regenerated = regenerateUuid(original)

    expect(regenerated.title).toBe(original.title)
    expect(regenerated.amount).toBe(original.amount)
    expect(regenerated.category).toBe(original.category)
    expect(regenerated.paidBy).toEqual(original.paidBy)
    expect(regenerated.paidFor).toEqual(original.paidFor)
  })

  it('should update timestamps', () => {
    const original = createRecord({
      createdAt: 1000,
      updatedAt: 1000,
    })

    const before = Date.now()
    const regenerated = regenerateUuid(original)
    const after = Date.now()

    expect(regenerated.createdAt).toBeGreaterThanOrEqual(before)
    expect(regenerated.createdAt).toBeLessThanOrEqual(after)
    expect(regenerated.updatedAt).toBeGreaterThanOrEqual(before)
    expect(regenerated.updatedAt).toBeLessThanOrEqual(after)
  })
})

describe('generateSourceHash', () => {
  it('should generate consistent hash for same inputs', () => {
    const hash1 = generateSourceHash('bank.pdf', '2024-01-15', 100, 'Amazon Purchase')
    const hash2 = generateSourceHash('bank.pdf', '2024-01-15', 100, 'Amazon Purchase')

    expect(hash1).toBe(hash2)
  })

  it('should generate different hash for different inputs', () => {
    const hash1 = generateSourceHash('bank.pdf', '2024-01-15', 100, 'Amazon Purchase')
    const hash2 = generateSourceHash('bank.pdf', '2024-01-15', 200, 'Amazon Purchase')

    expect(hash1).not.toBe(hash2)
  })

  it('should include filename in hash', () => {
    const hash1 = generateSourceHash('bank1.pdf', '2024-01-15', 100, 'Purchase')
    const hash2 = generateSourceHash('bank2.pdf', '2024-01-15', 100, 'Purchase')

    expect(hash1).not.toBe(hash2)
    expect(hash1).toContain('bank1.pdf:')
    expect(hash2).toContain('bank2.pdf:')
  })

  it('should normalize description case and whitespace', () => {
    const hash1 = generateSourceHash('bank.pdf', '2024-01-15', 100, 'Amazon Purchase')
    const hash2 = generateSourceHash('bank.pdf', '2024-01-15', 100, '  AMAZON PURCHASE  ')

    expect(hash1).toBe(hash2)
  })
})

describe('mergeRecords', () => {
  it('should keep existing UUID when merging', () => {
    const existing = createRecord({ uuid: 'existing-uuid', title: 'Old Title' })
    const incoming = createRecord({ uuid: 'incoming-uuid', title: 'New Title' })

    const merged = mergeRecords(existing, incoming, true)

    expect(merged.uuid).toBe('existing-uuid')
  })

  it('should use incoming data when preferIncoming is true', () => {
    const existing = createRecord({ title: 'Old Title', amount: 100 })
    const incoming = createRecord({ title: 'New Title', amount: 200 })

    const merged = mergeRecords(existing, incoming, true)

    expect(merged.title).toBe('New Title')
    expect(merged.amount).toBe(200)
  })

  it('should use existing data when preferIncoming is false', () => {
    const existing = createRecord({ title: 'Old Title', amount: 100 })
    const incoming = createRecord({ title: 'New Title', amount: 200 })

    const merged = mergeRecords(existing, incoming, false)

    expect(merged.title).toBe('Old Title')
    expect(merged.amount).toBe(100)
  })

  it('should keep original createdAt timestamp', () => {
    const existing = createRecord({ createdAt: 1000 })
    const incoming = createRecord({ createdAt: 2000 })

    const merged = mergeRecords(existing, incoming, true)

    expect(merged.createdAt).toBe(1000)
  })

  it('should update updatedAt to current time', () => {
    const existing = createRecord({ updatedAt: 1000 })
    const incoming = createRecord({ updatedAt: 2000 })

    const before = Date.now()
    const merged = mergeRecords(existing, incoming, true)
    const after = Date.now()

    expect(merged.updatedAt).toBeGreaterThanOrEqual(before)
    expect(merged.updatedAt).toBeLessThanOrEqual(after)
  })
})
