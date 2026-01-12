import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, normalizeEmail } from '../db'
import type { User } from '../types'

export function UsersPage() {
  const [showForm, setShowForm] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [alias, setAlias] = useState('')
  const [error, setError] = useState('')

  const users = useLiveQuery(() => db.users.toArray())

  const resetForm = () => {
    setEmail('')
    setAlias('')
    setError('')
    setShowForm(false)
    setEditingUser(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const normalizedEmail = normalizeEmail(email)

    if (!normalizedEmail) {
      setError('Email is required')
      return
    }

    if (!alias.trim()) {
      setError('Alias is required')
      return
    }

    try {
      if (editingUser) {
        await db.users.update(editingUser.email, { alias: alias.trim() })
      } else {
        // Check if user already exists
        const existing = await db.users.get(normalizedEmail)
        if (existing) {
          setError('User with this email already exists')
          return
        }

        await db.users.add({
          email: normalizedEmail,
          alias: alias.trim(),
        })
      }
      resetForm()
    } catch {
      setError('Failed to save user')
    }
  }

  const handleEdit = (user: User) => {
    setEditingUser(user)
    setEmail(user.email)
    setAlias(user.alias)
    setShowForm(true)
  }

  const handleDelete = async (userEmail: string) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      await db.users.delete(userEmail)
    }
  }

  const inputClassName =
    'mt-1 block w-full rounded-xl border border-border-default bg-surface px-3 py-2.5 text-content shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-surface-tertiary disabled:text-content-secondary'

  const labelClassName = 'block text-sm font-medium text-content'

  if (showForm) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-content">
            {editingUser ? 'Edit User' : 'Add User'}
          </h1>
          <p className="text-sm text-content-secondary">
            {editingUser ? 'Update user details' : 'Add a new person to track expenses'}
          </p>
        </div>
        <div className="max-w-xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className={labelClassName}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!!editingUser}
                className={inputClassName}
                placeholder="user@example.com"
              />
            </div>

            <div>
              <label className={labelClassName}>Name</label>
              <input
                type="text"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                className={inputClassName}
                placeholder="John Doe"
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
                onClick={resetForm}
                className="flex-1 rounded-xl border border-border-default bg-surface px-4 py-2.5 font-medium text-content transition-colors hover:bg-surface-tertiary"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-primary px-4 py-2.5 font-medium text-white shadow-sm transition-all hover:bg-primary-hover hover:shadow-md"
              >
                {editingUser ? 'Save' : 'Add User'}
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
          <h1 className="text-2xl font-semibold text-content">Users</h1>
          <p className="text-sm text-content-secondary">
            {users?.length || 0} {users?.length === 1 ? 'person' : 'people'}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-hover hover:shadow-md"
        >
          + Add User
        </button>
      </div>

      {!users || users.length === 0 ? (
        <div className="rounded-2xl border border-border-default bg-surface py-16 text-center">
          <p className="text-5xl">👤</p>
          <p className="mt-4 text-lg font-medium text-content">No users yet</p>
          <p className="mt-1 text-sm text-content-secondary">
            Add users to track who paid and who owes
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-6 rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-hover"
          >
            Add Your First User
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {users.map((user) => (
            <div
              key={user.email}
              className="flex items-center justify-between rounded-2xl border border-border-default bg-surface p-4 transition-all hover:border-content-tertiary"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-light text-lg font-semibold text-primary">
                  {user.alias.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-content">{user.alias}</p>
                  <p className="truncate text-sm text-content-secondary">{user.email}</p>
                </div>
              </div>
              <div className="flex flex-shrink-0 gap-1">
                <button
                  onClick={() => handleEdit(user)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary-light"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(user.email)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
