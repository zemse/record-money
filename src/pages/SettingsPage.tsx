import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, updateSettings, generateUUID, now } from '../db'
import { useTheme } from '../hooks/useTheme'
import type { Theme, Account } from '../types'
import { CLAUDE_MODELS, DEFAULT_CLAUDE_MODEL } from '../types'
import {
  findPotentialDuplicates,
  groupDuplicates,
  type DuplicateGroup,
} from '../utils/deduplication'
import { validateApiKey } from '../utils/claudeClient'
import { EmojiPicker } from '../components/EmojiPicker'

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
  const groups = useLiveQuery(() => db.groups.toArray())
  const accounts = useLiveQuery(() => db.accounts.toArray())
  const records = useLiveQuery(() => db.records.toArray())
  const { theme, setTheme } = useTheme()

  // API key management state
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [apiKeyStatus, setApiKeyStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>(
    'idle'
  )
  const [apiKeyError, setApiKeyError] = useState('')

  // Account management state
  const [showAccountForm, setShowAccountForm] = useState(false)
  const [newAccountName, setNewAccountName] = useState('')
  const [newAccountIcon, setNewAccountIcon] = useState('💳')
  const [showAccountEmojiPicker, setShowAccountEmojiPicker] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [accountError, setAccountError] = useState('')

  // Duplicate finder state
  const [showDuplicateFinder, setShowDuplicateFinder] = useState(false)
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([])
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

  // Account management functions
  const handleAddAccount = async () => {
    setAccountError('')
    if (!newAccountName.trim()) {
      setAccountError('Account name is required')
      return
    }

    // Check for duplicate name
    const existing = accounts?.find(
      (a) => a.name.toLowerCase() === newAccountName.trim().toLowerCase()
    )
    if (existing) {
      setAccountError('An account with this name already exists')
      return
    }

    const newAccount: Account = {
      id: generateUUID(),
      name: newAccountName.trim(),
      icon: newAccountIcon,
      createdAt: now(),
    }

    await db.accounts.add(newAccount)
    setNewAccountName('')
    setNewAccountIcon('💳')
    setShowAccountForm(false)
  }

  const handleUpdateAccount = async () => {
    if (!editingAccount) return
    setAccountError('')

    if (!newAccountName.trim()) {
      setAccountError('Account name is required')
      return
    }

    // Check for duplicate name (excluding current)
    const existing = accounts?.find(
      (a) =>
        a.id !== editingAccount.id && a.name.toLowerCase() === newAccountName.trim().toLowerCase()
    )
    if (existing) {
      setAccountError('An account with this name already exists')
      return
    }

    await db.accounts.update(editingAccount.id, {
      name: newAccountName.trim(),
      icon: newAccountIcon,
    })

    setEditingAccount(null)
    setNewAccountName('')
    setNewAccountIcon('💳')
    setShowAccountForm(false)
  }

  const handleDeleteAccount = async (account: Account) => {
    if (window.confirm(`Delete account "${account.name}"?`)) {
      await db.accounts.delete(account.id)
      // Clear default if this was the default account
      if (settings?.defaultAccountId === account.id) {
        await updateSettings({ defaultAccountId: undefined })
      }
    }
  }

  const startEditAccount = (account: Account) => {
    setEditingAccount(account)
    setNewAccountName(account.name)
    setNewAccountIcon(account.icon)
    setShowAccountForm(true)
    setAccountError('')
  }

  const cancelAccountForm = () => {
    setShowAccountForm(false)
    setEditingAccount(null)
    setNewAccountName('')
    setNewAccountIcon('💳')
    setAccountError('')
  }

  // Duplicate finder functions
  const handleScanDuplicates = () => {
    if (!records) return

    setScanningDuplicates(true)
    setShowDuplicateFinder(true)

    // Use setTimeout to allow UI to update before heavy computation
    setTimeout(() => {
      const found = findPotentialDuplicates(records, { dateBuffer: 1, minSimilarity: 0.7 })
      const grouped = groupDuplicates(found)
      setDuplicateGroups(grouped)
      setScanningDuplicates(false)
    }, 100)
  }

  // Keep one record, delete all others in the group
  const handleKeepRecord = async (groupIndex: number, keepUuid: string) => {
    const group = duplicateGroups[groupIndex]
    if (!group) return

    const toDelete = group.records.filter((r) => r.uuid !== keepUuid)
    if (
      !window.confirm(
        `Keep this record and delete ${toDelete.length} other${toDelete.length > 1 ? 's' : ''}?`
      )
    )
      return

    for (const record of toDelete) {
      await db.records.delete(record.uuid)
    }

    // Remove this group from the list
    setDuplicateGroups(duplicateGroups.filter((_, i) => i !== groupIndex))
  }

  // Delete a single record from a group
  const handleDeleteFromGroup = async (groupIndex: number, deleteUuid: string) => {
    if (!window.confirm('Delete this record?')) return

    await db.records.delete(deleteUuid)

    // Update the group - remove the deleted record
    setDuplicateGroups(
      duplicateGroups
        .map((group, i) => {
          if (i !== groupIndex) return group
          return {
            ...group,
            records: group.records.filter((r) => r.uuid !== deleteUuid),
          }
        })
        .filter((group) => group.records.length >= 2) // Remove groups with less than 2 records
    )
  }

  // Dismiss/ignore a group
  const handleDismissGroup = (groupIndex: number) => {
    setDuplicateGroups(duplicateGroups.filter((_, i) => i !== groupIndex))
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

        {/* AI Memory */}
        {settings?.claudeApiKey && (
          <div className="rounded-2xl border border-border-default bg-surface p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium text-content">AI Memory</h2>
                <p className="mt-1 text-sm text-content-secondary">
                  Store notes about your preferences for better AI responses
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateSettings({ enableAiMemory: !(settings?.enableAiMemory ?? true) })
                }
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  settings?.enableAiMemory ?? true ? 'bg-primary' : 'bg-content-tertiary'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    settings?.enableAiMemory ?? true ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>

            {(settings?.enableAiMemory ?? true) && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-content">
                  User Notes
                </label>
                <p className="mt-1 text-xs text-content-tertiary">
                  Brief notes about your preferences, habits, or context the AI should remember
                </p>
                <textarea
                  value={settings?.aiUserSummary || ''}
                  onChange={(e) => updateSettings({ aiUserSummary: e.target.value })}
                  placeholder="e.g., I usually pay with Cash for small purchases. My wife is Priya. I track expenses in INR."
                  className="mt-2 block w-full rounded-xl border border-border-default bg-surface px-3 py-2.5 text-sm text-content transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  rows={3}
                />
                {settings?.aiUserSummary && (
                  <button
                    onClick={() => updateSettings({ aiUserSummary: undefined })}
                    className="mt-2 text-xs text-red-500 hover:text-red-600"
                  >
                    Clear notes
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Accounts */}
        <div className="rounded-2xl border border-border-default bg-surface p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-medium text-content">Accounts</h2>
              <p className="mt-1 text-sm text-content-secondary">
                Track which account money was spent from
              </p>
            </div>
            {!showAccountForm && (
              <button
                onClick={() => setShowAccountForm(true)}
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
              >
                + Add
              </button>
            )}
          </div>

          {/* Add/Edit Account Form */}
          {showAccountForm && (
            <div className="mt-4 rounded-xl border border-border-default bg-surface-tertiary p-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowAccountEmojiPicker(!showAccountEmojiPicker)}
                    className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface text-2xl transition-colors hover:bg-surface-hover"
                  >
                    {newAccountIcon}
                  </button>
                  {showAccountEmojiPicker && (
                    <div className="absolute left-0 top-full z-10 mt-2">
                      <EmojiPicker
                        onSelect={(emoji) => {
                          setNewAccountIcon(emoji)
                          setShowAccountEmojiPicker(false)
                        }}
                        onClose={() => setShowAccountEmojiPicker(false)}
                      />
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  value={newAccountName}
                  onChange={(e) => {
                    setNewAccountName(e.target.value)
                    setAccountError('')
                  }}
                  placeholder="Account name (e.g., Cash, HDFC Bank)"
                  className="flex-1 rounded-lg border border-border-default bg-surface px-3 py-2 text-content transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              {accountError && <p className="mt-2 text-sm text-red-500">{accountError}</p>}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={editingAccount ? handleUpdateAccount : handleAddAccount}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
                >
                  {editingAccount ? 'Update' : 'Add'}
                </button>
                <button
                  onClick={cancelAccountForm}
                  className="rounded-lg bg-surface px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Account List */}
          <div className="mt-4 space-y-2">
            {accounts?.length === 0 && !showAccountForm && (
              <p className="text-sm text-content-tertiary">
                No accounts yet. Add accounts like "Cash", "Bank", or "Wallet" to track where your
                money is spent from.
              </p>
            )}
            {accounts?.map((acc) => (
              <div
                key={acc.id}
                className="flex items-center justify-between rounded-lg bg-surface-tertiary px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{acc.icon}</span>
                  <span className="text-sm font-medium text-content">{acc.name}</span>
                  {settings?.defaultAccountId === acc.id && (
                    <span className="rounded-full bg-primary-light px-2 py-0.5 text-xs font-medium text-primary">
                      Default
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  {settings?.defaultAccountId !== acc.id && (
                    <button
                      onClick={() => updateSettings({ defaultAccountId: acc.id })}
                      className="rounded-lg px-2 py-1.5 text-xs font-medium text-content-secondary transition-colors hover:bg-surface-hover hover:text-content"
                      title="Set as default"
                    >
                      Set Default
                    </button>
                  )}
                  <button
                    onClick={() => startEditAccount(acc)}
                    className="rounded-lg p-1.5 text-content-tertiary transition-colors hover:bg-surface-hover hover:text-content"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDeleteAccount(acc)}
                    className="rounded-lg p-1.5 text-content-tertiary transition-colors hover:bg-surface-hover hover:text-red-500"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Clear default account if set */}
          {settings?.defaultAccountId && accounts && accounts.length > 0 && (
            <div className="mt-3 border-t border-border-default pt-3">
              <button
                onClick={() => updateSettings({ defaultAccountId: undefined })}
                className="text-sm text-content-secondary hover:text-content"
              >
                Clear default account
              </button>
            </div>
          )}
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
                  setDuplicateGroups([])
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
            ) : duplicateGroups.length === 0 ? (
              <div className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-center dark:bg-green-500/10">
                <p className="text-sm text-green-600 dark:text-green-400">
                  No potential duplicates found!
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-content-secondary">
                  Found {duplicateGroups.length} group{duplicateGroups.length !== 1 && 's'} of
                  potential duplicates
                </p>

                {duplicateGroups.map((group, groupIndex) => {
                  // Helper to format accounts
                  const formatAccounts = (
                    recordAccounts?: { accountId: string; amount: number }[]
                  ) => {
                    if (!recordAccounts || recordAccounts.length === 0) return '(none)'
                    return recordAccounts
                      .map((ap) => {
                        const acc = accounts?.find((a) => a.id === ap.accountId)
                        return acc
                          ? `${acc.icon} ${acc.name}: ${ap.amount}`
                          : `${ap.accountId}: ${ap.amount}`
                      })
                      .join(', ')
                  }

                  return (
                    <div
                      key={group.records.map((r) => r.uuid).join('-')}
                      className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10"
                    >
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                            Group {groupIndex + 1} • {group.records.length} records
                          </span>
                          {/* Color-coded similarity badge */}
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              group.avgSimilarity >= 0.9
                                ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                                : group.avgSimilarity >= 0.7
                                  ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400'
                                  : 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400'
                            }`}
                          >
                            {Math.round(group.avgSimilarity * 100)}% match
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-amber-600/70 dark:text-amber-400/70">
                            {group.reasons.join(' • ')}
                          </span>
                          <button
                            onClick={() => handleDismissGroup(groupIndex)}
                            className="rounded px-2 py-0.5 text-xs text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-500/20"
                            title="Dismiss group"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {group.records.map((record, recordIndex) => (
                          <div
                            key={record.uuid}
                            className="rounded-lg bg-white p-3 dark:bg-surface"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-content">
                                  {record.icon} {record.title}
                                </p>
                                <p className="text-sm text-content-secondary">
                                  {record.currency} {record.amount.toLocaleString()} •{' '}
                                  {record.date} {record.time}
                                </p>
                                {record.description && (
                                  <p className="mt-1 truncate text-xs text-content-tertiary">
                                    {record.description}
                                  </p>
                                )}
                                {record.comments && (
                                  <p className="mt-0.5 truncate text-xs text-content-tertiary italic">
                                    {record.comments}
                                  </p>
                                )}
                                <div className="mt-1 flex flex-wrap gap-2 text-xs text-content-secondary">
                                  <span>
                                    By:{' '}
                                    {record.paidBy
                                      .map(
                                        (p) =>
                                          users?.find((u) => u.email === p.email)?.alias || p.email
                                      )
                                      .join(', ')}
                                  </span>
                                  <span>•</span>
                                  <span>
                                    For:{' '}
                                    {record.paidFor
                                      .map(
                                        (p) =>
                                          users?.find((u) => u.email === p.email)?.alias || p.email
                                      )
                                      .join(', ')}
                                  </span>
                                  {record.groupId && (
                                    <>
                                      <span>•</span>
                                      <span>
                                        Group:{' '}
                                        {groups?.find((g) => g.uuid === record.groupId)?.name ||
                                          'Unknown'}
                                      </span>
                                    </>
                                  )}
                                  {record.accounts && record.accounts.length > 0 && (
                                    <>
                                      <span>•</span>
                                      <span>Accounts: {formatAccounts(record.accounts)}</span>
                                    </>
                                  )}
                                </div>
                                <p className="mt-1 text-xs text-content-tertiary">
                                  Created: {new Date(record.createdAt).toLocaleString()}
                                </p>
                              </div>
                              <div className="flex shrink-0 gap-1">
                                <button
                                  onClick={() => handleKeepRecord(groupIndex, record.uuid)}
                                  className="rounded-lg bg-primary px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-primary-hover"
                                  title="Keep this record, delete others"
                                >
                                  Keep
                                </button>
                                {group.records.length > 2 && (
                                  <button
                                    onClick={() =>
                                      handleDeleteFromGroup(groupIndex, record.uuid)
                                    }
                                    className="rounded-lg bg-red-100 px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-200 dark:bg-red-500/20 dark:text-red-400 dark:hover:bg-red-500/30"
                                    title="Delete this record"
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
                            </div>
                            {recordIndex === 0 && group.records.length === 2 && (
                              <p className="mt-2 text-center text-xs text-amber-600 dark:text-amber-400">
                                — vs —
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
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
