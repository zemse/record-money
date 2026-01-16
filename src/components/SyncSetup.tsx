/**
 * Sync Setup Component
 *
 * First-time setup UI for P2P sync:
 * - Provider selection (Piñata, etc.)
 * - API key configuration
 * - Device setup with progress
 */

import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import {
  setupDevice,
  getSyncStatus,
  getDeviceVerificationEmojis,
  resetSyncConfig,
  type DeviceSetupProgress,
} from '../sync/device-setup'
import { getAvailableProviders } from '../sync/ipfs'
import type { ProviderConfig, PinataConfig } from '../sync/ipfs'

// ============================================================================
// Types
// ============================================================================

type SetupStep = 'intro' | 'provider' | 'config' | 'name' | 'setup' | 'complete'

interface SyncSetupProps {
  onComplete?: () => void
  onCancel?: () => void
}

// ============================================================================
// Component
// ============================================================================

export function SyncSetup({ onComplete, onCancel }: SyncSetupProps) {
  const settings = useLiveQuery(() => db.settings.get('main'))

  // Setup state
  const [step, setStep] = useState<SetupStep>('intro')
  const [selectedProvider, setSelectedProvider] = useState<ProviderConfig['type'] | null>(null)

  // Piñata config
  const [pinataApiKey, setPinataApiKey] = useState('')
  const [pinataApiSecret, setPinataApiSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)

  // User name
  const [userName, setUserName] = useState('')

  // Setup progress
  const [setupProgress, setSetupProgress] = useState<DeviceSetupProgress | null>(null)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [setupComplete, setSetupComplete] = useState(false)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [verificationEmojis, setVerificationEmojis] = useState<string[] | null>(null)

  // Get available providers
  const providers = getAvailableProviders()

  // Pre-fill user name from settings if available
  useEffect(() => {
    if (settings?.currentUserEmail) {
      const users = db.users.toArray().then((users) => {
        const currentUser = users.find((u) => u.email === settings.currentUserEmail)
        if (currentUser) {
          setUserName(currentUser.alias)
        }
      })
    }
  }, [settings?.currentUserEmail])

  // Build provider config
  const buildProviderConfig = (): ProviderConfig | null => {
    if (selectedProvider === 'pinata') {
      if (!pinataApiKey.trim() || !pinataApiSecret.trim()) {
        return null
      }
      return {
        type: 'pinata',
        apiKey: pinataApiKey.trim(),
        apiSecret: pinataApiSecret.trim(),
      } as PinataConfig
    }
    return null
  }

  // Handle setup
  const handleSetup = async () => {
    const providerConfig = buildProviderConfig()
    if (!providerConfig || !userName.trim()) {
      setSetupError('Please fill in all required fields')
      return
    }

    setStep('setup')
    setSetupError(null)

    const result = await setupDevice(providerConfig, userName.trim(), (progress) => {
      setSetupProgress(progress)
    })

    if (result.success) {
      setSetupComplete(true)
      setDeviceId(result.deviceId || null)
      setVerificationEmojis(result.verificationEmojis || null)
      setStep('complete')
    } else {
      setSetupError(result.error || 'Setup failed')
      setStep('config')
    }
  }

  // Render based on step
  const renderStep = () => {
    switch (step) {
      case 'intro':
        return renderIntro()
      case 'provider':
        return renderProviderSelection()
      case 'config':
        return renderProviderConfig()
      case 'name':
        return renderNameInput()
      case 'setup':
        return renderSetupProgress()
      case 'complete':
        return renderComplete()
      default:
        return null
    }
  }

  // ============================================================================
  // Step Renderers
  // ============================================================================

  const renderIntro = () => (
    <div className="space-y-4">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-light text-3xl">
          🔄
        </div>
        <h2 className="text-xl font-semibold text-content">Enable P2P Sync</h2>
        <p className="mt-2 text-sm text-content-secondary">
          Sync your data across devices without a central server. Your data is encrypted and stored
          on IPFS.
        </p>
      </div>

      <div className="rounded-xl bg-surface-tertiary p-4">
        <h3 className="font-medium text-content">How it works:</h3>
        <ul className="mt-2 space-y-2 text-sm text-content-secondary">
          <li className="flex items-start gap-2">
            <span className="text-primary">🔐</span>
            <span>Your data is encrypted with keys only you control</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">🌐</span>
            <span>Data is stored on IPFS via a pinning service</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">📱</span>
            <span>Pair devices by scanning a QR code</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">👥</span>
            <span>Share expenses with others via groups</span>
          </li>
        </ul>
      </div>

      <div className="flex gap-3">
        {onCancel && (
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-border-default py-3 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover"
          >
            Cancel
          </button>
        )}
        <button
          onClick={() => setStep('provider')}
          className="flex-1 rounded-xl bg-primary py-3 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
        >
          Get Started
        </button>
      </div>
    </div>
  )

  const renderProviderSelection = () => (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-content">Choose Storage Provider</h2>
        <p className="mt-1 text-sm text-content-secondary">
          Select an IPFS pinning service to store your encrypted data
        </p>
      </div>

      <div className="space-y-2">
        {providers.map((provider) => (
          <button
            key={provider.type}
            onClick={() => {
              if (provider.available) {
                setSelectedProvider(provider.type)
                setStep('config')
              }
            }}
            disabled={!provider.available}
            className={`w-full rounded-xl border-2 p-4 text-left transition-all ${
              !provider.available
                ? 'cursor-not-allowed border-border-default opacity-50'
                : selectedProvider === provider.type
                  ? 'border-primary bg-primary-light'
                  : 'border-border-default hover:border-content-tertiary'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-content">{provider.name}</p>
                <p className="mt-0.5 text-sm text-content-secondary">{provider.description}</p>
              </div>
              {!provider.available && (
                <span className="rounded-full bg-surface-tertiary px-2 py-1 text-xs text-content-tertiary">
                  Coming soon
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setStep('intro')}
          className="flex-1 rounded-xl border border-border-default py-3 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover"
        >
          Back
        </button>
      </div>
    </div>
  )

  const renderProviderConfig = () => (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-content">Configure Piñata</h2>
        <p className="mt-1 text-sm text-content-secondary">
          Enter your Piñata API credentials. Get them from{' '}
          <a
            href="https://app.pinata.cloud/developers/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            app.pinata.cloud
          </a>
        </p>
      </div>

      <div className="rounded-xl bg-amber-50 px-4 py-3 dark:bg-amber-500/10">
        <p className="text-sm text-amber-700 dark:text-amber-400">
          <strong>Note:</strong> Your API keys are stored locally and used to upload encrypted data
          to Piñata. Piñata cannot read your data as it's encrypted before upload.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-content">API Key</label>
          <input
            type="text"
            value={pinataApiKey}
            onChange={(e) => setPinataApiKey(e.target.value)}
            placeholder="Enter your Piñata API key"
            className="mt-1 w-full rounded-lg border border-border-default bg-surface px-3 py-2 text-content transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-content">API Secret</label>
          <div className="relative mt-1">
            <input
              type={showSecret ? 'text' : 'password'}
              value={pinataApiSecret}
              onChange={(e) => setPinataApiSecret(e.target.value)}
              placeholder="Enter your Piñata API secret"
              className="w-full rounded-lg border border-border-default bg-surface px-3 py-2 pr-10 text-content transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-content-tertiary hover:text-content"
            >
              {showSecret ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>
        </div>
      </div>

      {setupError && (
        <div className="rounded-xl bg-red-50 px-4 py-3 dark:bg-red-500/10">
          <p className="text-sm text-red-600 dark:text-red-400">{setupError}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => {
            setSelectedProvider(null)
            setStep('provider')
          }}
          className="flex-1 rounded-xl border border-border-default py-3 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover"
        >
          Back
        </button>
        <button
          onClick={() => {
            if (pinataApiKey.trim() && pinataApiSecret.trim()) {
              setSetupError(null)
              setStep('name')
            } else {
              setSetupError('Please enter both API key and secret')
            }
          }}
          disabled={!pinataApiKey.trim() || !pinataApiSecret.trim()}
          className="flex-1 rounded-xl bg-primary py-3 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  )

  const renderNameInput = () => (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-content">Your Name</h2>
        <p className="mt-1 text-sm text-content-secondary">
          This name will be shown to others when you share expenses
        </p>
      </div>

      <div>
        <input
          type="text"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="Enter your name"
          className="w-full rounded-lg border border-border-default bg-surface px-3 py-2 text-content transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          autoFocus
        />
      </div>

      {setupError && (
        <div className="rounded-xl bg-red-50 px-4 py-3 dark:bg-red-500/10">
          <p className="text-sm text-red-600 dark:text-red-400">{setupError}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => setStep('config')}
          className="flex-1 rounded-xl border border-border-default py-3 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover"
        >
          Back
        </button>
        <button
          onClick={handleSetup}
          disabled={!userName.trim()}
          className="flex-1 rounded-xl bg-primary py-3 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Complete Setup
        </button>
      </div>
    </div>
  )

  const renderSetupProgress = () => (
    <div className="space-y-4">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-light">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
        </div>
        <h2 className="text-lg font-semibold text-content">Setting up...</h2>
        <p className="mt-2 text-sm text-content-secondary">
          {setupProgress?.message || 'Initializing...'}
        </p>
      </div>

      <div className="space-y-2">
        {(['keys', 'provider', 'manifest', 'complete'] as const).map((s, i) => {
          const stepLabels = {
            keys: 'Generate keys',
            provider: 'Validate provider',
            manifest: 'Publish manifest',
            complete: 'Complete',
          }
          const currentIndex = ['keys', 'provider', 'manifest', 'complete'].indexOf(
            setupProgress?.step || 'keys'
          )
          const isComplete = i < currentIndex
          const isCurrent = setupProgress?.step === s

          return (
            <div key={s} className="flex items-center gap-3">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                  isComplete
                    ? 'bg-green-500 text-white'
                    : isCurrent
                      ? 'bg-primary text-white'
                      : 'bg-surface-tertiary text-content-tertiary'
                }`}
              >
                {isComplete ? '✓' : i + 1}
              </div>
              <span
                className={`text-sm ${
                  isComplete || isCurrent ? 'text-content' : 'text-content-tertiary'
                }`}
              >
                {stepLabels[s]}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )

  const renderComplete = () => (
    <div className="space-y-4">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-100 text-3xl dark:bg-green-500/20">
          ✅
        </div>
        <h2 className="text-lg font-semibold text-content">Setup Complete!</h2>
        <p className="mt-2 text-sm text-content-secondary">
          Your device is now set up for P2P sync
        </p>
      </div>

      {verificationEmojis && (
        <div className="rounded-xl bg-surface-tertiary p-4 text-center">
          <p className="text-sm font-medium text-content">Your device verification code:</p>
          <p className="mt-2 text-3xl tracking-wider">{verificationEmojis.join(' ')}</p>
          <p className="mt-2 text-xs text-content-tertiary">
            Use this to verify when pairing with other devices
          </p>
        </div>
      )}

      {deviceId && (
        <div className="rounded-xl bg-surface-tertiary p-4">
          <p className="text-xs text-content-tertiary">Device ID:</p>
          <p className="mt-1 break-all font-mono text-xs text-content-secondary">
            {deviceId.slice(0, 16)}...{deviceId.slice(-16)}
          </p>
        </div>
      )}

      <button
        onClick={() => onComplete?.()}
        className="w-full rounded-xl bg-primary py-3 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
      >
        Done
      </button>
    </div>
  )

  return (
    <div className="rounded-2xl border border-border-default bg-surface p-5">{renderStep()}</div>
  )
}

// ============================================================================
// Sync Status Display Component
// ============================================================================

interface SyncStatusProps {
  onSetup?: () => void
  onPairDevice?: () => void
}

export function SyncStatus({ onSetup, onPairDevice }: SyncStatusProps) {
  const [status, setStatus] = useState<{
    mode: 'solo' | 'synced' | 'not_configured'
    deviceId?: string
    hasProvider: boolean
  } | null>(null)
  const [verificationEmojis, setVerificationEmojis] = useState<string[] | null>(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  useEffect(() => {
    getSyncStatus().then(setStatus)
    getDeviceVerificationEmojis().then(setVerificationEmojis)
  }, [])

  const handleReset = async () => {
    await resetSyncConfig()
    setShowResetConfirm(false)
    getSyncStatus().then(setStatus)
  }

  if (!status) {
    return (
      <div className="rounded-2xl border border-border-default bg-surface p-5">
        <div className="animate-pulse">
          <div className="h-4 w-32 rounded bg-surface-tertiary" />
          <div className="mt-2 h-3 w-48 rounded bg-surface-tertiary" />
        </div>
      </div>
    )
  }

  if (status.mode === 'synced') {
    return (
      <div className="rounded-2xl border border-border-default bg-surface p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium text-content">P2P Sync</h2>
            <p className="mt-1 text-sm text-content-secondary">Sync is enabled</p>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-500/20">
            <span className="text-green-600 dark:text-green-400">✓</span>
          </div>
        </div>

        {verificationEmojis && (
          <div className="mt-4 rounded-xl bg-surface-tertiary p-3">
            <p className="text-xs text-content-tertiary">Verification code:</p>
            <p className="mt-1 text-xl tracking-wider">{verificationEmojis.join(' ')}</p>
          </div>
        )}

        {status.deviceId && (
          <div className="mt-3">
            <p className="text-xs text-content-tertiary">Device ID:</p>
            <p className="mt-0.5 break-all font-mono text-xs text-content-secondary">
              {status.deviceId.slice(0, 12)}...
            </p>
          </div>
        )}

        <div className="mt-4 border-t border-border-default pt-4">
          {onPairDevice && (
            <button
              onClick={onPairDevice}
              className="mb-4 w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
            >
              Pair Another Device
            </button>
          )}
        </div>

        <div className="border-t border-border-default pt-4">
          {showResetConfirm ? (
            <div className="space-y-3">
              <p className="text-sm text-red-600 dark:text-red-400">
                This will disable sync. You'll need to re-pair all devices.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 rounded-lg border border-border-default py-2 text-sm font-medium text-content-secondary hover:bg-surface-hover"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReset}
                  className="flex-1 rounded-lg bg-red-500 py-2 text-sm font-medium text-white hover:bg-red-600"
                >
                  Reset
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="text-sm text-red-500 hover:text-red-600"
            >
              Reset Sync
            </button>
          )}
        </div>
      </div>
    )
  }

  // Not configured
  return (
    <div className="rounded-2xl border border-border-default bg-surface p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium text-content">P2P Sync</h2>
          <p className="mt-1 text-sm text-content-secondary">Sync your data across devices</p>
        </div>
        <button
          onClick={onSetup}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
        >
          Set Up
        </button>
      </div>
    </div>
  )
}
