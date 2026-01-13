import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { ExpenseRecord, User, Group, ShareType, Participant, Category } from '../types'
import { DEFAULT_GROUP_UUID } from '../types'
import { UserPicker } from './UserPicker'
import { addUser, db } from '../db'

// Common currencies
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'SGD', 'AED', 'THB']

interface RecordFormProps {
  initialData: Omit<ExpenseRecord, 'uuid' | 'createdAt' | 'updatedAt'>
  users: User[]
  groups: Group[]
  currentUserEmail?: string
  onSubmit: (data: Omit<ExpenseRecord, 'uuid' | 'createdAt' | 'updatedAt'>) => void
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
  const [error, setError] = useState('')

  // Split mode - defaults to OFF for new records, ON for split expenses being edited
  const [isSplitEnabled, setIsSplitEnabled] = useState(() => isSplitExpense(initialData))

  // Fetch categories from database
  const categories = useLiveQuery(() => db.categories.toArray())

  // Filter out Settlement category from the picker (it's system-only for settle up)
  const selectableCategories = categories?.filter((c) => c.name !== 'Settlement') || []

  const handleCategorySelect = (cat: Category) => {
    setCategory(cat.name)
    setIcon(cat.icon)
  }

  const handleAddUser = async (email: string, alias: string) => {
    const result = await addUser(email, alias)
    return { success: result.success, error: result.success ? undefined : result.error }
  }

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

    onSubmit({
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
      comments: comments.trim(),
    })
  }

  const inputClassName =
    'mt-1 block w-full rounded-xl border border-border-default bg-surface px-3 py-2.5 text-content shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

  const labelClassName = 'block text-sm font-medium text-content'

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
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
