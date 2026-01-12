import { useState } from 'react'
import type { ExpenseRecord, User, Group, ShareType, Participant } from '../types'
import { UserPicker } from './UserPicker'

// Common currencies
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'SGD', 'AED', 'THB']

// Common categories with emojis
const CATEGORIES = [
  { name: 'Food', icon: '🍽️' },
  { name: 'Transport', icon: '🚗' },
  { name: 'Shopping', icon: '🛍️' },
  { name: 'Entertainment', icon: '🎬' },
  { name: 'Bills', icon: '📄' },
  { name: 'Health', icon: '💊' },
  { name: 'Travel', icon: '✈️' },
  { name: 'Other', icon: '💰' },
]

interface RecordFormProps {
  initialData: Omit<ExpenseRecord, 'uuid' | 'createdAt' | 'updatedAt'>
  users: User[]
  groups: Group[]
  onSubmit: (data: Omit<ExpenseRecord, 'uuid' | 'createdAt' | 'updatedAt'>) => void
  onCancel: () => void
}

export function RecordForm({ initialData, users, groups, onSubmit, onCancel }: RecordFormProps) {
  const [title, setTitle] = useState(initialData.title)
  const [description, setDescription] = useState(initialData.description)
  const [amount, setAmount] = useState(initialData.amount.toString())
  const [currency, setCurrency] = useState(initialData.currency)
  const [date, setDate] = useState(initialData.date)
  const [time, setTime] = useState(initialData.time)
  const [category, setCategory] = useState(initialData.category)
  const [icon, setIcon] = useState(initialData.icon)
  const [groupId, setGroupId] = useState<string | null>(initialData.groupId)
  const [shareType, setShareType] = useState<ShareType>(initialData.shareType)
  const [paidByEmails, setPaidByEmails] = useState<string[]>(initialData.paidBy.map((p) => p.email))
  const [paidForEmails, setPaidForEmails] = useState<string[]>(
    initialData.paidFor.map((p) => p.email)
  )
  const [comments, setComments] = useState(initialData.comments)
  const [error, setError] = useState('')

  const handleCategorySelect = (cat: { name: string; icon: string }) => {
    setCategory(cat.name)
    setIcon(cat.icon)
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

    if (paidByEmails.length === 0) {
      setError('Select who paid')
      return
    }

    if (paidForEmails.length === 0) {
      setError('Select who this is for')
      return
    }

    // Create participants with equal shares by default
    const paidBy: Participant[] = paidByEmails.map((email) => ({
      email,
      share: parsedAmount / paidByEmails.length,
    }))

    const paidFor: Participant[] = paidForEmails.map((email) => ({
      email,
      share: 1, // Equal share for equal split
    }))

    onSubmit({
      title: title.trim(),
      description: description.trim(),
      category,
      amount: parsedAmount,
      currency,
      date,
      time,
      icon,
      paidBy,
      paidFor,
      shareType,
      groupId,
      comments: comments.trim(),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          placeholder="Dinner at restaurant"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Amount</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            placeholder="0.00"
            step="0.01"
            min="0"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Currency</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
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
          <label className="block text-sm font-medium text-gray-700">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Time</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Category</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.name}
              type="button"
              onClick={() => handleCategorySelect(cat)}
              className={`rounded-full px-3 py-1 text-sm ${
                category === cat.name
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>
      </div>

      {groups.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700">Group (Optional)</label>
          <select
            value={groupId || ''}
            onChange={(e) => setGroupId(e.target.value || null)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          >
            <option value="">No Group</option>
            {groups.map((g) => (
              <option key={g.uuid} value={g.uuid}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">Paid By</label>
        <UserPicker
          users={users}
          selected={paidByEmails}
          onChange={setPaidByEmails}
          multiple
          placeholder="Select who paid..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Paid For</label>
        <UserPicker
          users={users}
          selected={paidForEmails}
          onChange={setPaidForEmails}
          multiple
          placeholder="Select who this is for..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Split Type</label>
        <select
          value={shareType}
          onChange={(e) => setShareType(e.target.value as ShareType)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
        >
          <option value="equal">Equal Split</option>
          <option value="percentage">By Percentage</option>
          <option value="exact">Exact Amounts</option>
          <option value="shares">By Shares (Ratio)</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          placeholder="Optional description..."
          rows={2}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Comments</label>
        <textarea
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          placeholder="Additional notes..."
          rows={2}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
        >
          Save
        </button>
      </div>
    </form>
  )
}
