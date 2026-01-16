/**
 * Conflict Resolution Components
 *
 * UI for resolving sync conflicts:
 * - Binary conflict (2 options)
 * - Multi-device conflict (3+ options)
 * - Bulk conflict list with scroll
 */

import { useState, useEffect } from 'react'
import {
  getPendingConflicts,
  resolveConflict,
  resolveConflictsBulk,
  getConflictDescription,
  formatOptionValue,
  getRelativeTime,
  type StoredConflict,
  type ConflictOption,
} from '../sync/conflicts'

// ============================================================================
// Types
// ============================================================================

interface ConflictResolutionProps {
  onComplete?: () => void
  onClose?: () => void
}

interface SingleConflictProps {
  conflict: StoredConflict
  onResolve: (conflictId: string, winnerMutationUuid: string) => Promise<void>
  isResolving: boolean
}

// ============================================================================
// Main Component
// ============================================================================

export function ConflictResolution({ onComplete, onClose }: ConflictResolutionProps) {
  const [conflicts, setConflicts] = useState<StoredConflict[]>([])
  const [loading, setLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Bulk resolution state
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkSelections, setBulkSelections] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    loadConflicts()
  }, [])

  const loadConflicts = async () => {
    setLoading(true)
    const pending = await getPendingConflicts()
    setConflicts(pending)
    setLoading(false)
  }

  const handleResolve = async (conflictId: string, winnerMutationUuid: string) => {
    setResolving(true)
    setError(null)

    const result = await resolveConflict(conflictId, winnerMutationUuid)

    if (result.success) {
      // Move to next conflict or complete
      if (currentIndex >= conflicts.length - 1) {
        onComplete?.()
      } else {
        setCurrentIndex((i) => i + 1)
        // Reload to get updated list
        await loadConflicts()
      }
    } else {
      setError(result.error || 'Failed to resolve conflict')
    }

    setResolving(false)
  }

  const handleBulkResolve = async () => {
    if (bulkSelections.size === 0) {
      setError('Please select a resolution for at least one conflict')
      return
    }

    setResolving(true)
    setError(null)

    const resolutions = Array.from(bulkSelections.entries()).map(
      ([conflictId, winnerMutationUuid]) => ({
        conflictId,
        winnerMutationUuid,
      })
    )

    const result = await resolveConflictsBulk(resolutions)

    if (result.failed > 0) {
      setError(`${result.failed} conflicts failed to resolve`)
    }

    if (result.success > 0) {
      await loadConflicts()
      setBulkSelections(new Map())
    }

    if (conflicts.length === 0) {
      onComplete?.()
    }

    setResolving(false)
  }

  const handleBulkSelect = (conflictId: string, winnerMutationUuid: string) => {
    setBulkSelections((prev) => {
      const next = new Map(prev)
      next.set(conflictId, winnerMutationUuid)
      return next
    })
  }

  // Loading state
  if (loading) {
    return (
      <div className="rounded-2xl border border-border-default bg-surface p-5">
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    )
  }

  // No conflicts
  if (conflicts.length === 0) {
    return (
      <div className="rounded-2xl border border-border-default bg-surface p-5">
        <div className="py-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-100 text-3xl dark:bg-green-500/20">
            ✅
          </div>
          <h2 className="text-lg font-semibold text-content">No Conflicts</h2>
          <p className="mt-1 text-sm text-content-secondary">
            All your data is in sync across devices.
          </p>
          {onClose && (
            <button
              onClick={onClose}
              className="mt-4 rounded-xl bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary-hover"
            >
              Done
            </button>
          )}
        </div>
      </div>
    )
  }

  // Bulk mode
  if (bulkMode) {
    return (
      <div className="rounded-2xl border border-border-default bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-content">Resolve Conflicts</h2>
            <p className="text-sm text-content-secondary">
              {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''} to resolve
            </p>
          </div>
          <button
            onClick={() => setBulkMode(false)}
            className="text-sm text-primary hover:text-primary-hover"
          >
            One at a time
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 dark:bg-red-500/10">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <div className="max-h-96 space-y-4 overflow-y-auto">
          {conflicts.map((conflict) => (
            <BulkConflictItem
              key={conflict.id}
              conflict={conflict}
              selectedWinner={bulkSelections.get(conflict.id)}
              onSelect={(winner) => handleBulkSelect(conflict.id, winner)}
            />
          ))}
        </div>

        <div className="mt-4 flex gap-3">
          {onClose && (
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-border-default py-3 text-sm font-medium text-content-secondary hover:bg-surface-hover"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleBulkResolve}
            disabled={resolving || bulkSelections.size === 0}
            className="flex-1 rounded-xl bg-primary py-3 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {resolving ? 'Resolving...' : `Resolve ${bulkSelections.size} Selected`}
          </button>
        </div>
      </div>
    )
  }

  // Single conflict mode
  const currentConflict = conflicts[currentIndex]

  return (
    <div className="rounded-2xl border border-border-default bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-content">Resolve Conflict</h2>
          <p className="text-sm text-content-secondary">
            {currentIndex + 1} of {conflicts.length}
          </p>
        </div>
        {conflicts.length > 1 && (
          <button
            onClick={() => setBulkMode(true)}
            className="text-sm text-primary hover:text-primary-hover"
          >
            Resolve all
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 dark:bg-red-500/10">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {currentConflict.options.length === 2 ? (
        <BinaryConflict
          conflict={currentConflict}
          onResolve={handleResolve}
          isResolving={resolving}
        />
      ) : (
        <MultiDeviceConflict
          conflict={currentConflict}
          onResolve={handleResolve}
          isResolving={resolving}
        />
      )}

      {/* Navigation */}
      {conflicts.length > 1 && (
        <div className="mt-4 flex justify-between border-t border-border-default pt-4">
          <button
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            disabled={currentIndex === 0}
            className="text-sm text-content-secondary hover:text-content disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-content-tertiary">
            {currentIndex + 1} / {conflicts.length}
          </span>
          <button
            onClick={() => setCurrentIndex((i) => Math.min(conflicts.length - 1, i + 1))}
            disabled={currentIndex === conflicts.length - 1}
            className="text-sm text-content-secondary hover:text-content disabled:opacity-50"
          >
            Skip
          </button>
        </div>
      )}

      {onClose && (
        <button
          onClick={onClose}
          className="mt-4 w-full rounded-xl border border-border-default py-3 text-sm font-medium text-content-secondary hover:bg-surface-hover"
        >
          Close
        </button>
      )}
    </div>
  )
}

// ============================================================================
// Binary Conflict (2 options)
// ============================================================================

function BinaryConflict({ conflict, onResolve, isResolving }: SingleConflictProps) {
  const [optionA, optionB] = conflict.options

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-amber-50 px-4 py-3 dark:bg-amber-500/10">
        <p className="text-sm text-amber-700 dark:text-amber-400">
          {getConflictDescription(conflict)}
        </p>
      </div>

      {conflict.field && (
        <div className="text-center">
          <span className="rounded-lg bg-surface-tertiary px-3 py-1 text-sm font-medium text-content">
            {conflict.field}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <ConflictOptionCard
          option={optionA}
          label="Option A"
          onSelect={() => onResolve(conflict.id, optionA.mutationUuid)}
          disabled={isResolving}
        />
        <ConflictOptionCard
          option={optionB}
          label="Option B"
          onSelect={() => onResolve(conflict.id, optionB.mutationUuid)}
          disabled={isResolving}
        />
      </div>

      {isResolving && (
        <div className="flex items-center justify-center gap-2 text-sm text-content-secondary">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>Resolving...</span>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Multi-Device Conflict (3+ options)
// ============================================================================

function MultiDeviceConflict({ conflict, onResolve, isResolving }: SingleConflictProps) {
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-amber-50 px-4 py-3 dark:bg-amber-500/10">
        <p className="text-sm text-amber-700 dark:text-amber-400">
          {getConflictDescription(conflict)}
        </p>
      </div>

      {conflict.field && (
        <div className="text-center">
          <span className="rounded-lg bg-surface-tertiary px-3 py-1 text-sm font-medium text-content">
            {conflict.field}
          </span>
        </div>
      )}

      <div className="space-y-2">
        {conflict.options.map((option, index) => (
          <button
            key={option.mutationUuid}
            onClick={() => setSelected(option.mutationUuid)}
            className={`w-full rounded-xl border-2 p-4 text-left transition-all ${
              selected === option.mutationUuid
                ? 'border-primary bg-primary/5'
                : 'border-border-default hover:border-primary/50'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-content">
                  {option.deviceName || `Device ${index + 1}`}
                </p>
                <p className="mt-1 text-lg">{formatOptionValue(option.value)}</p>
                <p className="mt-1 text-xs text-content-tertiary">
                  {getRelativeTime(option.timestamp)}
                </p>
              </div>
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                  selected === option.mutationUuid
                    ? 'border-primary bg-primary text-white'
                    : 'border-border-default'
                }`}
              >
                {selected === option.mutationUuid && '✓'}
              </div>
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={() => selected && onResolve(conflict.id, selected)}
        disabled={!selected || isResolving}
        className="w-full rounded-xl bg-primary py-3 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isResolving ? 'Resolving...' : 'Use Selected Value'}
      </button>
    </div>
  )
}

// ============================================================================
// Conflict Option Card
// ============================================================================

interface ConflictOptionCardProps {
  option: ConflictOption
  label: string
  onSelect: () => void
  disabled?: boolean
  selected?: boolean
}

function ConflictOptionCard({
  option,
  label,
  onSelect,
  disabled,
  selected,
}: ConflictOptionCardProps) {
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={`rounded-xl border-2 p-4 text-left transition-all ${
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border-default hover:border-primary hover:bg-primary/5'
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <p className="text-xs font-medium text-content-tertiary">{label}</p>
      <p className="mt-1 text-sm font-medium text-content">
        {option.deviceName || option.deviceId.slice(0, 8)}
      </p>
      <p className="mt-2 break-words text-lg">{formatOptionValue(option.value)}</p>
      <p className="mt-2 text-xs text-content-tertiary">{getRelativeTime(option.timestamp)}</p>
    </button>
  )
}

// ============================================================================
// Bulk Conflict Item
// ============================================================================

interface BulkConflictItemProps {
  conflict: StoredConflict
  selectedWinner?: string
  onSelect: (winnerMutationUuid: string) => void
}

function BulkConflictItem({ conflict, selectedWinner, onSelect }: BulkConflictItemProps) {
  return (
    <div className="rounded-xl border border-border-default p-4">
      <p className="text-sm font-medium text-content">{getConflictDescription(conflict)}</p>
      {conflict.field && (
        <p className="mt-1 text-xs text-content-tertiary">Field: {conflict.field}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {conflict.options.map((option, index) => (
          <button
            key={option.mutationUuid}
            onClick={() => onSelect(option.mutationUuid)}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              selectedWinner === option.mutationUuid
                ? 'bg-primary text-white'
                : 'bg-surface-tertiary text-content hover:bg-surface-hover'
            }`}
          >
            {formatOptionValue(option.value)}
            <span className="ml-1 text-xs opacity-70">
              ({option.deviceName || `Device ${index + 1}`})
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// Conflict Badge (for notifications)
// ============================================================================

interface ConflictBadgeProps {
  count: number
  onClick?: () => void
}

export function ConflictBadge({ count, onClick }: ConflictBadgeProps) {
  if (count === 0) return null

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:hover:bg-amber-500/30"
    >
      <span>⚠️</span>
      <span>
        {count} conflict{count !== 1 ? 's' : ''}
      </span>
    </button>
  )
}

// ============================================================================
// Hook for conflict count
// ============================================================================

export function useConflictCount(): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const loadCount = async () => {
      const pending = await getPendingConflicts()
      setCount(pending.length)
    }

    loadCount()

    // Poll for updates
    const interval = setInterval(loadCount, 30000)
    return () => clearInterval(interval)
  }, [])

  return count
}
