import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, updateSettings } from '../db'
import { useTheme } from '../hooks/useTheme'
import type { Theme, ExpenseRecord } from '../types'
import { CLAUDE_MODELS, DEFAULT_CLAUDE_MODEL } from '../types'
import { findPotentialDuplicates, type PotentialDuplicate } from '../utils/deduplication'
import { validateApiKey } from '../utils/claudeClient'

const themeOptions: { value: Theme; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: '☀️' },
  { value: 'dark', label: 'Dark', icon: '🌙' },
  { value: 'system', label: 'System', icon: '💻' },
]

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'SGD', 'AED', 'THB']

export function SettingsPage() {
  const navigate = useNavigate()
  const settings = useLiveQuery(() => db.settings.get('main'))
  const users = useLiveQuery(() => db.users.toArray())
  const categories = useLiveQuery(() => db.categories.toArray())
  const records = useLiveQuery(() => db.records.toArray())
  const { theme, setTheme } = useTheme()

  // API key management state
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [apiKeyStatus, setApiKeyStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>(
    'idle'
  )
  const [apiKeyError, setApiKeyError] = useState('')

  // Duplicate finder state
  const [showDuplicateFinder, setShowDuplicateFinder] = useState(false)
  const [duplicates, setDuplicates] = useState<PotentialDuplicate[]>([])
  const [scanningDuplicates, setScanningDuplicates] = useState(false)

  const currentUser = users?.find((u) => u.email === settings?.currentUserEmail)

  const handleCurrencyChange = async (currency: string) => {
    await updateSettings({ defaultDisplayCurrency: currency })
  }

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) {
      setApiKeyError('API key is required')
      return
    }

    setApiKeyStatus('validating')
    setApiKeyError('')

    const result = await validateApiKey(apiKeyInput.trim())

    if (result.success) {
      await updateSettings({ claudeApiKey: apiKeyInput.trim() })
      setApiKeyStatus('valid')
      setApiKeyInput('')
      setTimeout(() => setApiKeyStatus('idle'), 2000)
    } else {
      setApiKeyStatus('invalid')
      setApiKeyError(result.error)
    }
  }

  const handleClearApiKey = async () => {
    if (window.confirm('Remove your Claude API key? AI features will be disabled.')) {
      await updateSettings({ claudeApiKey: undefined })
      setApiKeyStatus('idle')
      setApiKeyInput('')
    }
  }

  const handleClearCurrentUser = async () => {
    await updateSettings({ currentUserEmail: undefined })
  }

  // Duplicate finder functions
  const handleScanDuplicates = () => {
    if (!records) return

    setScanningDuplicates(true)
    setShowDuplicateFinder(true)

    // Use setTimeout to allow UI to update before heavy computation
    setTimeout(() => {
      const found = findPotentialDuplicates(records, { dateBuffer: 1, minSimilarity: 0.7 })
      setDuplicates(found)
      setScanningDuplicates(false)
    }, 100)
  }

  const handleMergeDuplicates = async (record1: ExpenseRecord, record2: ExpenseRecord) => {
    if (!window.confirm('Keep the first record and delete the second?')) return

    await db.records.delete(record2.uuid)
    setDuplicates(
      duplicates.filter(
        (d) => !(d.record1.uuid === record1.uuid && d.record2.uuid === record2.uuid)
      )
    )
  }

  const handleIgnoreDuplicate = (record1: ExpenseRecord, record2: ExpenseRecord) => {
    setDuplicates(
      duplicates.filter(
        (d) => !(d.record1.uuid === record1.uuid && d.record2.uuid === record2.uuid)
      )
    )
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

        {/* AI Settings */}
        <div className="rounded-2xl border border-border-default bg-surface p-5">
          <h2 className="font-medium text-content">AI Assistant</h2>
          <p className="mt-1 text-sm text-content-secondary">
            Enable natural language expense entry with Claude AI
          </p>

          {settings?.claudeApiKey ? (
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between rounded-xl bg-green-50 px-4 py-3 dark:bg-green-500/10">
                <div className="flex items-center gap-2">
                  <span className="text-green-600 dark:text-green-400">✓</span>
                  <span className="text-sm font-medium text-green-700 dark:text-green-400">
                    API key configured
                  </span>
                </div>
                <button
                  onClick={handleClearApiKey}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
                >
                  Remove
                </button>
              </div>

              {/* Model Selection */}
              <div>
                <label className="block text-sm font-medium text-content">Model</label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {CLAUDE_MODELS.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => updateSettings({ claudeModel: model.id })}
                      className={`rounded-lg px-3 py-2 text-left transition-all ${
                        (settings?.claudeModel || DEFAULT_CLAUDE_MODEL) === model.id
                          ? 'bg-primary text-white shadow-sm'
                          : 'bg-surface-tertiary text-content-secondary hover:bg-surface-hover'
                      }`}
                    >
                      <span className="block text-sm font-medium">{model.name}</span>
                      <span
                        className={`block text-xs ${
                          (settings?.claudeModel || DEFAULT_CLAUDE_MODEL) === model.id
                            ? 'text-white/80'
                            : 'text-content-tertiary'
                        }`}
                      >
                        {model.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl bg-amber-50 px-4 py-3 dark:bg-amber-500/10">
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  <strong>Security Note:</strong> Your API key is stored locally in your browser.
                  It's visible to browser extensions and anyone with device access. We recommend
                  using a key with spending limits set in your Anthropic console.
                </p>
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={(e) => {
                      setApiKeyInput(e.target.value)
                      setApiKeyError('')
                      setApiKeyStatus('idle')
                    }}
                    placeholder="sk-ant-api..."
                    className="w-full rounded-lg border border-border-default bg-surface px-3 py-2 pr-10 text-content transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-content-tertiary hover:text-content"
                  >
                    {showApiKey ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
                <button
                  onClick={handleSaveApiKey}
                  disabled={apiKeyStatus === 'validating' || !apiKeyInput.trim()}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {apiKeyStatus === 'validating' ? 'Validating...' : 'Save'}
                </button>
              </div>

              {apiKeyError && <p className="text-sm text-red-500">{apiKeyError}</p>}

              {apiKeyStatus === 'valid' && (
                <p className="text-sm text-green-600 dark:text-green-400">
                  API key saved successfully!
                </p>
              )}

              <p className="text-xs text-content-tertiary">
                Get your API key from{' '}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  console.anthropic.com
                </a>
              </p>
            </div>
          )}
        </div>

        {/* Categories */}
        <div className="rounded-2xl border border-border-default bg-surface p-5">
          <div>
            <h2 className="font-medium text-content">Categories</h2>
            <p className="mt-1 text-sm text-content-secondary">Available expense categories</p>
          </div>

          {/* Category List (Read-only) */}
          <div className="mt-4 space-y-2">
            {categories
              ?.filter((c) => c.name !== 'Settlement')
              .map((category) => (
                <div
                  key={category.id}
                  className="flex items-center gap-2 rounded-lg bg-surface-tertiary px-3 py-2"
                >
                  <span className="text-lg">{category.icon}</span>
                  <span className="text-sm font-medium text-content">{category.name}</span>
                </div>
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
            <button
              onClick={() => navigate('/records')}
              className="rounded-lg bg-surface-tertiary px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover"
            >
              Export Data
            </button>
            <button
              onClick={() => navigate('/import')}
              className="rounded-lg bg-surface-tertiary px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover"
            >
              Import Data
            </button>
            <button
              onClick={handleScanDuplicates}
              disabled={!records || records.length === 0}
              className="rounded-lg bg-surface-tertiary px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Find Duplicates
            </button>
          </div>
        </div>

        {/* Duplicate Finder Results */}
        {showDuplicateFinder && (
          <div className="rounded-2xl border border-border-default bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-content">Duplicate Finder</h2>
              <button
                onClick={() => {
                  setShowDuplicateFinder(false)
                  setDuplicates([])
                }}
                className="text-sm text-content-secondary hover:text-content"
              >
                Close
              </button>
            </div>

            {scanningDuplicates ? (
              <div className="mt-4 text-center">
                <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="mt-2 text-sm text-content-secondary">Scanning records...</p>
              </div>
            ) : duplicates.length === 0 ? (
              <div className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-center dark:bg-green-500/10">
                <p className="text-sm text-green-600 dark:text-green-400">
                  No potential duplicates found!
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-content-secondary">
                  Found {duplicates.length} potential duplicate{duplicates.length !== 1 && 's'}
                </p>

                {duplicates.map((dup, index) => (
                  <div
                    key={`${dup.record1.uuid}-${dup.record2.uuid}`}
                    className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                        Pair {index + 1} • {Math.round(dup.similarity * 100)}% similar
                      </span>
                      <span className="text-xs text-amber-600/70 dark:text-amber-400/70">
                        {dup.reasons.join(' • ')}
                      </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg bg-white p-3 dark:bg-surface">
                        <p className="font-medium text-content">
                          {dup.record1.icon} {dup.record1.title}
                        </p>
                        <p className="text-sm text-content-secondary">
                          {dup.record1.currency} {dup.record1.amount.toLocaleString()} •{' '}
                          {dup.record1.date}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white p-3 dark:bg-surface">
                        <p className="font-medium text-content">
                          {dup.record2.icon} {dup.record2.title}
                        </p>
                        <p className="text-sm text-content-secondary">
                          {dup.record2.currency} {dup.record2.amount.toLocaleString()} •{' '}
                          {dup.record2.date}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => handleMergeDuplicates(dup.record1, dup.record2)}
                        className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
                      >
                        Keep First
                      </button>
                      <button
                        onClick={() => handleMergeDuplicates(dup.record2, dup.record1)}
                        className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
                      >
                        Keep Second
                      </button>
                      <button
                        onClick={() => handleIgnoreDuplicate(dup.record1, dup.record2)}
                        className="rounded-lg bg-surface-tertiary px-3 py-1.5 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover"
                      >
                        Keep Both
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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

        {/* Feedback */}
        <div className="rounded-2xl border border-border-default bg-surface p-5">
          <h2 className="font-medium text-content">Feedback</h2>
          <p className="mt-1 text-sm text-content-secondary">
            Found a bug or have a feature request?
          </p>
          <a
            href={'https://github.com/' + 'zemse' + '/record-money/issues/new'}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-surface-tertiary px-4 py-2.5 text-sm font-medium text-content transition-colors hover:bg-surface-hover"
          >
            <span>📝</span>
            <span>Submit Feedback on GitHub</span>
            <span className="text-content-tertiary">↗</span>
          </a>
        </div>
      </div>
    </div>
  )
}
