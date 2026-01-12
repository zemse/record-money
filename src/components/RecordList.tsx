import type { ExpenseRecord, User } from '../types'

interface RecordListProps {
  records: ExpenseRecord[]
  users: User[]
  currentUserEmail?: string
  onEdit: (record: ExpenseRecord) => void
  onDelete: (uuid: string) => void
}

export function RecordList({
  records,
  users,
  currentUserEmail,
  onEdit,
  onDelete,
}: RecordListProps) {
  const getUserAlias = (email: string) => {
    const user = users.find((u) => u.email === email)
    return user?.alias || email
  }

  const isUserInvolved = (record: ExpenseRecord) => {
    if (!currentUserEmail) return true // If no current user, don't show indicator
    const inPaidBy = record.paidBy.some((p) => p.email === currentUserEmail)
    const inPaidFor = record.paidFor.some((p) => p.email === currentUserEmail)
    return inPaidBy || inPaidFor
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
            {groupedRecords[date].map((record) => {
              const involved = isUserInvolved(record)
              return (
                <div
                  key={record.uuid}
                  className={`cursor-pointer rounded-2xl border p-4 transition-all hover:shadow-sm ${
                    involved
                      ? 'border-border-default bg-surface hover:border-content-tertiary'
                      : 'border-dashed border-content-tertiary/50 bg-surface-tertiary/30 hover:border-content-tertiary'
                  }`}
                  onClick={() => onEdit(record)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 gap-3">
                      <span
                        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-xl ${
                          involved ? 'bg-surface-tertiary' : 'bg-surface-tertiary/50'
                        }`}
                      >
                        {record.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p
                            className={`truncate font-medium ${involved ? 'text-content' : 'text-content-secondary'}`}
                          >
                            {record.title}
                          </p>
                          {!involved && (
                            <span className="flex-shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
                              Not involved
                            </span>
                          )}
                        </div>
                        <p className="truncate text-sm text-content-secondary">
                          {record.paidBy.length > 0 && (
                            <>
                              Paid by {record.paidBy.map((p) => getUserAlias(p.email)).join(', ')}
                            </>
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
                      <p
                        className={`font-semibold ${involved ? 'text-content' : 'text-content-secondary'}`}
                      >
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
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
