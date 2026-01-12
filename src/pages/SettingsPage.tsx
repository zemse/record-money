import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useTheme } from '../hooks/useTheme'
import type { Theme } from '../types'

const themeOptions: { value: Theme; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: '☀️' },
  { value: 'dark', label: 'Dark', icon: '🌙' },
  { value: 'system', label: 'System', icon: '💻' },
]

export function SettingsPage() {
  const settings = useLiveQuery(() => db.settings.get('main'))
  const { theme, setTheme } = useTheme()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-content">Settings</h1>
        <p className="text-sm text-content-secondary">Manage your preferences</p>
      </div>

      <div className="space-y-4">
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

        {/* Currency */}
        <div className="rounded-2xl border border-border-default bg-surface p-5">
          <h2 className="font-medium text-content">Currency</h2>
          <p className="mt-1 text-sm text-content-secondary">Default currency for new records</p>
          <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-surface-tertiary px-3 py-2">
            <span className="text-lg">💱</span>
            <span className="font-medium text-content">{settings?.lastUsedCurrency || 'INR'}</span>
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
