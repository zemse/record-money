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
    <div className="space-y-2">
      {selectedArray.length === 0 && !showForm && (
        <p className="text-sm text-content-secondary">{placeholder}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {users.map((user) => {
          const isSelected = selectedArray.includes(user.email)
          return (
            <button
              key={user.email}
              type="button"
              onClick={() => toggleUser(user.email)}
              className={`rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                isSelected
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-surface-tertiary text-content-secondary hover:bg-surface-hover'
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
            className="rounded-xl border-2 border-dashed border-border-default px-3 py-2 text-sm font-medium text-content-tertiary transition-colors hover:border-primary hover:text-primary"
          >
            + Add User
          </button>
        )}
      </div>

      {showForm && (
        <div className="rounded-xl border border-border-default bg-surface-secondary p-3">
          <div className="space-y-2">
            <input
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="Name"
              className="block w-full rounded-lg border border-border-default bg-surface px-3 py-2 text-sm text-content shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="block w-full rounded-lg border border-border-default bg-surface px-3 py-2 text-sm text-content shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="flex-1 rounded-lg border border-border-default bg-surface px-3 py-2 text-sm font-medium text-content transition-colors hover:bg-surface-tertiary"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddUser}
                className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
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
