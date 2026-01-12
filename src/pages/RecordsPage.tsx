import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateUUID, now, getCurrentDate, getCurrentTime } from '../db'
import type { ExpenseRecord, ShareType } from '../types'
import { DEFAULT_GROUP_UUID } from '../types'
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
    groupId: DEFAULT_GROUP_UUID,
    comments: '',
  }

  if (showForm) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-content">
            {editingRecord ? 'Edit Record' : 'New Record'}
          </h1>
          <p className="text-sm text-content-secondary">
            {editingRecord ? 'Update expense details' : 'Add a new expense or income'}
          </p>
        </div>
        <div className="max-w-xl">
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-content">Records</h1>
          <p className="text-sm text-content-secondary">
            {records?.length || 0} {records?.length === 1 ? 'record' : 'records'}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-hover hover:shadow-md"
        >
          + Add Record
        </button>
      </div>

      {!records || records.length === 0 ? (
        <div className="rounded-2xl border border-border-default bg-surface py-16 text-center">
          <p className="text-5xl">📝</p>
          <p className="mt-4 text-lg font-medium text-content">No records yet</p>
          <p className="mt-1 text-sm text-content-secondary">
            Create your first record to start tracking expenses
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-6 rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-hover"
          >
            Add Your First Record
          </button>
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
