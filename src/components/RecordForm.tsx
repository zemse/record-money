import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type {
  ExpenseRecord,
  User,
  Group,
  ShareType,
  Participant,
  Category,
  Account,
  AccountPayment,
} from '../types'
import { DEFAULT_GROUP_UUID } from '../types'
import { UserPicker } from './UserPicker'
import { addUser, db, generateUUID, now } from '../db'
import { EmojiPicker } from './EmojiPicker'

// Common currencies
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'SGD', 'AED', 'THB']

interface RecordFormProps {
  initialData: Omit<ExpenseRecord, 'uuid' | 'createdAt' | 'updatedAt'>
  users: User[]
  groups: Group[]
  currentUserEmail?: string
  defaultAccountId?: string
  editingRecordId?: string
  onSubmit: (
    data: Omit<ExpenseRecord, 'uuid' | 'createdAt' | 'updatedAt'>,
    recordId?: string
  ) => void
  onCancel: () => void
}

// Detect if initial data represents a split expense
function isSplitExpense(data: Omit<ExpenseRecord, 'uuid' | 'createdAt' | 'updatedAt'>): boolean {
  // Multiple people paid
  if (data.paidBy.length > 1) return true
  // Multiple people to split with
  if (data.paidFor.length > 1) return true
  // One person paid, one person it's for, but they're different people
  if (
    data.paidBy.length === 1 &&
    data.paidFor.length === 1 &&
    data.paidBy[0].email !== data.paidFor[0].email
  ) {
    return true
  }
  return false
}

