import type { ExpenseRecord, ShareType } from '../types'

// Represents a debt from one person to another
export interface Debt {
  from: string // email
  to: string // email
  amount: number
  currency: string
}

// Balance between two users (net simplified)
export interface Balance {
  user1: string
  user2: string
  amount: number // positive = user1 owes user2, negative = user2 owes user1
  currency: string
}

// User balance summary (from the perspective of a specific user)
export interface UserBalanceSummary {
  email: string
  owes: { email: string; amount: number; currency: string }[] // people this user owes
  owedBy: { email: string; amount: number; currency: string }[] // people who owe this user
  netBalance: number // positive = owed to user, negative = user owes
}

// Group balance summary
export interface GroupBalanceSummary {
  groupId: string
  groupName: string
  balances: Map<string, number> // email -> net balance (positive = owed, negative = owes)
  debts: Debt[]
}

/**
 * Calculate what each participant owes based on the share type
 */
export function calculateShares(
  totalAmount: number,
  shareType: ShareType,
  participants: { email: string; share: number }[]
): Map<string, number> {
  const shares = new Map<string, number>()

  if (participants.length === 0) return shares

  switch (shareType) {
    case 'equal': {
      const equalShare = totalAmount / participants.length
      participants.forEach((p) => shares.set(p.email, equalShare))
      break
    }
    case 'percentage': {
      participants.forEach((p) => {
        shares.set(p.email, (totalAmount * p.share) / 100)
      })
      break
    }
    case 'exact': {
      participants.forEach((p) => {
        shares.set(p.email, p.share)
      })
      break
    }
    case 'shares': {
      const totalShares = participants.reduce((sum, p) => sum + p.share, 0)
      if (totalShares > 0) {
        participants.forEach((p) => {
          shares.set(p.email, (totalAmount * p.share) / totalShares)
        })
      }
      break
    }
  }

  return shares
}

/**
 * Calculate debts from a single record
 * Returns an array of debts (who owes whom and how much)
 */
export function calculateRecordDebts(record: ExpenseRecord): Debt[] {
  const debts: Debt[] = []

  // Calculate what each person paid
  const paidByAmounts = new Map<string, number>()
  record.paidBy.forEach((p) => {
    paidByAmounts.set(p.email, (paidByAmounts.get(p.email) || 0) + p.share)
  })

  // Calculate what each person owes (their share of the expense)
  const owedAmounts = calculateShares(record.amount, record.shareType, record.paidFor)

  // For each person who owes money, calculate debt to each payer
  // proportional to how much each payer contributed
  const totalPaid = Array.from(paidByAmounts.values()).reduce((sum, v) => sum + v, 0)

  owedAmounts.forEach((owedAmount, owingEmail) => {
    paidByAmounts.forEach((paidAmount, payerEmail) => {
      if (owingEmail === payerEmail) return // Skip self

      // This person owes (their share) * (payer's contribution / total paid) to this payer
      const debtAmount = owedAmount * (paidAmount / totalPaid)

      if (debtAmount > 0.01) {
        // Only add non-trivial debts
        debts.push({
          from: owingEmail,
          to: payerEmail,
          amount: debtAmount,
          currency: record.currency,
        })
      }
    })
  })

  return debts
}

/**
 * Aggregate debts and simplify (net out opposing debts)
 */
export function aggregateAndSimplifyDebts(debts: Debt[]): Debt[] {
  // Group debts by currency, then by pair of users
  const debtsByCurrency = new Map<string, Map<string, number>>()

  debts.forEach((debt) => {
    if (!debtsByCurrency.has(debt.currency)) {
      debtsByCurrency.set(debt.currency, new Map())
    }

    const currencyDebts = debtsByCurrency.get(debt.currency)!

    // Create a canonical key for the pair (sorted alphabetically)
    const [user1, user2] = [debt.from, debt.to].sort()
    const key = `${user1}|${user2}`

    const currentAmount = currencyDebts.get(key) || 0

    // If debt.from is user1, add amount; if debt.from is user2, subtract
    if (debt.from === user1) {
      currencyDebts.set(key, currentAmount + debt.amount)
    } else {
      currencyDebts.set(key, currentAmount - debt.amount)
    }
  })

  // Convert back to Debt array
  const simplifiedDebts: Debt[] = []

  debtsByCurrency.forEach((currencyDebts, currency) => {
    currencyDebts.forEach((amount, key) => {
      if (Math.abs(amount) < 0.01) return // Skip settled debts

      const [user1, user2] = key.split('|')

      if (amount > 0) {
        // user1 owes user2
        simplifiedDebts.push({ from: user1, to: user2, amount, currency })
      } else {
        // user2 owes user1
        simplifiedDebts.push({ from: user2, to: user1, amount: -amount, currency })
      }
    })
  })

  return simplifiedDebts
}

/**
 * Calculate all debts from a list of records
 */
export function calculateAllDebts(records: ExpenseRecord[]): Debt[] {
  const allDebts: Debt[] = []

  records.forEach((record) => {
    const recordDebts = calculateRecordDebts(record)
    allDebts.push(...recordDebts)
  })

  return aggregateAndSimplifyDebts(allDebts)
}

/**
 * Calculate balances for a specific user
 */
export function calculateUserBalances(
  records: ExpenseRecord[],
  userEmail: string
): UserBalanceSummary {
  const debts = calculateAllDebts(records)

  const owes: { email: string; amount: number; currency: string }[] = []
  const owedBy: { email: string; amount: number; currency: string }[] = []

  debts.forEach((debt) => {
    if (debt.from === userEmail) {
      owes.push({ email: debt.to, amount: debt.amount, currency: debt.currency })
    } else if (debt.to === userEmail) {
      owedBy.push({ email: debt.from, amount: debt.amount, currency: debt.currency })
    }
  })

  // Calculate net balance (positive = owed to user, negative = user owes)
  // Note: This is simplified and assumes single currency for net calculation
  const totalOwed = owedBy.reduce((sum, d) => sum + d.amount, 0)
  const totalOwes = owes.reduce((sum, d) => sum + d.amount, 0)
  const netBalance = totalOwed - totalOwes

  return {
    email: userEmail,
    owes,
    owedBy,
    netBalance,
  }
}

/**
 * Calculate balances grouped by groupId
 */
export function calculateBalancesByGroup(
  records: ExpenseRecord[],
  userEmail: string
): Map<string, UserBalanceSummary> {
  // Group records by groupId
  const recordsByGroup = new Map<string, ExpenseRecord[]>()

  records.forEach((record) => {
    const groupId = record.groupId || 'ungrouped'
    if (!recordsByGroup.has(groupId)) {
      recordsByGroup.set(groupId, [])
    }
    recordsByGroup.get(groupId)!.push(record)
  })

  // Calculate balances for each group
  const balancesByGroup = new Map<string, UserBalanceSummary>()

  recordsByGroup.forEach((groupRecords, groupId) => {
    balancesByGroup.set(groupId, calculateUserBalances(groupRecords, userEmail))
  })

  return balancesByGroup
}

/**
 * Format currency amount for display
 */
export function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}
