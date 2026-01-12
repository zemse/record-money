import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateUUID, now, getCurrentDate, getCurrentTime } from '../db'
import type { ExpenseRecord, ShareType } from '../types'
import { RecordForm } from '../components/RecordForm'
import { RecordList } from '../components/RecordList'

export function RecordsPage() {
  const [showForm, setShowForm] = useState(false)
  const [editingRecord, setEditingRecord] = useState<ExpenseRecord | null>(null)

  const records = useLiveQuery(() => db.records.orderBy('date').reverse().toArray())
  const users = useLiveQuery(() => db.users.toArray())
  const groups = useLiveQuery(() => db.groups.toArray())
  const settings = useLiveQuery(() => db.settings.get('main'))

  const handleAdd = async (data: Omit<ExpenseRecord, 'uuid' | 'createdAt' | 'updatedAt'>) => {
    const timestamp = now()
    await db.records.add({
      ...data,
      uuid: generateUUID(),
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    // Update lastUsedCurrency in settings
    if (settings) {
      await db.settings.update('main', { lastUsedCurrency: data.currency })
    }

    setShowForm(false)
  }

  const handleUpdate = async (
    uuid: string,
    data: Omit<ExpenseRecord, 'uuid' | 'createdAt' | 'updatedAt'>
  ) => {
    await db.records.update(uuid, {
      ...data,
      updatedAt: now(),
    })

    // Update lastUsedCurrency in settings
    if (settings) {
      await db.settings.update('main', { lastUsedCurrency: data.currency })
    }

    setEditingRecord(null)
  }

  const handleDelete = async (uuid: string) => {
    if (window.confirm('Are you sure you want to delete this record?')) {
      await db.records.delete(uuid)
    }
  }

  const handleEdit = (record: ExpenseRecord) => {
    setEditingRecord(record)
    setShowForm(true)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingRecord(null)
  }

  const defaultValues: Omit<ExpenseRecord, 'uuid' | 'createdAt' | 'updatedAt'> = {
    title: '',
    description: '',
    category: '',
    amount: 0,
    currency: settings?.lastUsedCurrency || 'INR',
    date: getCurrentDate(),
    time: getCurrentTime(),
    icon: '💰',
    paidBy: [],
    paidFor: [],
    shareType: 'equal' as ShareType,
    groupId: null,
    comments: '',
  }

  if (showForm) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-xl font-bold">{editingRecord ? 'Edit Record' : 'Add Record'}</h1>
        <div className="max-w-lg">
          <RecordForm
            initialData={editingRecord || defaultValues}
            users={users || []}
            groups={groups || []}
            onSubmit={(data) => {
              if (editingRecord) {
                handleUpdate(editingRecord.uuid, data)
              } else {
                handleAdd(data)
              }
            }}
            onCancel={handleCancel}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Records</h1>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-full bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
        >
          + Add
        </button>
      </div>

      {!records || records.length === 0 ? (
        <div className="py-12 text-center text-gray-500">
          <p className="text-4xl">📝</p>
          <p className="mt-2">No records yet</p>
          <p className="text-sm">Tap + Add to create your first record</p>
        </div>
      ) : (
        <RecordList
          records={records}
          users={users || []}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