export function RecordForm({
  initialData,
  users,
  groups,
  currentUserEmail,
  defaultAccountId,
  editingRecordId,
  onSubmit,
  onCancel,
}: RecordFormProps) {
  const [title, setTitle] = useState(initialData.title)
  const [description, setDescription] = useState(initialData.description)
  const [amount, setAmount] = useState(initialData.amount.toString())
  const [currency, setCurrency] = useState(initialData.currency)
  const [date, setDate] = useState(initialData.date)
  const [time, setTime] = useState(initialData.time)
  const [category, setCategory] = useState(initialData.category)
  const [icon, setIcon] = useState(initialData.icon)
  const [groupId, setGroupId] = useState<string>(initialData.groupId || DEFAULT_GROUP_UUID)
  const [shareType, setShareType] = useState<ShareType>(initialData.shareType)
  const [paidByEmails, setPaidByEmails] = useState<string[]>(initialData.paidBy.map((p) => p.email))
  const [paidForEmails, setPaidForEmails] = useState<string[]>(
    initialData.paidFor.map((p) => p.email)
  )
  const [comments, setComments] = useState(initialData.comments)
  const [accountPayments, setAccountPayments] = useState<AccountPayment[]>(() => {
    if (initialData.accounts && initialData.accounts.length > 0) {
      return initialData.accounts
    }
    if (defaultAccountId) {
      return [{ accountId: defaultAccountId, amount: initialData.amount || 0 }]
    }
    return []
  })
  const [error, setError] = useState('')

  // Split mode - defaults to OFF for new records, ON for split expenses being edited
  const [isSplitEnabled, setIsSplitEnabled] = useState(() => isSplitExpense(initialData))

  // Account tracking toggle and inline creation
  const [trackAccount, setTrackAccount] = useState(
    (initialData.accounts && initialData.accounts.length > 0) || !!defaultAccountId
  )
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [newAccountName, setNewAccountName] = useState('')
  const [newAccountIcon, setNewAccountIcon] = useState('💳')
  const [showAccountEmojiPicker, setShowAccountEmojiPicker] = useState(false)
  const [accountError, setAccountError] = useState('')

  // Fetch categories and accounts from database
  const categories = useLiveQuery(() => db.categories.toArray())
  const accounts = useLiveQuery(() => db.accounts.toArray())

  // Filter out Settlement category from the picker (it's system-only for settle up)
  const selectableCategories = categories?.filter((c) => c.name !== 'Settlement') || []

  // Check if form has unsaved changes (only relevant when editing)
  const hasUnsavedChanges = useMemo(() => {
    if (!editingRecordId) return false

    // Compare current state with initial data
    if (title !== initialData.title) return true
    if (description !== initialData.description) return true
    if (amount !== initialData.amount.toString()) return true
    if (currency !== initialData.currency) return true
    if (date !== initialData.date) return true
    if (time !== initialData.time) return true
    if (category !== initialData.category) return true
    if (icon !== initialData.icon) return true
    if (groupId !== (initialData.groupId || DEFAULT_GROUP_UUID)) return true
    if (shareType !== initialData.shareType) return true
    if (comments !== initialData.comments) return true

    // Compare paidBy emails
    const initialPaidByEmails = initialData.paidBy
      .map((p) => p.email)
      .sort()
      .join(',')
    const currentPaidByEmails = paidByEmails.sort().join(',')
    if (currentPaidByEmails !== initialPaidByEmails) return true

    // Compare paidFor emails
    const initialPaidForEmails = initialData.paidFor
      .map((p) => p.email)
      .sort()
      .join(',')
    const currentPaidForEmails = paidForEmails.sort().join(',')
    if (currentPaidForEmails !== initialPaidForEmails) return true

    // Compare accounts
    const initialAccountsStr =
      initialData.accounts
        ?.map((a) => `${a.accountId}:${a.amount}`)
        .sort()
        .join(',') || ''
    const currentAccountsStr =
      trackAccount && accountPayments.length > 0
        ? accountPayments
            .map((a) => `${a.accountId}:${a.amount}`)
            .sort()
            .join(',')
        : ''
    if (currentAccountsStr !== initialAccountsStr) return true

    return false
  }, [
    editingRecordId,
    title,
    description,
    amount,
    currency,
    date,
    time,
    category,
    icon,
    groupId,
    shareType,
    comments,
    paidByEmails,
    paidForEmails,
    trackAccount,
    accountPayments,
    initialData,
  ])

  const handleCategorySelect = (cat: Category) => {
    setCategory(cat.name)
    setIcon(cat.icon)
  }

  const handleAddUser = async (email: string, alias: string) => {
    const result = await addUser(email, alias)
    return { success: result.success, error: result.success ? undefined : result.error }
  }

  const handleAddAccount = async () => {
    setAccountError('')
    if (!newAccountName.trim()) {
      setAccountError('Account name is required')
      return
    }

    // Check for duplicate name
    const existing = accounts?.find(
      (a) => a.name.toLowerCase() === newAccountName.trim().toLowerCase()
    )
    if (existing) {
      setAccountError('An account with this name already exists')
      return
    }

    const newAccount: Account = {
      id: generateUUID(),
      name: newAccountName.trim(),
      icon: newAccountIcon,
      createdAt: now(),
    }

    await db.accounts.add(newAccount)
    // Add the newly created account to selection with remaining amount
    const currentTotal = accountPayments.reduce((sum, ap) => sum + ap.amount, 0)
    const parsedAmount = parseFloat(amount) || 0
    const remaining = Math.max(0, parsedAmount - currentTotal)
    setAccountPayments((prev) => [...prev, { accountId: newAccount.id, amount: remaining }])
    setNewAccountName('')
    setNewAccountIcon('💳')
    setShowAddAccount(false)
  }

  const toggleAccountSelection = (accountId: string) => {
    setAccountPayments((prev) => {
      const existing = prev.find((ap) => ap.accountId === accountId)
      if (existing) {
        // Remove this account
        return prev.filter((ap) => ap.accountId !== accountId)
      } else {
        // Add this account with remaining amount
        const currentTotal = prev.reduce((sum, ap) => sum + ap.amount, 0)
        const parsedAmount = parseFloat(amount) || 0
        const remaining = Math.max(0, parsedAmount - currentTotal)
        return [...prev, { accountId, amount: remaining }]
      }
    })
  }

  const updateAccountAmount = (accountId: string, newAmount: number) => {
    setAccountPayments((prev) =>
      prev.map((ap) => (ap.accountId === accountId ? { ...ap, amount: newAmount } : ap))
    )
  }

  // Calculate total from account payments
  const accountPaymentsTotal = accountPayments.reduce((sum, ap) => sum + ap.amount, 0)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!title.trim()) {
      setError('Title is required')
      return
    }

    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Valid amount is required')
      return
    }

    let finalPaidBy: Participant[]
    let finalPaidFor: Participant[]

    if (!isSplitEnabled) {
      // Personal expense - auto-fill with current user
      if (!currentUserEmail) {
        setError('Set yourself as current user in Settings to record personal expenses')
        return
      }
      finalPaidBy = [{ email: currentUserEmail, share: parsedAmount }]
      finalPaidFor = [{ email: currentUserEmail, share: 1 }]
    } else {
      // Split expense - validate selections
      if (paidByEmails.length === 0) {
        setError('Select who paid')
        return
      }

      if (paidForEmails.length === 0) {
        setError('Select who this is for')
        return
      }

      // Create participants with equal shares by default
      finalPaidBy = paidByEmails.map((email) => ({
        email,
        share: parsedAmount / paidByEmails.length,
      }))

      finalPaidFor = paidForEmails.map((email) => ({
        email,
        share: 1, // Equal share for equal split
      }))
    }

    onSubmit(
      {
        title: title.trim(),
        description: description.trim(),
        category,
        amount: parsedAmount,
        currency,
        date,
        time,
        icon,
        paidBy: finalPaidBy,
        paidFor: finalPaidFor,
        shareType,
        groupId,
        accounts: trackAccount && accountPayments.length > 0 ? accountPayments : undefined,
        comments: comments.trim(),
      },
      editingRecordId
    )
  }

  const inputClassName =
    'mt-1 block w-full rounded-xl border border-border-default bg-surface px-3 py-2.5 text-content shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

  const labelClassName = 'block text-sm font-medium text-content'

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Unsaved changes indicator */}
      {hasUnsavedChanges && (
        <div className="sticky top-0 z-10 -mx-1 -mt-1 rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-700 shadow-sm dark:bg-amber-500/20 dark:text-amber-300">
          <span className="mr-2">⚠️</span>
          You have unsaved changes
        </div>
      )}

      <div>
        <label className={labelClassName}>Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClassName}
          placeholder="Dinner at restaurant"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClassName}>Amount</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputClassName}
            placeholder="0.00"
            step="0.01"
            min="0"
          />
        </div>
        <div>
          <label className={labelClassName}>Currency</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className={inputClassName}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClassName}>Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClassName}
          />
        </div>
        <div>
          <label className={labelClassName}>Time</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={inputClassName}
          />
        </div>
      </div>

      <div>
        <label className={labelClassName}>Category</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {selectableCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCategorySelect(cat)}
              className={`rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                category === cat.name
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-surface-tertiary text-content-secondary hover:bg-surface-hover'
              }`}
            >
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Account Tracking Section - Grouped */}
      <div className="rounded-2xl border border-border-default bg-surface p-4">
        {/* Toggle Header */}
        <div className="flex items-center justify-between">
          <div>
            <span className="font-medium text-content">Payment Account</span>
            <p className="text-sm text-content-secondary">
              {trackAccount && accountPayments.length > 0
                ? `${accountPayments.length} account${accountPayments.length > 1 ? 's' : ''} selected`
                : 'Track which account(s) were used'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTrackAccount(!trackAccount)}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              trackAccount ? 'bg-primary' : 'bg-content-tertiary'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                trackAccount ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>

        {/* Account Selector - only show when tracking is enabled */}
        {trackAccount && (
          <div className="mt-4 border-t border-border-default pt-4">
            {/* Add New Button */}
            {!showAddAccount && (
              <div className="mb-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowAddAccount(true)}
                  className="text-sm font-medium text-primary hover:text-primary-hover"
                >
                  + Add New Account
                </button>
              </div>
            )}

            {/* Inline Add Account Form */}
            {showAddAccount && (
              <div className="mb-3 rounded-xl border border-border-default bg-surface-tertiary p-3">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowAccountEmojiPicker(!showAccountEmojiPicker)}
                      className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface text-xl transition-colors hover:bg-surface-hover"
                    >
                      {newAccountIcon}
                    </button>
                    {showAccountEmojiPicker && (
                      <div className="absolute left-0 top-full z-10 mt-1">
                        <EmojiPicker
                          onSelect={(emoji) => {
                            setNewAccountIcon(emoji)
                            setShowAccountEmojiPicker(false)
                          }}
                          onClose={() => setShowAccountEmojiPicker(false)}
                        />
                      </div>
                    )}
                  </div>
                  <input
                    type="text"
                    value={newAccountName}
                    onChange={(e) => {
                      setNewAccountName(e.target.value)
                      setAccountError('')
                    }}
                    placeholder="e.g., Cash, HDFC Bank"
                    className="flex-1 rounded-lg border border-border-default bg-surface px-3 py-2 text-sm text-content focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                {accountError && <p className="mt-1 text-xs text-red-500">{accountError}</p>}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={handleAddAccount}
                    className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddAccount(false)
                      setNewAccountName('')
                      setNewAccountIcon('💳')
                      setAccountError('')
                    }}
                    className="rounded-lg bg-surface px-3 py-1.5 text-sm font-medium text-content-secondary hover:bg-surface-hover"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Account Selection - Multi-select */}
            {accounts && accounts.length > 0 ? (
              <div className="space-y-3">
                {/* Account toggle buttons */}
                <div className="flex flex-wrap gap-2">
                  {accounts.map((acc) => {
                    const isSelected = accountPayments.some((ap) => ap.accountId === acc.id)
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => toggleAccountSelection(acc.id)}
                        className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                          isSelected
                            ? 'bg-primary text-white shadow-sm'
                            : 'bg-surface-tertiary text-content-secondary hover:bg-surface-hover'
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 items-center justify-center rounded border ${
                            isSelected
                              ? 'border-white bg-white text-primary'
                              : 'border-content-tertiary'
                          }`}
                        >
                          {isSelected && '✓'}
                        </span>
                        {acc.icon} {acc.name}
                      </button>
                    )
                  })}
                </div>

                {/* Amount inputs for selected accounts */}
                {accountPayments.length > 0 && (
                  <div className="space-y-2 rounded-xl bg-surface-tertiary p-3">
                    <p className="text-xs font-medium text-content-secondary">
                      Amount from each account
                    </p>
                    {accountPayments.map((ap) => {
                      const acc = accounts.find((a) => a.id === ap.accountId)
                      if (!acc) return null
                      return (
                        <div key={ap.accountId} className="flex items-center gap-2">
                          <span className="w-24 truncate text-sm text-content">
                            {acc.icon} {acc.name}
                          </span>
                          <input
                            type="number"
                            value={ap.amount || ''}
                            onChange={(e) =>
                              updateAccountAmount(ap.accountId, parseFloat(e.target.value) || 0)
                            }
                            className="flex-1 rounded-lg border border-border-default bg-surface px-3 py-1.5 text-sm text-content focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                          />
                          <span className="text-sm text-content-secondary">{currency}</span>
                        </div>
                      )
                    })}
                    {/* Total and validation */}
                    <div className="mt-2 flex items-center justify-between border-t border-border-default pt-2">
                      <span className="text-sm font-medium text-content">Total</span>
                      <span
                        className={`text-sm font-medium ${
                          Math.abs(accountPaymentsTotal - (parseFloat(amount) || 0)) < 0.01
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {accountPaymentsTotal.toLocaleString()} {currency}
                        {Math.abs(accountPaymentsTotal - (parseFloat(amount) || 0)) >= 0.01 && (
                          <span className="ml-1 text-xs">
                            ({accountPaymentsTotal > (parseFloat(amount) || 0) ? '+' : ''}
                            {(accountPaymentsTotal - (parseFloat(amount) || 0)).toLocaleString()})
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              !showAddAccount && (
                <p className="text-sm text-content-tertiary">
                  No accounts yet. Click "+ Add New Account" to create your first account.
                </p>
              )
            )}
          </div>
        )}
      </div>

      {/* Split Toggle */}
      <div className="flex items-center justify-between rounded-xl bg-surface-tertiary px-4 py-3">
        <div>
          <span className="font-medium text-content">Split this expense</span>
          <p className="text-sm text-content-secondary">Share with others</p>
        </div>
        <button
          type="button"
          onClick={() => setIsSplitEnabled(!isSplitEnabled)}
          className={`relative h-6 w-11 rounded-full transition-colors ${
            isSplitEnabled ? 'bg-primary' : 'bg-content-tertiary'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              isSplitEnabled ? 'translate-x-5' : ''
            }`}
          />
        </button>
      </div>

      {/* Show Group selector only when splitting */}
      {isSplitEnabled && (
        <div>
          <label className={labelClassName}>Group</label>
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className={inputClassName}
          >
            {groups.map((g) => (
              <option key={g.uuid} value={g.uuid}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Split controls - only show when split is enabled */}
      {isSplitEnabled && (
        <>
          <div>
            <label className={labelClassName}>Paid By</label>
            <div className="mt-1">
              <UserPicker
                users={users}
                selected={paidByEmails}
                onChange={setPaidByEmails}
                multiple
                placeholder="Select who paid..."
                onAddUser={handleAddUser}
              />
            </div>
          </div>

          <div>
            <label className={labelClassName}>Paid For</label>
            <div className="mt-1">
              <UserPicker
                users={users}
                selected={paidForEmails}
                onChange={setPaidForEmails}
                multiple
                placeholder="Select who this is for..."
                onAddUser={handleAddUser}
              />
            </div>
          </div>

          <div>
            <label className={labelClassName}>Split Type</label>
            <select
              value={shareType}
              onChange={(e) => setShareType(e.target.value as ShareType)}
              className={inputClassName}
            >
              <option value="equal">Equal Split</option>
              <option value="percentage">By Percentage</option>
              <option value="exact">Exact Amounts</option>
              <option value="shares">By Shares (Ratio)</option>
            </select>
          </div>
        </>
      )}

      <div>
        <label className={labelClassName}>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputClassName}
          placeholder="Optional description..."
          rows={2}
        />
      </div>

      <div>
        <label className={labelClassName}>Comments</label>
        <textarea
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          className={inputClassName}
          placeholder="Additional notes..."
          rows={2}
        />
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-border-default bg-surface px-4 py-2.5 font-medium text-content transition-colors hover:bg-surface-tertiary"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex-1 rounded-xl bg-primary px-4 py-2.5 font-medium text-white shadow-sm transition-all hover:bg-primary-hover hover:shadow-md"
        >
          Save
        </button>
      </div>
    </form>
  )
}
