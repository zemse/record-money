/**
 * Device Pairing Component
 *
 * UI for pairing devices:
 * - Initiator: Generate QR/code, wait for response, verify emojis
 * - Joiner: Scan QR/enter code, show emojis, wait for keys
 */

import { useState, useEffect, useRef } from 'react'
import {
  generatePairingQR,
  serializeQRPayload,
  parseQRPayload,
  initiateJoining,
  pollForResponse,
  confirmPairing,
  pollForKeys,
  isSessionValid,
  getStateMessage,
  type PairingSession,
  type PairingQRPayload,
  type PairingProgress,
} from '../sync/pairing'
import { migrateSoloData, getMigrationStats, type MigrationProgress } from '../sync/migration'

// ============================================================================
// Types
// ============================================================================

type PairingRole = 'select' | 'initiator' | 'joiner'

interface DevicePairingProps {
  onComplete?: () => void
  onCancel?: () => void
}

// ============================================================================
// Component
// ============================================================================

export function DevicePairing({ onComplete, onCancel }: DevicePairingProps) {
  // Role selection
  const [role, setRole] = useState<PairingRole>('select')

  // Initiator state
  const [qrPayload, setQrPayload] = useState<PairingQRPayload | null>(null)
  const [payloadString, setPayloadString] = useState<string>('')
  const [initiatorSession, setInitiatorSession] = useState<PairingSession | null>(null)
  const [peerEmojis, setPeerEmojis] = useState<string[] | null>(null)

  // Joiner state
  const [inputCode, setInputCode] = useState('')
  const [joinerSession, setJoinerSession] = useState<PairingSession | null>(null)
  const [myEmojis, setMyEmojis] = useState<string[] | null>(null)

  // Shared state
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<PairingProgress | null>(null)
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null)
  const [isComplete, setIsComplete] = useState(false)
  const [copied, setCopied] = useState(false)

  // Polling refs
  const pollingRef = useRef(false)

  // ============================================================================
  // Initiator Flow
  // ============================================================================

  const startAsInitiator = async () => {
    setRole('initiator')
    setError(null)

    try {
      const { payload, session } = await generatePairingQR(true)
      setQrPayload(payload)
      setPayloadString(serializeQRPayload(payload))
      setInitiatorSession(session)

      // Start polling for response
      startPollingForResponse(session)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate pairing code')
      setRole('select')
    }
  }

  const startPollingForResponse = async (session: PairingSession) => {
    if (pollingRef.current) return
    pollingRef.current = true

    setProgress({ state: 'created', message: 'Waiting for other device...' })

    const result = await pollForResponse(session, (p) => setProgress(p))

    pollingRef.current = false

    if (result) {
      setPeerEmojis(result.emojis)
      setInitiatorSession({ ...session, ...result.response })
    } else if (session.state === 'expired') {
      setError('Session expired. Please try again.')
    }
  }

  const handleConfirmEmojis = async () => {
    if (!initiatorSession) return

    setProgress({ state: 'verified', message: 'Verifying...' })

    const result = await confirmPairing(initiatorSession, (p) => {
      setProgress(p)
      if (p.message.includes('Migrating')) {
        // Trigger migration progress updates
        migrateSoloData((mp) => setMigrationProgress(mp))
      }
    })

    if (result.success) {
      setIsComplete(true)
    } else {
      setError(result.error || 'Pairing failed')
    }
  }

  const handleRejectEmojis = () => {
    setError("Emojis don't match! This could be a security issue. Please try again.")
    setPeerEmojis(null)
    setInitiatorSession(null)
    setRole('select')
  }

  // ============================================================================
  // Joiner Flow
  // ============================================================================

  const startAsJoiner = () => {
    setRole('joiner')
    setError(null)
  }

  const handleJoinWithCode = async () => {
    setError(null)

    const payload = parseQRPayload(inputCode)
    if (!payload) {
      setError('Invalid pairing code. Please check and try again.')
      return
    }

    try {
      setProgress({ state: 'scanned', message: 'Processing...' })

      const { session, emojis } = await initiateJoining(payload, (p) => setProgress(p))
      setJoinerSession(session)
      setMyEmojis(emojis)

      // Start polling for keys
      startPollingForKeys(session)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to join')
      setProgress(null)
    }
  }

  const startPollingForKeys = async (session: PairingSession) => {
    if (pollingRef.current) return
    pollingRef.current = true

    const result = await pollForKeys(session, (p) => {
      setProgress(p)
      if (p.message.includes('Migrating')) {
        migrateSoloData((mp) => setMigrationProgress(mp))
      }
    })

    pollingRef.current = false

    if (result.success) {
      setIsComplete(true)
    } else {
      setError(result.error || 'Failed to complete pairing')
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(payloadString)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Failed to copy to clipboard')
    }
  }

  const handleCancel = () => {
    pollingRef.current = false
    setRole('select')
    setQrPayload(null)
    setPayloadString('')
    setInitiatorSession(null)
    setJoinerSession(null)
    setPeerEmojis(null)
    setMyEmojis(null)
    setInputCode('')
    setError(null)
    setProgress(null)
    setMigrationProgress(null)
    setIsComplete(false)
  }

  // ============================================================================
  // Render
  // ============================================================================

  // Complete screen
  if (isComplete) {
    return (
      <div className="rounded-2xl border border-border-default bg-surface p-5">
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-green-100 text-3xl dark:bg-green-500/20">
            ✅
          </div>
          <div>
            <h2 className="text-lg font-semibold text-content">Pairing Complete!</h2>
            <p className="mt-1 text-sm text-content-secondary">
              Your devices are now connected and will sync automatically.
            </p>
          </div>
          <button
            onClick={() => onComplete?.()}
            className="w-full rounded-xl bg-primary py-3 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  // Role selection
  if (role === 'select') {
    return (
      <div className="rounded-2xl border border-border-default bg-surface p-5">
        <div className="space-y-4">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-light text-3xl">
              📱
            </div>
            <h2 className="text-xl font-semibold text-content">Pair Devices</h2>
            <p className="mt-2 text-sm text-content-secondary">
              Connect another device to sync your data securely
            </p>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 dark:bg-red-500/10">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={startAsInitiator}
              className="w-full rounded-xl border-2 border-border-default p-4 text-left transition-all hover:border-primary hover:bg-primary/5"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">📤</span>
                <div>
                  <p className="font-medium text-content">Show Pairing Code</p>
                  <p className="text-sm text-content-secondary">
                    Generate a code for another device to scan
                  </p>
                </div>
              </div>
            </button>

            <button
              onClick={startAsJoiner}
              className="w-full rounded-xl border-2 border-border-default p-4 text-left transition-all hover:border-primary hover:bg-primary/5"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">📥</span>
                <div>
                  <p className="font-medium text-content">Enter Pairing Code</p>
                  <p className="text-sm text-content-secondary">Enter a code from another device</p>
                </div>
              </div>
            </button>
          </div>

          {onCancel && (
            <button
              onClick={onCancel}
              className="w-full rounded-xl border border-border-default py-3 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    )
  }

  // Initiator flow
  if (role === 'initiator') {
    // Show emoji verification
    if (peerEmojis) {
      return (
        <div className="rounded-2xl border border-border-default bg-surface p-5">
          <div className="space-y-4">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-3xl dark:bg-amber-500/20">
                🔐
              </div>
              <h2 className="text-lg font-semibold text-content">Verify Device</h2>
              <p className="mt-1 text-sm text-content-secondary">
                Confirm these emojis match on the other device
              </p>
            </div>

            <div className="rounded-xl bg-surface-tertiary p-6 text-center">
              <p className="text-4xl tracking-widest">{peerEmojis.join(' ')}</p>
            </div>

            <div className="rounded-xl bg-amber-50 px-4 py-3 dark:bg-amber-500/10">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                <strong>Security check:</strong> Make sure these emojis match exactly on both
                devices. If they don't match, someone might be trying to intercept your connection.
              </p>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 px-4 py-3 dark:bg-red-500/10">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            {progress && progress.state !== 'responded' && (
              <div className="text-center">
                <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="mt-2 text-sm text-content-secondary">{progress.message}</p>
              </div>
            )}

            {migrationProgress && (
              <div className="rounded-xl bg-surface-tertiary p-3">
                <p className="text-sm text-content-secondary">{migrationProgress.message}</p>
                {migrationProgress.total > 0 && (
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{
                        width: `${(migrationProgress.current / migrationProgress.total) * 100}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleRejectEmojis}
                className="flex-1 rounded-xl border border-red-500 py-3 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
              >
                Don't Match
              </button>
              <button
                onClick={handleConfirmEmojis}
                disabled={progress?.state === 'exchanging'}
                className="flex-1 rounded-xl bg-primary py-3 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                Emojis Match
              </button>
            </div>
          </div>
        </div>
      )
    }

    // Show pairing code
    return (
      <div className="rounded-2xl border border-border-default bg-surface p-5">
        <div className="space-y-4">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-light text-3xl">
              📤
            </div>
            <h2 className="text-lg font-semibold text-content">Pairing Code</h2>
            <p className="mt-1 text-sm text-content-secondary">
              Share this code with the device you want to pair
            </p>
          </div>

          {/* QR Placeholder - would need qrcode library */}
          <div className="flex aspect-square items-center justify-center rounded-xl bg-surface-tertiary">
            <div className="text-center">
              <span className="text-4xl">📱</span>
              <p className="mt-2 text-sm text-content-tertiary">QR code coming soon</p>
              <p className="text-xs text-content-tertiary">Use the code below for now</p>
            </div>
          </div>

          {/* Copy-able code */}
          <div className="relative">
            <div className="rounded-xl bg-surface-tertiary p-3">
              <p className="break-all font-mono text-xs text-content-secondary">
                {payloadString.slice(0, 100)}...
              </p>
            </div>
            <button
              onClick={copyToClipboard}
              className="absolute right-2 top-2 rounded-lg bg-surface px-3 py-1 text-xs font-medium text-primary hover:bg-surface-hover"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          {progress && (
            <div className="flex items-center justify-center gap-2 text-sm text-content-secondary">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span>{progress.message}</span>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 dark:bg-red-500/10">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <button
            onClick={handleCancel}
            className="w-full rounded-xl border border-border-default py-3 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // Joiner flow
  if (role === 'joiner') {
    // Show my emojis while waiting
    if (myEmojis) {
      return (
        <div className="rounded-2xl border border-border-default bg-surface p-5">
          <div className="space-y-4">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-light text-3xl">
                🔐
              </div>
              <h2 className="text-lg font-semibold text-content">Verify These Emojis</h2>
              <p className="mt-1 text-sm text-content-secondary">
                Confirm these emojis are shown on the other device
              </p>
            </div>

            <div className="rounded-xl bg-surface-tertiary p-6 text-center">
              <p className="text-4xl tracking-widest">{myEmojis.join(' ')}</p>
            </div>

            {progress && (
              <div className="flex items-center justify-center gap-2 text-sm text-content-secondary">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span>{progress.message}</span>
              </div>
            )}

            {migrationProgress && (
              <div className="rounded-xl bg-surface-tertiary p-3">
                <p className="text-sm text-content-secondary">{migrationProgress.message}</p>
                {migrationProgress.total > 0 && (
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{
                        width: `${(migrationProgress.current / migrationProgress.total) * 100}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="rounded-xl bg-red-50 px-4 py-3 dark:bg-red-500/10">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <div className="rounded-xl bg-blue-50 px-4 py-3 dark:bg-blue-500/10">
              <p className="text-sm text-blue-700 dark:text-blue-400">
                Waiting for the other device to confirm. Tell them to verify the emojis match.
              </p>
            </div>

            <button
              onClick={handleCancel}
              className="w-full rounded-xl border border-border-default py-3 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover"
            >
              Cancel
            </button>
          </div>
        </div>
      )
    }

    // Enter code
    return (
      <div className="rounded-2xl border border-border-default bg-surface p-5">
        <div className="space-y-4">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-light text-3xl">
              📥
            </div>
            <h2 className="text-lg font-semibold text-content">Enter Pairing Code</h2>
            <p className="mt-1 text-sm text-content-secondary">
              Paste the code from the other device
            </p>
          </div>

          <div>
            <textarea
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              placeholder="Paste the pairing code here..."
              rows={4}
              className="w-full resize-none rounded-xl border border-border-default bg-surface p-3 font-mono text-sm text-content transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 dark:bg-red-500/10">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {progress && (
            <div className="flex items-center justify-center gap-2 text-sm text-content-secondary">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span>{progress.message}</span>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleCancel}
              className="flex-1 rounded-xl border border-border-default py-3 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover"
            >
              Back
            </button>
            <button
              onClick={handleJoinWithCode}
              disabled={!inputCode.trim() || !!progress}
              className="flex-1 rounded-xl bg-primary py-3 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Connect
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}

// ============================================================================
// Migration Progress Component (standalone)
// ============================================================================

interface MigrationProgressDisplayProps {
  progress: MigrationProgress | null
}

export function MigrationProgressDisplay({ progress }: MigrationProgressDisplayProps) {
  if (!progress) return null

  const stages = ['preparing', 'users', 'records', 'groups', 'finalizing', 'complete'] as const
  const currentIndex = stages.indexOf(progress.stage)

  return (
    <div className="rounded-2xl border border-border-default bg-surface p-5">
      <div className="space-y-4">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-content">Migrating Data</h2>
          <p className="mt-1 text-sm text-content-secondary">{progress.message}</p>
        </div>

        {progress.total > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-content-secondary">Progress</span>
              <span className="font-medium text-content">
                {progress.current} / {progress.total}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-tertiary">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="space-y-2">
          {stages.map((stage, i) => {
            const isComplete = i < currentIndex
            const isCurrent = i === currentIndex
            const stageLabels: Record<string, string> = {
              preparing: 'Preparing',
              users: 'Converting users',
              records: 'Converting records',
              groups: 'Converting groups',
              finalizing: 'Finalizing',
              complete: 'Complete',
            }

            return (
              <div key={stage} className="flex items-center gap-3">
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
                  {stageLabels[stage]}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
