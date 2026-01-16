import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { ExpenseRecord } from '../types'

interface SpendingTrendChartProps {
  records: ExpenseRecord[]
  displayCurrency: string
  period: 'week' | 'month' | 'year'
}

export function SpendingTrendChart({ records, displayCurrency, period }: SpendingTrendChartProps) {
  // Determine date grouping based on period
  const getDateKey = (date: string): string => {
    const d = new Date(date)
    if (period === 'week') {
      // Group by day for weekly view
      return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })
    } else if (period === 'month') {
      // Group by day for monthly view
      return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
    } else {
      // Group by month for yearly view
      return d.toLocaleDateString('en-US', { month: 'short' })
    }
  }

  const getSortKey = (date: string): number => {
    return new Date(date).getTime()
  }

  // Aggregate spending by date, split into expenses and income
  const dataMap = new Map<
    string,
    { date: string; expenses: number; income: number; sortKey: number }
  >()

  records
    .filter((r) => r.category !== 'Settlement')
    .forEach((record) => {
      const key = getDateKey(record.date)
      const existing = dataMap.get(key) || {
        date: key,
        expenses: 0,
        income: 0,
        sortKey: getSortKey(record.date),
      }

      // Simple heuristic: if paidFor includes only 'me' it's an expense,
      // if paidBy is someone else and paidFor is 'me' it could be income
      // For simplicity, all positive amounts are expenses
      existing.expenses += record.amount
      dataMap.set(key, existing)
    })

  // Convert to sorted array
  const chartData = Array.from(dataMap.values())
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(({ date, expenses }) => ({
      date,
      amount: Math.round(expenses * 100) / 100,
    }))

  if (chartData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-content-secondary">
        No spending data to display
      </div>
    )
  }

  // Calculate stats
  const total = chartData.reduce((sum, item) => sum + item.amount, 0)
  const average = total / chartData.length
  const max = Math.max(...chartData.map((d) => d.amount))

  return (
    <div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-default)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border-default)' }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border-default)' }}
              tickFormatter={(value) =>
                value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value.toString()
              }
            />
            <Tooltip
              formatter={(value) => [
                `${displayCurrency} ${(value as number).toLocaleString()}`,
                'Spending',
              ]}
              contentStyle={{
                backgroundColor: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-default)',
                borderRadius: '0.75rem',
                color: 'var(--color-text-primary)',
                fontSize: '0.875rem',
              }}
              labelStyle={{ color: 'var(--color-text-primary)' }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="amount"
              name="Spending"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ fill: '#3b82f6', strokeWidth: 0, r: 4 }}
              activeDot={{ r: 6, stroke: '#3b82f6', strokeWidth: 2, fill: 'white' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-3 gap-4 text-center text-sm">
        <div>
          <p className="text-content-tertiary">Total</p>
          <p className="font-medium text-content">
            {displayCurrency} {total.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-content-tertiary">Average</p>
          <p className="font-medium text-content">
            {displayCurrency} {average.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div>
          <p className="text-content-tertiary">Peak</p>
          <p className="font-medium text-content">
            {displayCurrency} {max.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  )
}
