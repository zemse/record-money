import { useState, useEffect, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db, generateUUID, now, getCurrentDate, getCurrentTime } from '../db'
import { DEFAULT_GROUP_UUID } from '../types'
import type { ExchangeRates } from '../types'
import {
  calculateUserBalances,
  calculateBalancesByGroup,
  formatAmount,
} from '../utils/balanceCalculator'
import { getExchangeRates, convertAmount, getRatesAge } from '../utils/currencyConverter'

export function DashboardPage() {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates | null>(null)
  const [ratesLoading, setRatesLoading] = useState(false)
  const [ratesError, setRatesError] = useState<string | null>(null)

  const settings = useLiveQuery(() => db.settings.get('main'))
  const users = useLiveQuery(() => db.users.toArray())
  const groups = useLiveQuery(() => db.groups.toArray())
  const records = useLiveQuery(() => db.records.toArray())

  // Fetch exchange rates on mount and when needed
  const fetchRates = useCallback(async (force = false) => {
    setRatesLoading(true)
    setRatesError(null)
    try {
      const rates = await getExchangeRates(force)
      setExchangeRates(rates)
    } catch {
      setRatesError('Failed to fetch exchange rates')
    } finally {
      setRatesLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRates()
  }, [fetchRates])

  // Helper to convert and format amount to display currency
  const convertToDisplayCurrency = useCallback(
    (amount: number, fromCurrency: string, toCurrency: string): number => {
      if (!exchangeRates || fromCurrency === toCurrency) return amount
      return convertAmount(amount, fromCurrency, toCurrency, exchangeRates)
    },
    [exchangeRates]
  )

  const currentUserEmail = settings?.currentUserEmail
  const currentUser = users?.find((u) => u.email === currentUserEmail)

  const getUserAlias = (email: string) => {
    const user = users?.find((u) => u.email === email)
    return user?.alias || email
  }

  // Create a settlement record
  const handleSettleUp = async (
    fromEmail: string,
    toEmail: string,
    amount: number,
    currency: string
  ) => {
    const fromAlias = getUserAlias(fromEmail)
    const toAlias = getUserAlias(toEmail)

    if (
      !window.confirm(
        `Create settlement: ${fromAlias} pays ${toAlias} ${formatAmount(amount, currency)}?`
      )
    ) {
      return
    }

    const timestamp = now()
    await db.records.add({
      uuid: generateUUID(),
      title: `Settlement: ${fromAlias} → ${toAlias}`,
      description: 'Debt settlement',
      category: 'Settlement',
      amount,
      currency,
      date: getCurrentDate(),
      time: getCurrentTime(),
      icon: '🤝',
      paidBy: [{ email: fromEmail, share: amount }],
      paidFor: [{ email: toEmail, share: amount }],
      shareType: 'exact',
      groupId: DEFAULT_GROUP_UUID,
      comments: `Settlement of ${formatAmount(amount, currency)} from ${fromAlias} to ${toAlias}`,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  }

  // If no current user is set, show prompt
  if (!currentUserEmail || !currentUser) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-content">Dashboard</h1>
          <p className="text-sm text-content-secondary">Your expense summary at a glance</p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="flex items-start gap-4">
            <span className="text-3xl">👋</span>
            <div>
              <h2 className="font-semibold text-amber-800 dark:text-amber-300">
                Set up your profile
              </h2>
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                To see your personalized balance summary, you need to set yourself as "Me" first.
              </p>
              <Link
                to="/users"
                className="mt-4 inline-block rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-amber-700"
              >
                Go to Users Page
              </Link>
            </div>
          </div>
        </div>

        {/* Show some stats even without a current user */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-border-default bg-surface p-5">
            <p className="text-sm text-content-secondary">Total Records</p>
            <p className="mt-1 text-2xl font-semibold text-content">{records?.length || 0}</p>
          </div>
          <div className="rounded-2xl border border-border-default bg-surface p-5">
            <p className="text-sm text-content-secondary">Users</p>
            <p className="mt-1 text-2xl font-semibold text-content">{users?.length || 0}</p>
          </div>
          <div className="rounded-2xl border border-border-default bg-surface p-5">
            <p className="text-sm text-content-secondary">Groups</p>
            <p className="mt-1 text-2xl font-semibold text-content">
              {groups?.filter((g) => !g.isDefault).length || 0}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Calculate balances
  const allRecords = records || []
  const overallBalance = calculateUserBalances(allRecords, currentUserEmail)
  const balancesByGroup = calculateBalancesByGroup(allRecords, currentUserEmail)

  // Get display currency (fallback to INR)
  const displayCurrency = settings?.defaultDisplayCurrency || 'INR'

  // Calculate totals converted to display currency
  const totalOwed = overallBalance.owedBy.reduce(
    (sum, d) => sum + convertToDisplayCurrency(d.amount, d.currency, displayCurrency),
    0
  )
  const totalOwes = overallBalance.owes.reduce(
    (sum, d) => sum + convertToDisplayCurrency(d.amount, d.currency, displayCurrency),
    0
  )
  const netBalance = totalOwed - totalOwes

  // Check if we have mixed currencies (need conversion)
  const allCurrencies = new Set([
    ...overallBalance.owedBy.map((d) => d.currency),
    ...overallBalance.owes.map((d) => d.currency),
  ])
  const hasMixedCurrencies =
    allCurrencies.size > 1 || (allCurrencies.size === 1 && !allCurrencies.has(displayCurrency))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-content">Dashboard</h1>
        <p className="text-sm text-content-secondary">Welcome back, {currentUser.alias}</p>
      </div>

      {/* Overall Summary Card */}
      <div className="rounded-2xl border border-border-default bg-surface p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-content">Overall Balance</h2>
          {/* Exchange rate info */}
          {hasMixedCurrencies && (
            <div className="flex items-center gap-2 text-xs text-content-tertiary">
              {exchangeRates && <span>Rates: {getRatesAge(exchangeRates.fetchedAt)}</span>}
              <button
                onClick={() => fetchRates(true)}
                disabled={ratesLoading}
                className="rounded-lg bg-surface-tertiary px-2 py-1 text-xs font-medium text-content-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
              >
                {ratesLoading ? '...' : '↻'}
              </button>
            </div>
          )}
        </div>

        {ratesError && hasMixedCurrencies && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            {ratesError}. Showing unconverted values.
          </p>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {/* You are owed */}
          <div className="rounded-xl bg-green-50 p-4 dark:bg-green-500/10">
            <p className="text-sm text-green-700 dark:text-green-400">You are owed</p>
            <p className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">
              {formatAmount(totalOwed, displayCurrency)}
            </p>
            {hasMixedCurrencies && exchangeRates && (
              <p className="mt-1 text-xs text-green-600/70 dark:text-green-400/70">converted</p>
            )}
          </div>

          {/* You owe */}
          <div className="rounded-xl bg-red-50 p-4 dark:bg-red-500/10">
            <p className="text-sm text-red-700 dark:text-red-400">You owe</p>
            <p className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">
              {formatAmount(totalOwes, displayCurrency)}
            </p>
            {hasMixedCurrencies && exchangeRates && (
              <p className="mt-1 text-xs text-red-600/70 dark:text-red-400/70">converted</p>
            )}
          </div>

          {/* Net Balance */}
          <div
            className={`rounded-xl p-4 ${
              netBalance >= 0 ? 'bg-green-50 dark:bg-green-500/10' : 'bg-red-50 dark:bg-red-500/10'
            }`}
          >
            <p
              className={`text-sm ${
                netBalance >= 0
                  ? 'text-green-700 dark:text-green-400'
                  : 'text-red-700 dark:text-red-400'
              }`}
            >
              Net Balance
            </p>
            <p
              className={`mt-1 text-2xl font-bold ${
                netBalance >= 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {netBalance >= 0 ? '+' : ''}
              {formatAmount(netBalance, displayCurrency)}
            </p>
            {hasMixedCurrencies && exchangeRates && (
              <p
                className={`mt-1 text-xs ${
                  netBalance >= 0
                    ? 'text-green-600/70 dark:text-green-400/70'
                    : 'text-red-600/70 dark:text-red-400/70'
                }`}
              >
                converted
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Detailed Balances - Who owes you / You owe */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* People who owe you */}
        <div className="rounded-2xl border border-border-default bg-surface p-5">
          <h3 className="font-medium text-content">People who owe you</h3>
          {overallBalance.owedBy.length === 0 ? (
            <p className="mt-3 text-sm text-content-secondary">No one owes you right now</p>
          ) : (
            <div className="mt-3 space-y-2">
              {overallBalance.owedBy.map((debt, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2 dark:bg-green-500/10"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100 text-sm font-medium text-green-700 dark:bg-green-500/20 dark:text-green-400">
                      {getUserAlias(debt.email).charAt(0).toUpperCase()}
                    </span>
                    <span className="text-sm font-medium text-content">
                      {getUserAlias(debt.email)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-green-600 dark:text-green-400">
                      {formatAmount(debt.amount, debt.currency)}
                    </span>
                    <button
                      onClick={() =>
                        handleSettleUp(debt.email, currentUserEmail, debt.amount, debt.currency)
                      }
                      className="rounded-lg bg-green-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-green-700"
                    >
                      Settle
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* People you owe */}
        <div className="rounded-2xl border border-border-default bg-surface p-5">
          <h3 className="font-medium text-content">People you owe</h3>
          {overallBalance.owes.length === 0 ? (
            <p className="mt-3 text-sm text-content-secondary">You don't owe anyone right now</p>
          ) : (
            <div className="mt-3 space-y-2">
              {overallBalance.owes.map((debt, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 dark:bg-red-500/10"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-sm font-medium text-red-700 dark:bg-red-500/20 dark:text-red-400">
                      {getUserAlias(debt.email).charAt(0).toUpperCase()}
                    </span>
                    <span className="text-sm font-medium text-content">
                      {getUserAlias(debt.email)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-red-600 dark:text-red-400">
                      {formatAmount(debt.amount, debt.currency)}
                    </span>
                    <button
                      onClick={() =>
                        handleSettleUp(currentUserEmail, debt.email, debt.amount, debt.currency)
                      }
                      className="rounded-lg bg-red-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700"
                    >
                      Settle
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Per-Group Balance Cards */}
      {groups && groups.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-content">Balance by Group</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => {
              const groupBalance = balancesByGroup.get(group.uuid)
              if (!groupBalance) return null

              // Convert group balances to display currency
              const groupOwed = groupBalance.owedBy.reduce(
                (sum, d) => sum + convertToDisplayCurrency(d.amount, d.currency, displayCurrency),
                0
              )
              const groupOwes = groupBalance.owes.reduce(
                (sum, d) => sum + convertToDisplayCurrency(d.amount, d.currency, displayCurrency),
                0
              )
              const groupNet = groupOwed - groupOwes

              const isExpanded = expandedGroup === group.uuid
              const hasActivity = groupBalance.owedBy.length > 0 || groupBalance.owes.length > 0

              if (!hasActivity && !group.isDefault) return null

              return (
                <div
                  key={group.uuid}
                  className={`rounded-2xl border p-4 transition-all ${
                    group.isDefault
                      ? 'border-primary/30 bg-primary-light'
                      : 'border-border-default bg-surface'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{group.isDefault ? '📁' : '👥'}</span>
                      <span className="font-medium text-content">{group.name}</span>
                    </div>
                    <span
                      className={`text-sm font-semibold ${
                        groupNet >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {groupNet >= 0 ? '+' : ''}
                      {formatAmount(groupNet, displayCurrency)}
                    </span>
                  </div>

                  {hasActivity && (
                    <button
                      onClick={() => setExpandedGroup(isExpanded ? null : group.uuid)}
                      className="mt-2 text-xs text-primary hover:underline"
                    >
                      {isExpanded ? 'Hide details' : 'Show details'}
                    </button>
                  )}

                  {isExpanded && (
                    <div className="mt-3 space-y-1 border-t border-border-default pt-3">
                      {groupBalance.owedBy.map((debt, idx) => (
                        <div key={`owed-${idx}`} className="flex justify-between text-sm">
                          <span className="text-content-secondary">
                            {getUserAlias(debt.email)} owes you
                          </span>
                          <span className="text-green-600 dark:text-green-400">
                            {formatAmount(debt.amount, debt.currency)}
                          </span>
                        </div>
                      ))}
                      {groupBalance.owes.map((debt, idx) => (
                        <div key={`owes-${idx}`} className="flex justify-between text-sm">
                          <span className="text-content-secondary">
                            You owe {getUserAlias(debt.email)}
                          </span>
                          <span className="text-red-600 dark:text-red-400">
                            {formatAmount(debt.amount, debt.currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border-default bg-surface p-5">
          <p className="text-sm text-content-secondary">Total Records</p>
          <p className="mt-1 text-2xl font-semibold text-content">{records?.length || 0}</p>
        </div>
        <div className="rounded-2xl border border-border-default bg-surface p-5">
          <p className="text-sm text-content-secondary">Active Groups</p>
          <p className="mt-1 text-2xl font-semibold text-content">
            {groups?.filter((g) => !g.isDefault).length || 0}
          </p>
        </div>
        <div className="rounded-2xl border border-border-default bg-surface p-5">
          <p className="text-sm text-content-secondary">Display Currency</p>
          <p className="mt-1 text-2xl font-semibold text-content">{displayCurrency}</p>
        </div>
      </div>
    </div>
  )
}
