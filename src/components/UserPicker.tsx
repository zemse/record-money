import { useState } from 'react'
import type { User } from '../types'

interface BaseUserPickerProps {
  users: User[]
  placeholder?: string
  onAddUser?: (email: string, alias: string) => Promise<{ success: boolean; error?: string }>
}

interface MultipleUserPickerProps extends BaseUserPickerProps {
  selected: string[]
  onChange: (selected: string[]) => void
  multiple: true
}

interface SingleUserPickerProps extends BaseUserPickerProps {
  selected: string
  onChange: (selected: string) => void
  multiple?: false
}

type UserPickerProps = MultipleUserPickerProps | SingleUserPickerProps

export function UserPicker({
  users,
  selected,
  onChange,
  multiple = false,
  placeholder = 'Select users...',
  onAddUser,
}: UserPickerProps) {
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [alias, setAlias] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const selectedArray = Array.isArray(selected) ? selected : selected ? [selected] : []

  const toggleUser = (userEmail: string) => {
    if (multiple) {
      const currentSelected = selectedArray
      if (currentSelected.includes(userEmail)) {
        ;(onChange as (selected: string[]) => void)(currentSelected.filter((e) => e !== userEmail))
      } else {
        ;(onChange as (selected: string[]) => void)([...currentSelected, userEmail])
      }
    } else {
      ;(onChange as (selected: string) => void)(userEmail)
    }
  }

  const resetForm = () => {
    setEmail('')
    setAlias('')
    setError('')
    setShowForm(false)
  }

  const handleAddUser = async () => {
    if (!onAddUser) return

    setError('')
    setIsSubmitting(true)

    try {
      const result = await onAddUser(email, alias)
      if (result.success) {
        // Auto-select the newly added user
        toggleUser(email.toLowerCase().trim())
        resetForm()
      } else {
        setError(result.error || 'Failed to add user')
      }
    } catch {
      setError('Failed to add user')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mt-1 space-y-2">
      {selectedArray.length === 0 && !showForm && (
        <p className="text-sm text-gray-500">{placeholder}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {users.map((user) => {
          const isSelected = selectedArray.includes(user.email)
          return (
            <button
              key={user.email}
              type="button"
              onClick={() => toggleUser(user.email)}
              className={`rounded-full px-3 py-1 text-sm ${
                isSelected
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {user.alias}
            </button>
          )
        })}

        {onAddUser && !showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-full border-2 border-dashed border-gray-300 px-3 py-1 text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600"
          >
            + Add User
          </button>
        )}
      </div>

      {showForm && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
          <div className="space-y-2">
            <input
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="Name"
              className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              autoFocus
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddUser}
                className="flex-1 rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
