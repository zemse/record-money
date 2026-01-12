interface ProgressModalProps {
  message: string
  current: number
  total: number
}

export function ProgressModal({ message, current, total }: ProgressModalProps) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-80 rounded-2xl bg-surface p-6 shadow-xl">
        <div className="flex items-center gap-3">
          {/* Spinner */}
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="font-medium text-content">{message}</p>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-surface-tertiary">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <p className="mt-2 text-center text-sm text-content-secondary">
            {current} of {total} ({percentage}%)
          </p>
        </div>
      </div>
    </div>
  )
}
