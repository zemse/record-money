import { describe, it, expect } from 'vitest'
import type { ExpenseRecord } from '../types'
import {
  calculateShares,
  calculateRecordDebts,
  aggregateAndSimplifyDebts,
  calculateUserBalances,
  calculateBalancesByGroup,
  formatAmount,
  type Debt,
} from './balanceCalculator'

// Helper to create test records
function createTestRecord(overrides: Partial<ExpenseRecord> = {}): ExpenseRecord {
  return {
    uuid: 'test-uuid',
    title: 'Test Expense',
    description: '',
    category: 'Food',
    amount: 100,
    currency: 'INR',
    date: '2025-01-01',
    time: '12:00',
    icon: '🍽️',
    paidBy: [{ email: 'alice@test.com', share: 100 }],
    paidFor: [
      { email: 'alice@test.com', share: 1 },
      { email: 'bob@test.com', share: 1 },
    ],
    shareType: 'equal',
    groupId: 'test-group',
    comments: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

// ============================================
// calculateShares() Tests
// ============================================
describe('calculateShares', () => {
  describe('equal share type', () => {
    it('splits equally among participants', () => {
      const shares = calculateShares(30, 'equal', [
        { email: 'a@test.com', share: 1 },
        { email: 'b@test.com', share: 1 },
        { email: 'c@test.com', share: 1 },
      ])

      expect(shares.get('a@test.com')).toBe(10)
      expect(shares.get('b@test.com')).toBe(10)
      expect(shares.get('c@test.com')).toBe(10)
    })

    it('handles uneven division', () => {
      const shares = calculateShares(100, 'equal', [
        { email: 'a@test.com', share: 1 },
        { email: 'b@test.com', share: 1 },
        { email: 'c@test.com', share: 1 },
      ])

      // Each gets 33.33...
      expect(shares.get('a@test.com')).toBeCloseTo(33.33, 1)
    })
  })

  describe('percentage share type', () => {
    it('splits by percentage', () => {
      const shares = calculateShares(100, 'percentage', [
        { email: 'a@test.com', share: 50 },
        { email: 'b@test.com', share: 30 },
        { email: 'c@test.com', share: 20 },
      ])

      expect(shares.get('a@test.com')).toBe(50)
      expect(shares.get('b@test.com')).toBe(30)
      expect(shares.get('c@test.com')).toBe(20)
    })

    it('handles percentages not totaling 100', () => {
      const shares = calculateShares(100, 'percentage', [
        { email: 'a@test.com', share: 70 },
        { email: 'b@test.com', share: 70 },
      ])

      // Each pays 70% of 100
      expect(shares.get('a@test.com')).toBe(70)
      expect(shares.get('b@test.com')).toBe(70)
    })
  })

  describe('exact share type', () => {
    it('uses exact amounts specified', () => {
      const shares = calculateShares(100, 'exact', [
        { email: 'a@test.com', share: 75 },
        { email: 'b@test.com', share: 25 },
      ])

      expect(shares.get('a@test.com')).toBe(75)
      expect(shares.get('b@test.com')).toBe(25)
    })
  })

  describe('shares (ratio) share type', () => {
    it('splits by ratio', () => {
      const shares = calculateShares(90, 'shares', [
        { email: 'a@test.com', share: 2 }, // 2/3 of total
        { email: 'b@test.com', share: 1 }, // 1/3 of total
      ])

      expect(shares.get('a@test.com')).toBe(60)
      expect(shares.get('b@test.com')).toBe(30)
    })

    it('handles shares totaling zero', () => {
      const shares = calculateShares(100, 'shares', [
        { email: 'a@test.com', share: 0 },
        { email: 'b@test.com', share: 0 },
      ])

      // When total shares is 0, no one gets anything
      expect(shares.size).toBe(0)
    })
  })

  describe('edge cases', () => {
    it('returns empty Map for empty participants', () => {
      const shares = calculateShares(100, 'equal', [])
      expect(shares.size).toBe(0)
    })

    it('handles single participant', () => {
      const shares = calculateShares(100, 'equal', [{ email: 'a@test.com', share: 1 }])
      expect(shares.get('a@test.com')).toBe(100)
    })
  })
})

// ============================================
// calculateRecordDebts() Tests
// ============================================
describe('calculateRecordDebts', () => {
  it('creates debt from beneficiary to payer', () => {
    const record = createTestRecord({
      amount: 100,
      paidBy: [{ email: 'alice@test.com', share: 100 }],
      paidFor: [
        { email: 'alice@test.com', share: 1 },
        { email: 'bob@test.com', share: 1 },
      ],
      shareType: 'equal',
    })

    const debts = calculateRecordDebts(record)

    // Bob owes Alice 50 (half of 100)
    expect(debts).toHaveLength(1)
    expect(debts[0]).toMatchObject({
      from: 'bob@test.com',
      to: 'alice@test.com',
      amount: 50,
      currency: 'INR',
    })
  })

  it('filters out self-debts', () => {
    const record = createTestRecord({
      amount: 100,
      paidBy: [{ email: 'alice@test.com', share: 100 }],
      paidFor: [{ email: 'alice@test.com', share: 1 }],
      shareType: 'equal',
    })

    const debts = calculateRecordDebts(record)

    // No debts since Alice paid for herself
    expect(debts).toHaveLength(0)
  })

  it('handles multiple payers correctly', () => {
    const record = createTestRecord({
      amount: 100,
      paidBy: [
        { email: 'alice@test.com', share: 60 },
        { email: 'bob@test.com', share: 40 },
      ],
      paidFor: [
        { email: 'alice@test.com', share: 1 },
        { email: 'bob@test.com', share: 1 },
        { email: 'charlie@test.com', share: 1 },
      ],
      shareType: 'equal',
    })

    const debts = calculateRecordDebts(record)

    // Charlie owes both Alice and Bob proportionally
    // Each person owes ~33.33
    // Charlie owes Alice: 33.33 * (60/100) = 20
    // Charlie owes Bob: 33.33 * (40/100) = 13.33
    // Alice gets back: 33.33 - own share = -6.67 (Alice owes Bob)
    // Bob gets back: 33.33 - own share = -6.67 (Bob owes Alice)

    // Find Charlie's debts
    const charlieDebts = debts.filter((d) => d.from === 'charlie@test.com')
    expect(charlieDebts.length).toBe(2)

    const charlieToAlice = charlieDebts.find((d) => d.to === 'alice@test.com')
    const charlieToBob = charlieDebts.find((d) => d.to === 'bob@test.com')

    expect(charlieToAlice?.amount).toBeCloseTo(20, 1)
    expect(charlieToBob?.amount).toBeCloseTo(13.33, 1)
  })

  it('filters out trivial debts (< 0.01)', () => {
    const record = createTestRecord({
      amount: 0.01,
      paidBy: [{ email: 'alice@test.com', share: 0.01 }],
      paidFor: [
        { email: 'alice@test.com', share: 1 },
        { email: 'bob@test.com', share: 1 },
      ],
      shareType: 'equal',
    })

    const debts = calculateRecordDebts(record)

    // Debt would be 0.005, which is < 0.01, so filtered out
    expect(debts).toHaveLength(0)
  })
})

// ============================================
// aggregateAndSimplifyDebts() Tests (Net Simplification)
// ============================================
describe('aggregateAndSimplifyDebts', () => {
  it('nets out opposing debts', () => {
    const debts: Debt[] = [
      { from: 'alice@test.com', to: 'bob@test.com', amount: 10, currency: 'INR' },
      { from: 'bob@test.com', to: 'alice@test.com', amount: 6, currency: 'INR' },
    ]

    const simplified = aggregateAndSimplifyDebts(debts)

    // Alice owes Bob $10, Bob owes Alice $6 -> Alice owes Bob $4
    expect(simplified).toHaveLength(1)
    expect(simplified[0]).toMatchObject({
      from: 'alice@test.com',
      to: 'bob@test.com',
      amount: 4,
      currency: 'INR',
    })
  })

  it('completely cancels equal debts', () => {
    const debts: Debt[] = [
      { from: 'alice@test.com', to: 'bob@test.com', amount: 10, currency: 'INR' },
      { from: 'bob@test.com', to: 'alice@test.com', amount: 10, currency: 'INR' },
    ]

    const simplified = aggregateAndSimplifyDebts(debts)

    // Debts cancel out completely
    expect(simplified).toHaveLength(0)
  })

  it('keeps multi-currency debts separate', () => {
    const debts: Debt[] = [
      { from: 'alice@test.com', to: 'bob@test.com', amount: 10, currency: 'INR' },
      { from: 'alice@test.com', to: 'bob@test.com', amount: 5, currency: 'USD' },
    ]

    const simplified = aggregateAndSimplifyDebts(debts)

    // Should have 2 separate debts (one per currency)
    expect(simplified).toHaveLength(2)

    const inrDebt = simplified.find((d) => d.currency === 'INR')
    const usdDebt = simplified.find((d) => d.currency === 'USD')

    expect(inrDebt?.amount).toBe(10)
    expect(usdDebt?.amount).toBe(5)
  })

  it('aggregates same-direction debts', () => {
    const debts: Debt[] = [
      { from: 'alice@test.com', to: 'bob@test.com', amount: 10, currency: 'INR' },
      { from: 'alice@test.com', to: 'bob@test.com', amount: 20, currency: 'INR' },
    ]

    const simplified = aggregateAndSimplifyDebts(debts)

    // Both debts aggregate to single debt
    expect(simplified).toHaveLength(1)
    expect(simplified[0].amount).toBe(30)
  })

  it('handles three-way debts', () => {
    const debts: Debt[] = [
      { from: 'alice@test.com', to: 'bob@test.com', amount: 10, currency: 'INR' },
      { from: 'bob@test.com', to: 'charlie@test.com', amount: 10, currency: 'INR' },
      { from: 'charlie@test.com', to: 'alice@test.com', amount: 10, currency: 'INR' },
    ]

    const simplified = aggregateAndSimplifyDebts(debts)

    // Each pair has one debt, none cancel out
    expect(simplified).toHaveLength(3)
  })
})

// ============================================
// calculateUserBalances() Tests
// ============================================
describe('calculateUserBalances', () => {
  it('calculates what user owes and is owed', () => {
    const records = [
      createTestRecord({
        uuid: '1',
        amount: 100,
        paidBy: [{ email: 'alice@test.com', share: 100 }],
        paidFor: [
          { email: 'alice@test.com', share: 1 },
          { email: 'bob@test.com', share: 1 },
        ],
        shareType: 'equal',
      }),
    ]

    const balance = calculateUserBalances(records, 'alice@test.com')

    // Alice paid 100, split with Bob equally
    // Bob owes Alice 50
    expect(balance.owes).toHaveLength(0)
    expect(balance.owedBy).toHaveLength(1)
    expect(balance.owedBy[0]).toMatchObject({
      email: 'bob@test.com',
      amount: 50,
    })
    expect(balance.netBalance).toBe(50)
  })

  it('calculates negative balance when user owes others', () => {
    const records = [
      createTestRecord({
        uuid: '1',
        amount: 100,
        paidBy: [{ email: 'bob@test.com', share: 100 }],
        paidFor: [
          { email: 'alice@test.com', share: 1 },
          { email: 'bob@test.com', share: 1 },
        ],
        shareType: 'equal',
      }),
    ]

    const balance = calculateUserBalances(records, 'alice@test.com')

    // Alice owes Bob 50
    expect(balance.owes).toHaveLength(1)
    expect(balance.owes[0]).toMatchObject({
      email: 'bob@test.com',
      amount: 50,
    })
    expect(balance.owedBy).toHaveLength(0)
    expect(balance.netBalance).toBe(-50)
  })

  it('aggregates multiple records correctly', () => {
    const records = [
      createTestRecord({
        uuid: '1',
        amount: 100,
        paidBy: [{ email: 'alice@test.com', share: 100 }],
        paidFor: [
          { email: 'alice@test.com', share: 1 },
          { email: 'bob@test.com', share: 1 },
        ],
        shareType: 'equal',
      }),
      createTestRecord({
        uuid: '2',
        amount: 60,
        paidBy: [{ email: 'bob@test.com', share: 60 }],
        paidFor: [
          { email: 'alice@test.com', share: 1 },
          { email: 'bob@test.com', share: 1 },
        ],
        shareType: 'equal',
      }),
    ]

    const balance = calculateUserBalances(records, 'alice@test.com')

    // Record 1: Bob owes Alice 50
    // Record 2: Alice owes Bob 30
    // Net: Bob owes Alice 20
    expect(balance.owedBy).toHaveLength(1)
    expect(balance.owedBy[0].amount).toBe(20)
    expect(balance.netBalance).toBe(20)
  })
})

// ============================================
// calculateBalancesByGroup() Tests
// ============================================
describe('calculateBalancesByGroup', () => {
  it('groups records by groupId', () => {
    const records = [
      createTestRecord({
        uuid: '1',
        groupId: 'group-1',
        amount: 100,
        paidBy: [{ email: 'alice@test.com', share: 100 }],
        paidFor: [
          { email: 'alice@test.com', share: 1 },
          { email: 'bob@test.com', share: 1 },
        ],
      }),
      createTestRecord({
        uuid: '2',
        groupId: 'group-2',
        amount: 200,
        paidBy: [{ email: 'bob@test.com', share: 200 }],
        paidFor: [
          { email: 'alice@test.com', share: 1 },
          { email: 'bob@test.com', share: 1 },
        ],
      }),
    ]

    const balances = calculateBalancesByGroup(records, 'alice@test.com')

    expect(balances.size).toBe(2)

    // Group 1: Bob owes Alice 50
    const group1 = balances.get('group-1')
    expect(group1?.owedBy).toHaveLength(1)
    expect(group1?.owedBy[0].amount).toBe(50)

    // Group 2: Alice owes Bob 100
    const group2 = balances.get('group-2')
    expect(group2?.owes).toHaveLength(1)
    expect(group2?.owes[0].amount).toBe(100)
  })

  it('handles null groupId as ungrouped', () => {
    const records = [
      createTestRecord({
        uuid: '1',
        groupId: null,
        amount: 100,
        paidBy: [{ email: 'alice@test.com', share: 100 }],
        paidFor: [
          { email: 'alice@test.com', share: 1 },
          { email: 'bob@test.com', share: 1 },
        ],
      }),
    ]

    const balances = calculateBalancesByGroup(records, 'alice@test.com')

    expect(balances.has('ungrouped')).toBe(true)
  })
})

// ============================================
// formatAmount() Tests
// ============================================
describe('formatAmount', () => {
  it('formats INR amounts correctly', () => {
    const formatted = formatAmount(1234.56, 'INR')
    expect(formatted).toContain('1,234')
  })

  it('formats USD amounts correctly', () => {
    const formatted = formatAmount(1234.56, 'USD')
    expect(formatted).toContain('1,234')
  })

  it('handles zero amounts', () => {
    const formatted = formatAmount(0, 'INR')
    expect(formatted).toContain('0')
  })
})

// ============================================
// Integration Tests
// ============================================
describe('Integration: Full balance calculation flow', () => {
  it('handles a realistic expense sharing scenario', () => {
    // Trip expenses: Alice, Bob, Charlie
    const records = [
      // Alice pays for dinner (300 INR, split equally)
      createTestRecord({
        uuid: 'dinner',
        amount: 300,
        currency: 'INR',
        paidBy: [{ email: 'alice@test.com', share: 300 }],
        paidFor: [
          { email: 'alice@test.com', share: 1 },
          { email: 'bob@test.com', share: 1 },
          { email: 'charlie@test.com', share: 1 },
        ],
        shareType: 'equal',
      }),
      // Bob pays for taxi (150 INR, split equally)
      createTestRecord({
        uuid: 'taxi',
        amount: 150,
        currency: 'INR',
        paidBy: [{ email: 'bob@test.com', share: 150 }],
        paidFor: [
          { email: 'alice@test.com', share: 1 },
          { email: 'bob@test.com', share: 1 },
          { email: 'charlie@test.com', share: 1 },
        ],
        shareType: 'equal',
      }),
    ]

    // From Alice's perspective
    const aliceBalance = calculateUserBalances(records, 'alice@test.com')

    // Dinner: Bob owes Alice 100, Charlie owes Alice 100
    // Taxi: Alice owes Bob 50
    // Net with Bob: Bob owes Alice 100 - 50 = 50
    // Net with Charlie: Charlie owes Alice 100

    // Check Alice is owed money
    expect(aliceBalance.netBalance).toBeGreaterThan(0)

    // From Bob's perspective
    const bobBalance = calculateUserBalances(records, 'bob@test.com')

    // Dinner: Bob owes Alice 100
    // Taxi: Alice owes Bob 50, Charlie owes Bob 50
    // Net with Alice: Bob owes Alice 50
    // Net with Charlie: Charlie owes Bob 50

    // Bob's net should be 0 (owes 50, owed 50)
    expect(bobBalance.netBalance).toBeCloseTo(0, 1)

    // From Charlie's perspective
    const charlieBalance = calculateUserBalances(records, 'charlie@test.com')

    // Charlie owes Alice 100, Charlie owes Bob 50
    // Total owes: 150
    expect(charlieBalance.netBalance).toBe(-150)
  })

  it('handles settlement records correctly', () => {
    const records = [
      // Initial expense: Alice pays 100, split with Bob
      createTestRecord({
        uuid: 'expense',
        amount: 100,
        paidBy: [{ email: 'alice@test.com', share: 100 }],
        paidFor: [
          { email: 'alice@test.com', share: 1 },
          { email: 'bob@test.com', share: 1 },
        ],
        shareType: 'equal',
      }),
      // Settlement: Bob pays Alice 50 (exact payment)
      createTestRecord({
        uuid: 'settlement',
        title: 'Settlement',
        category: 'Settlement',
        amount: 50,
        paidBy: [{ email: 'bob@test.com', share: 50 }],
        paidFor: [{ email: 'alice@test.com', share: 50 }],
        shareType: 'exact',
      }),
    ]

    const aliceBalance = calculateUserBalances(records, 'alice@test.com')

    // After settlement, they should be even
    expect(aliceBalance.netBalance).toBeCloseTo(0, 1)
    expect(aliceBalance.owes).toHaveLength(0)
    expect(aliceBalance.owedBy).toHaveLength(0)
  })
})
