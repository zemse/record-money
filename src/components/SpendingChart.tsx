import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import type { ExpenseRecord, Category } from '../types'

interface SpendingChartProps {
  records: ExpenseRecord[]
  categories: Category[]
  displayCurrency: string
}

// Define colors for categories
const CATEGORY_COLORS: Record<string, string> = {
  Food: '#f59e0b',
  Transport: '#3b82f6',
  Shopping: '#ec4899',
  Entertainment: '#8b5cf6',
  Bills: '#6b7280',
  Health: '#10b981',
  Travel: '#06b6d4',
  Other: '#94a3b8',
}

const DEFAULT_COLOR = '#64748b'

export function SpendingChart({ records, categories, displayCurrency }: SpendingChartProps) {
  // Aggregate spending by category (exclude Settlement records)
  const spendingByCategory = records.reduce(
    (acc, record) => {
      if (record.category === 'Settlement') return acc

      const existing = acc.get(record.category) || 0
      acc.set(record.category, existing + record.amount)
      return acc
    },
    new Map<string, number>()
  )

  // Convert to chart data format
  const chartData = Array.from(spendingByCategory.entries())
    .map(([name, value]) => {
      const category = categories.find((c) => c.name === name)
      return {
        name,
        value: Math.round(value * 100) / 100,
        icon: category?.icon || '',
        color: CATEGORY_COLORS[name] || DEFAULT_COLOR,
      }
    })
    .sort((a, b) => b.value - a.value)

  if (chartData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-content-secondary">
        No spending data to display
      </div>
    )
  }

  const total = chartData.reduce((sum, item) => sum + item.value, 0)

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
            label={({ name, percent }) =>
              `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
            }
            labelLine={false}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => [
              `${displayCurrency} ${(value as number).toLocaleString()}`,
              'Amount',
            ]}
            contentStyle={{
              backgroundColor: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border-default)',
              borderRadius: '0.75rem',
              color: 'var(--color-text-primary)',
            }}
          />
          <Legend
            formatter={(value: string) => {
              const item = chartData.find((d) => d.name === value)
              return `${item?.icon || ''} ${value}`
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-2 text-center">
        <p className="text-sm text-content-secondary">
          Total: {displayCurrency} {total.toLocaleString()}
        </p>
      </div>
    </div>
  )
}
