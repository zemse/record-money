import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateUUID, now } from '../db'
import type { Group } from '../types'
import { DEFAULT_GROUP_UUID } from '../types'
import { UserPicker } from '../components/UserPicker'

export function GroupsPage() {
  const [showForm, setShowForm] = useState(false)
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)
  const [name, setName] = useState('')
  const [members, setMembers] = useState<string[]>([])
  const [error, setError] = useState('')

  const groups = useLiveQuery(() => db.groups.toArray())
  const users = useLiveQuery(() => db.users.toArray())

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
          {groups.map((group) => (
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
                {!group.isDefault && (
                  <div className="flex flex-shrink-0 gap-1">
                    <button
                      onClick={() => handleEdit(group)}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary-light"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(group.uuid)}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
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
          ))}
        </div>
      )}
    </div>
  )
}
