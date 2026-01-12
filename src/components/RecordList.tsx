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
    <div className="space-y-6">
      {sortedDates.map((date) => (
        <div key={date}>
          <h3 className="mb-3 text-sm font-medium text-content-secondary">{formatDate(date)}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groupedRecords[date].map((record) => (
              <div
                key={record.uuid}
                className="cursor-pointer rounded-2xl border border-border-default bg-surface p-4 transition-all hover:border-content-tertiary hover:shadow-sm"
                onClick={() => onEdit(record)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 gap-3">
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-surface-tertiary text-xl">
                      {record.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-content">{record.title}</p>
                      <p className="truncate text-sm text-content-secondary">
                        {record.paidBy.length > 0 && (
                          <>Paid by {record.paidBy.map((p) => getUserAlias(p.email)).join(', ')}</>
                        )}
                      </p>
                      {record.paidFor.length > 0 && (
                        <p className="truncate text-xs text-content-tertiary">
                          For {record.paidFor.map((p) => getUserAlias(p.email)).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="font-semibold text-content">
                      {formatAmount(record.amount, record.currency)}
                    </p>
                    <p className="text-xs text-content-tertiary">{record.time}</p>
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-1 border-t border-border-default pt-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onEdit(record)
                    }}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary-light"
                  >
                    Edit
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(record.uuid)
                    }}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
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
