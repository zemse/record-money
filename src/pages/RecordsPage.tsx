import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateUUID, now, getCurrentDate, getCurrentTime } from '../db'
import type { ExpenseRecord, ShareType } from '../types'
import { DEFAULT_GROUP_UUID } from '../types'
import { RecordForm } from '../components/RecordForm'
import { RecordList } from '../components/RecordList'
import {
  generateExportUrl,
  exportToFile,
  copyToClipboard,
  getUsersFromRecords,
  getGroupsFromRecords,
  canShareFile,
  shareFile,
  stripAccountsFromRecords,
} from '../utils/dataTransport'

export function RecordsPage() {
  const navigate = useNavigate()
  const [showForm, setShowForm] = useState(false)
  const [editingRecord, setEditingRecord] = useState<ExpenseRecord | null>(null)

  // Filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGroup, setSelectedGroup] = useState<string>('all')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Export states
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [exportMessage, setExportMessage] = useState('')
  const [stripAccountsOnExport, setStripAccountsOnExport] = useState(false)

  const records = useLiveQuery(() => db.records.orderBy('date').reverse().toArray())
  const users = useLiveQuery(() => db.users.toArray())
  const groups = useLiveQuery(() => db.groups.toArray())
  const settings = useLiveQuery(() => db.settings.get('main'))
  const categories = useLiveQuery(() => db.categories.toArray())

  // Filter records based on current filters
  const filteredRecords = useMemo(() => {
    if (!records) return []

    return records.filter((record) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesTitle = record.title.toLowerCase().includes(query)
        const matchesDescription = record.description.toLowerCase().includes(query)
        if (!matchesTitle && !matchesDescription) return false
      }

      // Group filter
      if (selectedGroup !== 'all' && record.groupId !== selectedGroup) {
        return false
      }

      // Category filter
      if (selectedCategory !== 'all' && record.category !== selectedCategory) {
        return false
      }

      // Date range filter
      if (dateFrom && record.date < dateFrom) {
        return false
      }
      if (dateTo && record.date > dateTo) {
        return false
      }

      return true
    })
  }, [records, searchQuery, selectedGroup, selectedCategory, dateFrom, dateTo])

  const hasActiveFilters =
    searchQuery || selectedGroup !== 'all' || selectedCategory !== 'all' || dateFrom || dateTo

  const clearFilters = () => {
    setSearchQuery('')
    setSelectedGroup('all')
    setSelectedCategory('all')
    setDateFrom('')
    setDateTo('')
  }

  // Export handlers
  const handleExportUrl = async (recordsToExport: ExpenseRecord[]) => {
    if (!users) return

    const finalRecords = stripAccountsOnExport
      ? stripAccountsFromRecords(recordsToExport)
      : recordsToExport
    const exportUsers = getUsersFromRecords(finalRecords, users)
    const result = generateExportUrl(finalRecords, exportUsers)

    if (result.success) {
      const copied = await copyToClipboard(result.url)
      setExportMessage(copied ? 'Link copied to clipboard!' : 'Failed to copy link')
    } else {
      setExportMessage(result.error)
    }

    setShowExportMenu(false)
    setTimeout(() => setExportMessage(''), 3000)
  }

  const handleExportFile = (recordsToExport: ExpenseRecord[]) => {
    if (!users || !groups) return

    const finalRecords = stripAccountsOnExport
      ? stripAccountsFromRecords(recordsToExport)
      : recordsToExport
    const exportUsers = getUsersFromRecords(finalRecords, users)
    const exportGroups = getGroupsFromRecords(finalRecords, groups)

    exportToFile(finalRecords, exportUsers, exportGroups)
    setShowExportMenu(false)
    setExportMessage('File downloaded!')
    setTimeout(() => setExportMessage(''), 3000)
  }

  const handleShareFile = async (recordsToExport: ExpenseRecord[]) => {
    if (!users || !groups) return

    const finalRecords = stripAccountsOnExport
      ? stripAccountsFromRecords(recordsToExport)
      : recordsToExport
    const exportUsers = getUsersFromRecords(finalRecords, users)
    const exportGroups = getGroupsFromRecords(finalRecords, groups)

    const result = await shareFile(finalRecords, exportUsers, exportGroups)
    setShowExportMenu(false)

    if (!result.success && result.error !== 'Share cancelled') {
      setExportMessage(result.error || 'Share failed')
      setTimeout(() => setExportMessage(''), 3000)
    }
  }

  // Share single record
  const handleShareRecord = async (record: ExpenseRecord) => {
    if (!users) return

    const exportUsers = getUsersFromRecords([record], users)
    const result = generateExportUrl([record], exportUsers)

    if (result.success) {
      const copied = await copyToClipboard(result.url)
      setExportMessage(copied ? 'Share link copied!' : 'Failed to copy link')
    } else {
      setExportMessage(result.error)
    }

    setTimeout(() => setExportMessage(''), 3000)
  }

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
            key={editingRecord?.uuid || 'new'}
            initialData={editingRecord || defaultValues}
            users={users || []}
            groups={groups || []}
            currentUserEmail={settings?.currentUserEmail}
            defaultAccountId={settings?.defaultAccountId}
            editingRecordId={editingRecord?.uuid}
            onSubmit={(data, recordId) => {
              if (recordId) {
                handleUpdate(recordId, data)
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

  const inputClassName =
    'block w-full rounded-xl border border-border-default bg-surface px-3 py-2 text-sm text-content shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-content">Records</h1>
          <p className="text-sm text-content-secondary">
            {hasActiveFilters
              ? `${filteredRecords.length} of ${records?.length || 0} records`
              : `${records?.length || 0} ${records?.length === 1 ? 'record' : 'records'}`}
          </p>
        </div>
        <div className="flex gap-2">
          {/* Import button */}
          <button
            onClick={() => navigate('/import')}
            className="rounded-xl border border-border-default bg-surface px-4 py-2.5 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-tertiary"
          >
            Import
          </button>

          {/* Export menu */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={!records || records.length === 0}
              className="rounded-xl border border-border-default bg-surface px-4 py-2.5 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-tertiary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export
            </button>

            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-border-default bg-surface p-2 shadow-lg">
                  <p className="px-3 py-1 text-xs font-medium text-content-secondary">
                    {hasActiveFilters
                      ? `Export ${filteredRecords.length} filtered records`
                      : `Export all ${records?.length || 0} records`}
                  </p>

                  {/* Strip accounts option */}
                  <label className="mx-3 mt-2 flex cursor-pointer items-center gap-2 rounded-lg bg-surface-tertiary px-3 py-2">
                    <input
                      type="checkbox"
                      checked={stripAccountsOnExport}
                      onChange={(e) => setStripAccountsOnExport(e.target.checked)}
                      className="h-4 w-4 rounded border-border-default text-primary focus:ring-primary"
                    />
                    <span className="text-xs text-content-secondary">
                      Strip account info (privacy)
                    </span>
                  </label>

                  <button
                    onClick={() => handleExportUrl(filteredRecords)}
                    className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-content hover:bg-surface-tertiary"
                  >
                    <span>🔗</span>
                    <span>Copy Share Link</span>
                  </button>

                  <button
                    onClick={() => handleExportFile(filteredRecords)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-content hover:bg-surface-tertiary"
                  >
                    <span>📁</span>
                    <span>Download File</span>
                  </button>

                  {canShareFile() && (
                    <button
                      onClick={() => handleShareFile(filteredRecords)}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-content hover:bg-surface-tertiary"
                    >
                      <span>📤</span>
                      <span>Share...</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => setShowForm(true)}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-hover hover:shadow-md"
          >
            + Add Record
          </button>
        </div>
      </div>

      {/* Export message */}
      {exportMessage && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            exportMessage.includes('copied') || exportMessage.includes('downloaded')
              ? 'bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400'
              : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
          }`}
        >
          {exportMessage}
        </div>
      )}

      {/* Search and Filter Section */}
      {records && records.length > 0 && (
        <div className="space-y-3">
          {/* Search Bar */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search records..."
                className={inputClassName}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-content-tertiary hover:text-content"
                >
                  ×
                </button>
              )}
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
                showFilters || hasActiveFilters
                  ? 'border-primary bg-primary-light text-primary'
                  : 'border-border-default bg-surface text-content-secondary hover:bg-surface-tertiary'
              }`}
            >
              {hasActiveFilters
                ? `Filters (${[selectedGroup !== 'all', selectedCategory !== 'all', dateFrom, dateTo].filter(Boolean).length})`
                : 'Filters'}
            </button>
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <div className="rounded-2xl border border-border-default bg-surface p-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* Group Filter */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-content-secondary">
                    Group
                  </label>
                  <select
                    value={selectedGroup}
                    onChange={(e) => setSelectedGroup(e.target.value)}
                    className={inputClassName}
                  >
                    <option value="all">All Groups</option>
                    {groups?.map((group) => (
                      <option key={group.uuid} value={group.uuid}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Category Filter */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-content-secondary">
                    Category
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className={inputClassName}
                  >
                    <option value="all">All Categories</option>
                    {categories?.map((cat) => (
                      <option key={cat.id} value={cat.name}>
                        {cat.icon} {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date From */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-content-secondary">
                    From Date
                  </label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className={inputClassName}
                  />
                </div>

                {/* Date To */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-content-secondary">
                    To Date
                  </label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className={inputClassName}
                  />
                </div>
              </div>

              {hasActiveFilters && (
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={clearFilters}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
                  >
                    Clear Filters
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
      ) : filteredRecords.length === 0 ? (
        <div className="rounded-2xl border border-border-default bg-surface py-16 text-center">
          <p className="text-5xl">🔍</p>
          <p className="mt-4 text-lg font-medium text-content">No matching records</p>
          <p className="mt-1 text-sm text-content-secondary">
            Try adjusting your search or filters
          </p>
          <button
            onClick={clearFilters}
            className="mt-6 rounded-xl border border-border-default bg-surface px-6 py-2.5 text-sm font-medium text-content transition-colors hover:bg-surface-tertiary"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <RecordList
          records={filteredRecords}
          users={users || []}
          currentUserEmail={settings?.currentUserEmail}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onShare={handleShareRecord}
        />
      )}
    </div>
  )
}
