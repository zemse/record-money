import type { ExpenseRecord, User } from '../types'

interface RecordListProps {
  records: ExpenseRecord[]
  users: User[]
  onEdit: (record: ExpenseRecord) => void
  onDelete: (uuid: string) => void
}

export function RecordList({ records, users, onEdit, onDelete }: RecordListProps) {
  const getUserAlias = (email: string) => {
    const user = users.find((u) => u.email === email)
    return user?.alias || email
  }

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (dateStr === today.toISOString().split('T')[0]) {
      return 'Today'
    }
    if (dateStr === yesterday.toISOString().split('T')[0]) {
      return 'Yesterday'
    }

    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    })
  }

  // Group records by date
  const groupedRecords = records.reduce<{ [key: string]: ExpenseRecord[] }>((acc, record) => {
    const date = record.date
    if (!acc[date]) {
      acc[date] = []
    }
    acc[date].push(record)
    return acc
  }, {})

  const sortedDates = Object.keys(groupedRecords).sort((a, b) => b.localeCompare(a))

  return (
    <div className="space-y-4">
      {sortedDates.map((date) => (
        <div key={date}>
          <h3 className="mb-2 text-sm font-medium text-gray-500">{formatDate(date)}</h3>
          <div className="space-y-2">
            {groupedRecords[date].map((record) => (
              <div
                key={record.uuid}
                className="rounded-lg bg-white p-4 shadow"
                onClick={() => onEdit(record)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex gap-3">
                    <span className="text-2xl">{record.icon}</span>
                    <div>
                      <p className="font-medium">{record.title}</p>
                      <p className="text-sm text-gray-500">
                        {record.paidBy.length > 0 && (
                          <>Paid by {record.paidBy.map((p) => getUserAlias(p.email)).join(', ')}</>
                        )}
                      </p>
                      {record.paidFor.length > 0 && (
                        <p className="text-xs text-gray-400">
                          For {record.paidFor.map((p) => getUserAlias(p.email)).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatAmount(record.amount, record.currency)}</p>
                    <p className="text-xs text-gray-400">{record.time}</p>
                  </div>
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onEdit(record)
                    }}
                    className="rounded px-2 py-1 text-sm text-indigo-600 hover:bg-indigo-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(record.uuid)
                    }}
                    className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
