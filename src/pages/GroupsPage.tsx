import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateUUID, now } from '../db'
import type { Group } from '../types'
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
    setEditingGroup(group)
    setName(group.name)
    setMembers(group.members)
    setShowForm(true)
  }

  const handleDelete = async (uuid: string) => {
    if (window.confirm('Are you sure you want to delete this group?')) {
      await db.groups.delete(uuid)
    }
  }

  const getUserAlias = (email: string) => {
    const user = users?.find((u) => u.email === email)
    return user?.alias || email
  }

  if (showForm) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-xl font-bold">{editingGroup ? 'Edit Group' : 'Add Group'}</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Group Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              placeholder="Trip to Goa"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Members</label>
            <UserPicker users={users || []} selected={members} onChange={setMembers} multiple />
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
              {editingGroup ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Groups</h1>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-full bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
        >
          + Add
        </button>
      </div>

      {!groups || groups.length === 0 ? (
        <div className="py-12 text-center text-gray-500">
          <p className="text-4xl">👥</p>
          <p className="mt-2">No groups yet</p>
          <p className="text-sm">Create groups to organize shared expenses</p>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => (
            <div key={group.uuid} className="rounded-lg bg-white p-4 shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{group.name}</p>
                  <p className="text-sm text-gray-500">
                    {group.members.length === 0
                      ? 'No members'
                      : group.members.map(getUserAlias).join(', ')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(group)}
                    className="rounded px-3 py-1 text-indigo-600 hover:bg-indigo-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(group.uuid)}
                    className="rounded px-3 py-1 text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
