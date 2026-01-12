import { useLiveQuery } from 'dexie-react-hooks'
import { db, updateSettings } from '../db'
import { useTheme } from '../hooks/useTheme'
import type { Theme } from '../types'

const themeOptions: { value: Theme; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: '☀️' },
  { value: 'dark', label: 'Dark', icon: '🌙' },
  { value: 'system', label: 'System', icon: '💻' },
]

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'SGD', 'AED', 'THB']

export function SettingsPage() {
  const settings = useLiveQuery(() => db.settings.get('main'))
  const users = useLiveQuery(() => db.users.toArray())
  const { theme, setTheme } = useTheme()

  const currentUser = users?.find((u) => u.email === settings?.currentUserEmail)

  const handleCurrencyChange = async (currency: string) => {
    await updateSettings({ defaultDisplayCurrency: currency })
  }

  const handleClearCurrentUser = async () => {
    await updateSettings({ currentUserEmail: undefined })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-content">Settings</h1>
        <p className="text-sm text-content-secondary">Manage your preferences</p>
      </div>

      <div className="space-y-4">
        {/* Current User ("Me") */}
        <div className="rounded-2xl border border-border-default bg-surface p-5">
          <h2 className="font-medium text-content">Current User</h2>
          <p className="mt-1 text-sm text-content-secondary">
            Set yourself to calculate balances from your perspective
          </p>
          {currentUser ? (
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-lg font-semibold text-white">
                  {currentUser.alias.charAt(0).toUpperCase()}
                </span>
                <div>
                  <p className="font-medium text-content">{currentUser.alias}</p>
                  <p className="text-sm text-content-secondary">{currentUser.email}</p>
                </div>
              </div>
              <button
                onClick={handleClearCurrentUser}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
              >
                Clear
              </button>
            </div>
          ) : (
            <div className="mt-3 rounded-xl bg-amber-50 px-4 py-3 dark:bg-amber-500/10">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                No user set as "Me". Go to Users page and click "Set as Me" on your profile.
              </p>
            </div>
          )}
        </div>

        {/* Theme Selection */}
        <div className="rounded-2xl border border-border-default bg-surface p-5">
          <div className="mb-4">
            <h2 className="font-medium text-content">Appearance</h2>
            <p className="text-sm text-content-secondary">Choose your preferred theme</p>
          </div>
          <div className="flex gap-2">
            {themeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setTheme(option.value)}
                className={`flex flex-1 flex-col items-center gap-2 rounded-xl border-2 px-4 py-3 transition-all ${
                  theme === option.value
                    ? 'border-primary bg-primary-light'
                    : 'border-border-default hover:border-content-tertiary'
                }`}
              >
                <span className="text-2xl">{option.icon}</span>
                <span
                  className={`text-sm font-medium ${
                    theme === option.value ? 'text-primary' : 'text-content-secondary'
                  }`}
                >
                  {option.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Display Currency */}
        <div className="rounded-2xl border border-border-default bg-surface p-5">
          <h2 className="font-medium text-content">Display Currency</h2>
          <p className="mt-1 text-sm text-content-secondary">
            Currency used to display balances on the Dashboard
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {CURRENCIES.map((currency) => (
              <button
                key={currency}
                onClick={() => handleCurrencyChange(currency)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                  (settings?.defaultDisplayCurrency || 'INR') === currency
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-surface-tertiary text-content-secondary hover:bg-surface-hover'
                }`}
              >
                {currency}
              </button>
            ))}
          </div>
        </div>

        {/* Data */}
        <div className="rounded-2xl border border-border-default bg-surface p-5">
          <h2 className="font-medium text-content">Data & Privacy</h2>
          <p className="mt-1 text-sm text-content-secondary">
            All your data is stored locally in your browser. No data is sent to any server.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="rounded-lg bg-surface-tertiary px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover">
              Export Data
            </button>
            <button className="rounded-lg bg-surface-tertiary px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover">
              Import Data
            </button>
          </div>
        </div>

        {/* About */}
        <div className="rounded-2xl border border-border-default bg-surface p-5">
          <h2 className="font-medium text-content">About</h2>
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-content-secondary">Version</span>
              <span className="text-sm font-medium text-content">0.1.0</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-content-secondary">Storage</span>
              <span className="text-sm font-medium text-content">IndexedDB</span>
            </div>
          </div>
          <p className="mt-4 text-xs text-content-tertiary">
            Decentralized expense tracking and splitting app. Built with React, TypeScript, and
            Tailwind CSS.
          </p>
        </div>
      </div>
    </div>
  )
}
