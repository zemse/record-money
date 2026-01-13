interface PeriodSelectorProps {
  value: string
  onChange: (period: string) => void
}

const PERIODS = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All' },
]

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div className="flex gap-1 rounded-xl bg-surface-tertiary p-1">
      {PERIODS.map((period) => (
        <button
          key={period.value}
          onClick={() => onChange(period.value)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            value === period.value
              ? 'bg-surface text-primary shadow-sm'
              : 'text-content-secondary hover:text-content'
          }`}
        >
          {period.label}
        </button>
      ))}
    </div>
  )
}
