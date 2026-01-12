import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, normalizeEmail, updateSettings, changeUserEmail } from '../db'
import type { User } from '../types'
import { ProgressModal } from '../components/ProgressModal'

export function UsersPage() {
  const [showForm, setShowForm] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [alias, setAlias] = useState('')
  const [error, setError] = useState('')

  // Progress modal state
  const [showProgress, setShowProgress] = useState(false)
  const [progressCurrent, setProgressCurrent] = useState(0)
  const [progressTotal, setProgressTotal] = useState(0)

  // Menu state
  const [openMenuEmail, setOpenMenuEmail] = useState<string | null>(null)

  const users = useLiveQuery(() => db.users.toArray())
  const settings = useLiveQuery(() => db.settings.get('main'))

  const handleSetAsMe = async (userEmail: string) => {
    await updateSettings({ currentUserEmail: userEmail })
  }

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
        // Check if email has changed
        const emailChanged = normalizedEmail !== editingUser.email

        if (emailChanged) {
          // Confirm email change
          const confirmed = window.confirm(
            `Changing email from "${editingUser.email}" to "${normalizedEmail}" will update all records, groups, and settings. This may take a moment. Continue?`
          )

          if (!confirmed) return

          // Show progress modal
          setShowProgress(true)
          setProgressCurrent(0)
          setProgressTotal(0)

          const result = await changeUserEmail(
            editingUser.email,
            normalizedEmail,
            (current, total) => {
              setProgressCurrent(current)
              setProgressTotal(total)
            }
          )

          setShowProgress(false)

          if (!result.success) {
            setError(result.error || 'Failed to change email')
            return
          }

          // Update alias if changed
          if (alias.trim() !== editingUser.alias) {
            await db.users.update(normalizedEmail, { alias: alias.trim() })
          }
        } else {
          // Only alias changed
          await db.users.update(editingUser.email, { alias: alias.trim() })
        }
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
      setShowProgress(false)
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
                className={inputClassName}
                placeholder="user@example.com"
              />
              {editingUser && (
                <p className="mt-1 text-xs text-content-tertiary">
                  Changing email will update all records and groups
                </p>
              )}
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
          {users.map((user) => {
            const isMe = settings?.currentUserEmail === user.email
            return (
              <div
                key={user.email}
                className={`relative rounded-2xl border p-4 transition-all ${
                  isMe
                    ? 'border-primary/30 bg-primary-light'
                    : 'border-border-default bg-surface hover:border-content-tertiary'
                }`}
              >
                {/* Menu button - top right */}
                <div className="absolute right-2 top-2">
                  <button
                    onClick={() =>
                      setOpenMenuEmail(openMenuEmail === user.email ? null : user.email)
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-content-secondary transition-colors hover:bg-surface-tertiary"
                  >
                    <span className="text-lg">⋯</span>
                  </button>

                  {openMenuEmail === user.email && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setOpenMenuEmail(null)} />
                      <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-xl border border-border-default bg-surface p-2 shadow-lg">
                        {!isMe && (
                          <button
                            onClick={() => {
                              setOpenMenuEmail(null)
                              handleSetAsMe(user.email)
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-500/10"
                          >
                            <span>👤</span>
                            <span>Set as Me</span>
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setOpenMenuEmail(null)
                            handleEdit(user)
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-content hover:bg-surface-tertiary"
                        >
                          <span>✏️</span>
                          <span>Edit</span>
                        </button>
                        <div className="my-1 border-t border-border-default" />
                        <button
                          onClick={() => {
                            setOpenMenuEmail(null)
                            handleDelete(user.email)
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                        >
                          <span>🗑️</span>
                          <span>Delete</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-3 pr-8">
                  <span
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-lg font-semibold ${
                      isMe ? 'bg-primary text-white' : 'bg-primary-light text-primary'
                    }`}
                  >
                    {user.alias.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-content">{user.alias}</p>
                      {isMe && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          Me
                        </span>
                      )}
                    </div>
                    <p className="truncate text-sm text-content-secondary">{user.email}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Progress Modal */}
      {showProgress && (
        <ProgressModal
          message="Updating email..."
          current={progressCurrent}
          total={progressTotal}
        />
      )}
    </div>
  )
}
