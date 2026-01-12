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

  if (showForm) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-xl font-bold">{editingUser ? 'Edit User' : 'Add User'}</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!!editingUser}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 disabled:bg-gray-100"
              placeholder="user@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Alias (Display Name)</label>
            <input
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              placeholder="John Doe"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="flex-1 rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
            >
              {editingUser ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Users</h1>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-full bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
        >
          + Add
        </button>
      </div>

      {!users || users.length === 0 ? (
        <div className="py-12 text-center text-gray-500">
          <p className="text-4xl">👤</p>
          <p className="mt-2">No users yet</p>
          <p className="text-sm">Add users to track who paid and who owes</p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((user) => (
            <div
              key={user.email}
              className="flex items-center justify-between rounded-lg bg-white p-4 shadow"
            >
              <div>
                <p className="font-medium">{user.alias}</p>
                <p className="text-sm text-gray-500">{user.email}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(user)}
                  className="rounded px-3 py-1 text-indigo-600 hover:bg-indigo-50"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(user.email)}
                  className="rounded px-3 py-1 text-red-600 hover:bg-red-50"
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
