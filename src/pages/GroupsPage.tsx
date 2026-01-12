import { useState, useEffect, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateUUID, now } from '../db'
import type { Group, ExchangeRates } from '../types'
import { DEFAULT_GROUP_UUID } from '../types'
import { UserPicker } from '../components/UserPicker'
import { calculateBalancesByGroup, formatAmount } from '../utils/balanceCalculator'
import { getExchangeRates, convertAmount } from '../utils/currencyConverter'
import {
  generateExportUrl,
  exportToFile,
  copyToClipboard,
  getUsersFromRecords,
} from '../utils/dataTransport'

export function GroupsPage() {
  const [showForm, setShowForm] = useState(false)
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)
  const [name, setName] = useState('')
  const [members, setMembers] = useState<string[]>([])
  const [error, setError] = useState('')
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates | null>(null)

  // Export states
  const [exportingGroupId, setExportingGroupId] = useState<string | null>(null)
  const [exportMessage, setExportMessage] = useState('')

  const groups = useLiveQuery(() => db.groups.toArray())
  const users = useLiveQuery(() => db.users.toArray())
  const records = useLiveQuery(() => db.records.toArray())
  const settings = useLiveQuery(() => db.settings.get('main'))

  const currentUserEmail = settings?.currentUserEmail
  const displayCurrency = settings?.defaultDisplayCurrency || 'INR'

  // Fetch exchange rates
  useEffect(() => {
    getExchangeRates().then(setExchangeRates)
  }, [])

  // Calculate balances by group for current user
  const balancesByGroup =
    currentUserEmail && records ? calculateBalancesByGroup(records, currentUserEmail) : new Map()

  // Helper to convert amount to display currency
  const convertToDisplayCurrency = useCallback(
    (amount: number, fromCurrency: string): number => {
      if (!exchangeRates || fromCurrency === displayCurrency) return amount
      return convertAmount(amount, fromCurrency, displayCurrency, exchangeRates)
    },
    [exchangeRates, displayCurrency]
  )

  // Calculate group balance summary
  const getGroupBalanceSummary = (groupId: string) => {
    const balance = balancesByGroup.get(groupId)
    if (!balance) return { net: 0, hasActivity: false }

    const owed = balance.owedBy.reduce(
      (sum: number, d: { email: string; amount: number; currency: string }) =>
        sum + convertToDisplayCurrency(d.amount, d.currency),
      0
    )
    const owes = balance.owes.reduce(
      (sum: number, d: { email: string; amount: number; currency: string }) =>
        sum + convertToDisplayCurrency(d.amount, d.currency),
      0
    )

    return {
      net: owed - owes,
      hasActivity: balance.owedBy.length > 0 || balance.owes.length > 0,
    }
  }

  const resetForm = () => {
    setName('')
    setMembers([])
    setError('')
    setShowForm(false)
    setEditingGroup(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('Group name is required')
      return
    }

    try {
      const timestamp = now()

      if (editingGroup) {
        await db.groups.update(editingGroup.uuid, {
          name: name.trim(),
          members,
          updatedAt: timestamp,
        })
      } else {
        await db.groups.add({
          uuid: generateUUID(),
          name: name.trim(),
          members,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
      }
      resetForm()
    } catch {
      setError('Failed to save group')
    }
  }

  const handleEdit = (group: Group) => {
    if (group.isDefault) return // Cannot edit default group
    setEditingGroup(group)
    setName(group.name)
    setMembers(group.members)
    setShowForm(true)
  }

  const handleDelete = async (uuid: string) => {
    if (uuid === DEFAULT_GROUP_UUID) return // Cannot delete default group
    if (window.confirm('Are you sure you want to delete this group?')) {
      await db.groups.delete(uuid)
    }
  }

  const getUserAlias = (email: string) => {
    const user = users?.find((u) => u.email === email)
    return user?.alias || email
  }

  // Get records for a specific group
  const getGroupRecords = (groupId: string) => {
    return records?.filter((r) => r.groupId === groupId) || []
  }

  // Export handlers
  const handleExportUrl = async (group: Group) => {
    if (!users) return

    const groupRecords = getGroupRecords(group.uuid)
    if (groupRecords.length === 0) {
      setExportMessage('No records to export in this group')
      setTimeout(() => setExportMessage(''), 3000)
      return
    }

    const exportUsers = getUsersFromRecords(groupRecords, users)
    const result = generateExportUrl(groupRecords, exportUsers)

    if (result.success) {
      const copied = await copyToClipboard(result.url)
      setExportMessage(copied ? 'Link copied to clipboard!' : 'Failed to copy link')
    } else {
      setExportMessage(result.error)
    }

    setExportingGroupId(null)
    setTimeout(() => setExportMessage(''), 3000)
  }

  const handleExportFile = (group: Group) => {
    if (!users) return

    const groupRecords = getGroupRecords(group.uuid)
    if (groupRecords.length === 0) {
      setExportMessage('No records to export in this group')
      setExportingGroupId(null)
      setTimeout(() => setExportMessage(''), 3000)
      return
    }

    const exportUsers = getUsersFromRecords(groupRecords, users)
    const filename = `${group.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.recordmoney`

    exportToFile(groupRecords, exportUsers, [group], filename)
    setExportingGroupId(null)
    setExportMessage('File downloaded!')
    setTimeout(() => setExportMessage(''), 3000)
  }

  const inputClassName =
    'mt-1 block w-full rounded-xl border border-border-default bg-surface px-3 py-2.5 text-content shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

  const labelClassName = 'block text-sm font-medium text-content'

  if (showForm) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-content">
            {editingGroup ? 'Edit Group' : 'New Group'}
          </h1>
          <p className="text-sm text-content-secondary">
            {editingGroup ? 'Update group details' : 'Create a group to organize shared expenses'}
          </p>
        </div>
        <div className="max-w-xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className={labelClassName}>Group Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClassName}
                placeholder="Trip to Goa"
              />
            </div>

            <div>
              <label className={labelClassName}>Members</label>
              <div className="mt-1">
                <UserPicker users={users || []} selected={members} onChange={setMembers} multiple />
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={resetForm}
                className="flex-1 rounded-xl border border-border-default bg-surface px-4 py-2.5 font-medium text-content transition-colors hover:bg-surface-tertiary"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-primary px-4 py-2.5 font-medium text-white shadow-sm transition-all hover:bg-primary-hover hover:shadow-md"
              >
                {editingGroup ? 'Save' : 'Create Group'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-content">Groups</h1>
          <p className="text-sm text-content-secondary">
            {groups?.length || 0} {groups?.length === 1 ? 'group' : 'groups'}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-hover hover:shadow-md"
        >
          + New Group
        </button>
      </div>

      {/* Export message */}
      {exportMessage && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            exportMessage.includes('copied') || exportMessage.includes('downloaded')
              ? 'bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400'
              : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
          }`}
        >
          {exportMessage}
        </div>
      )}

      {!groups || groups.length === 0 ? (
        <div className="rounded-2xl border border-border-default bg-surface py-16 text-center">
          <p className="text-5xl">👥</p>
          <p className="mt-4 text-lg font-medium text-content">No groups yet</p>
          <p className="mt-1 text-sm text-content-secondary">
            Create groups to organize shared expenses
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-6 rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-hover"
          >
            Create Your First Group
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => {
            const balanceSummary = getGroupBalanceSummary(group.uuid)
            return (
              <div
                key={group.uuid}
                className={`rounded-2xl border p-4 transition-all ${
                  group.isDefault
                    ? 'border-primary/30 bg-primary-light'
                    : 'border-border-default bg-surface hover:border-content-tertiary'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-surface-tertiary text-xl">
                      {group.isDefault ? '📁' : '👥'}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium text-content">{group.name}</p>
                        {group.isDefault && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-content-secondary">
                        {group.isDefault
                          ? 'For ungrouped expenses'
                          : group.members.length === 0
                            ? 'No members'
                            : `${group.members.length} ${group.members.length === 1 ? 'member' : 'members'}`}
                      </p>
                    </div>
                  </div>
                  {/* Actions menu */}
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={() =>
                        setExportingGroupId(exportingGroupId === group.uuid ? null : group.uuid)
                      }
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-content-secondary transition-colors hover:bg-surface-tertiary"
                    >
                      <span className="text-lg">⋯</span>
                    </button>

                    {exportingGroupId === group.uuid && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setExportingGroupId(null)}
                        />
                        <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-border-default bg-surface p-2 shadow-lg">
                          <p className="px-3 py-1 text-xs text-content-tertiary">
                            {getGroupRecords(group.uuid).length} records
                          </p>
                          <button
                            onClick={() => handleExportUrl(group)}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-content hover:bg-surface-tertiary"
                          >
                            <span>🔗</span>
                            <span>Copy Share Link</span>
                          </button>
                          <button
                            onClick={() => handleExportFile(group)}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-content hover:bg-surface-tertiary"
                          >
                            <span>📁</span>
                            <span>Download File</span>
                          </button>

                          {!group.isDefault && (
                            <>
                              <div className="my-1 border-t border-border-default" />
                              <button
                                onClick={() => {
                                  setExportingGroupId(null)
                                  handleEdit(group)
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-content hover:bg-surface-tertiary"
                              >
                                <span>✏️</span>
                                <span>Edit Group</span>
                              </button>
                              <button
                                onClick={() => {
                                  setExportingGroupId(null)
                                  handleDelete(group.uuid)
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                              >
                                <span>🗑️</span>
                                <span>Delete Group</span>
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Balance Summary */}
                {currentUserEmail && (
                  <div className="mt-3 border-t border-border-default pt-3">
                    {!balanceSummary.hasActivity ? (
                      <p className="text-sm text-content-tertiary">No activity</p>
                    ) : Math.abs(balanceSummary.net) < 0.01 ? (
                      <div className="flex items-center gap-2">
                        <span className="text-lg">✓</span>
                        <span className="text-sm font-medium text-content-secondary">Settled</span>
                      </div>
                    ) : balanceSummary.net > 0 ? (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-green-700 dark:text-green-400">
                          You get back
                        </span>
                        <span className="font-semibold text-green-600 dark:text-green-400">
                          {formatAmount(balanceSummary.net, displayCurrency)}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-red-700 dark:text-red-400">You owe</span>
                        <span className="font-semibold text-red-600 dark:text-red-400">
                          {formatAmount(Math.abs(balanceSummary.net), displayCurrency)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {!group.isDefault && group.members.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1 border-t border-border-default pt-3">
                    {group.members.map((email) => (
                      <span
                        key={email}
                        className="rounded-lg bg-surface-tertiary px-2 py-1 text-xs text-content-secondary"
                      >
                        {getUserAlias(email)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
