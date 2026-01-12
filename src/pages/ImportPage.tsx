import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, now } from '../db'
import type { ExpenseRecord } from '../types'
import {
  parseImportUrl,
  parseFileContent,
  readFileAsText,
  type FilePayload,
  type UrlPayload,
} from '../utils/dataTransport'
import {
  analyzeImport,
  regenerateUuid,
  mergeRecords,
  type ImportAnalysis,
  type DuplicateMatch,
} from '../utils/deduplication'

type ImportSource = 'url' | 'file'

interface ResolvedConflict {
  uuid: string
  action: 'merge' | 'keep-new' | 'skip'
  preferIncoming?: boolean
}

export function ImportPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // State
  const [importSource, setImportSource] = useState<ImportSource | null>(null)
  const [payload, setPayload] = useState<UrlPayload | FilePayload | null>(null)
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null)
  const [error, setError] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [importComplete, setImportComplete] = useState(false)

  // Conflict resolution
  const [resolvedConflicts, setResolvedConflicts] = useState<Map<string, ResolvedConflict>>(
    new Map()
  )
  const [showConflictDetails, setShowConflictDetails] = useState<string | null>(null)

  // Get existing data for analysis
  const existingRecords = useLiveQuery(() => db.records.toArray())

  // Check for URL data on mount
  useEffect(() => {
    const data = searchParams.get('data')
    if (data) {
      setImportSource('url')
      const result = parseImportUrl(data)
      if (result.success) {
        setPayload(result.payload)
      } else {
        setError(result.error)
      }
    }
  }, [searchParams])

  // Analyze payload when it changes
  useEffect(() => {
    if (payload && existingRecords) {
      const importAnalysis = analyzeImport(payload.records, existingRecords)
      setAnalysis(importAnalysis)
    }
  }, [payload, existingRecords])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError('')
    setImportSource('file')

    try {
      const content = await readFileAsText(file)
      const result = parseFileContent(content)
      if (result.success) {
        setPayload(result.payload)
      } else {
        setError(result.error)
      }
    } catch {
      setError('Failed to read file')
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) return

    setError('')
    setImportSource('file')

    try {
      const content = await readFileAsText(file)
      const result = parseFileContent(content)
      if (result.success) {
        setPayload(result.payload)
      } else {
        setError(result.error)
      }
    } catch {
      setError('Failed to read file')
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const resolveConflict = (
    uuid: string,
    action: ResolvedConflict['action'],
    preferIncoming?: boolean
  ) => {
    setResolvedConflicts(new Map(resolvedConflicts.set(uuid, { uuid, action, preferIncoming })))
  }

  const handleImport = async () => {
    if (!payload || !analysis) return

    setIsImporting(true)

    try {
      const recordsToAdd: ExpenseRecord[] = []
      const recordsToUpdate: ExpenseRecord[] = []

      // Handle new records
      for (const record of analysis.newRecords) {
        recordsToAdd.push({
          ...record,
          createdAt: record.createdAt || now(),
          updatedAt: now(),
        })
      }

      // Handle UUID conflicts based on resolution
      for (const conflict of analysis.uuidConflicts) {
        const resolution = resolvedConflicts.get(conflict.incomingRecord.uuid)
        if (!resolution || resolution.action === 'skip') continue

        if (resolution.action === 'merge') {
          const merged = mergeRecords(
            conflict.existingRecord,
            conflict.incomingRecord,
            resolution.preferIncoming ?? true
          )
          recordsToUpdate.push(merged)
        } else if (resolution.action === 'keep-new') {
          const newRecord = regenerateUuid(conflict.incomingRecord)
          recordsToAdd.push(newRecord)
        }
      }

      // Handle exact matches based on resolution
      for (const match of analysis.exactMatches) {
        const resolution = resolvedConflicts.get(match.incomingRecord.uuid)
        if (!resolution || resolution.action === 'skip') continue

        if (resolution.action === 'merge') {
          const merged = mergeRecords(
            match.existingRecord,
            match.incomingRecord,
            resolution.preferIncoming ?? true
          )
          recordsToUpdate.push(merged)
        } else if (resolution.action === 'keep-new') {
          const newRecord = regenerateUuid(match.incomingRecord)
          recordsToAdd.push(newRecord)
        }
      }

      // Import users (add new ones only)
      const existingUsers = await db.users.toArray()
      const existingEmails = new Set(existingUsers.map((u) => u.email))

      for (const user of payload.users) {
        if (!existingEmails.has(user.email)) {
          await db.users.add(user)
        }
      }

      // Import groups if present (file import)
      if ('groups' in payload && payload.groups) {
        const existingGroups = await db.groups.toArray()
        const existingGroupIds = new Set(existingGroups.map((g) => g.uuid))

        for (const group of payload.groups) {
          if (!existingGroupIds.has(group.uuid)) {
            await db.groups.add(group)
          }
        }
      }

      // Add new records
      if (recordsToAdd.length > 0) {
        await db.records.bulkAdd(recordsToAdd)
      }

      // Update existing records
      for (const record of recordsToUpdate) {
        const { uuid, ...updates } = record
        await db.records.update(uuid, updates)
      }

      setImportComplete(true)
    } catch (e) {
      setError(`Import failed: ${e instanceof Error ? e.message : 'Unknown error'}`)
    } finally {
      setIsImporting(false)
    }
  }

  const resetImport = () => {
    setPayload(null)
    setAnalysis(null)
    setError('')
    setImportComplete(false)
    setResolvedConflicts(new Map())
    setImportSource(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    // Clear URL params
    navigate('/import', { replace: true })
  }

  // Calculate how many conflicts are resolved
  const totalConflicts =
    (analysis?.uuidConflicts.length || 0) + (analysis?.exactMatches.length || 0)
  const resolvedCount = resolvedConflicts.size
  const canImport = analysis && (totalConflicts === 0 || resolvedCount === totalConflicts)

  // If import is complete, show success
  if (importComplete) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-content">Import</h1>
          <p className="text-sm text-content-secondary">Import records from URL or file</p>
        </div>

        <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center dark:border-green-500/30 dark:bg-green-500/10">
          <p className="text-4xl">✓</p>
          <h2 className="mt-4 text-lg font-medium text-green-700 dark:text-green-400">
            Import Complete
          </h2>
          <p className="mt-2 text-sm text-green-600 dark:text-green-500">
            {analysis?.newRecords.length || 0} new records imported
            {resolvedCount > 0 && `, ${resolvedCount} conflicts resolved`}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={resetImport}
              className="rounded-xl bg-surface px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover"
            >
              Import More
            </button>
            <button
              onClick={() => navigate('/records')}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
            >
              View Records
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-content">Import</h1>
        <p className="text-sm text-content-secondary">Import records from URL or file</p>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          {error}
          <button onClick={resetImport} className="ml-4 underline hover:no-underline">
            Try again
          </button>
        </div>
      )}

      {/* File picker (show when no payload) */}
      {!payload && !error && (
        <div
          className="cursor-pointer rounded-2xl border-2 border-dashed border-border-default bg-surface p-12 text-center transition-colors hover:border-primary hover:bg-primary-light/50"
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <p className="text-4xl">📁</p>
          <h2 className="mt-4 text-lg font-medium text-content">Drop a .recordmoney file here</h2>
          <p className="mt-2 text-sm text-content-secondary">or click to browse</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".recordmoney,.json"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      )}

      {/* Import Preview */}
      {payload && analysis && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="rounded-2xl border border-border-default bg-surface p-5">
            <h2 className="font-medium text-content">Import Preview</h2>
            <p className="mt-1 text-sm text-content-secondary">
              {importSource === 'url' ? 'Importing from shared link' : 'Importing from file'}
            </p>

            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-green-500">✓</span>
                <span className="text-content">
                  {analysis.newRecords.length} new record{analysis.newRecords.length !== 1 && 's'}
                </span>
              </div>

              {analysis.uuidConflicts.length > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-amber-500">⚠</span>
                  <span className="text-content">
                    {analysis.uuidConflicts.length} UUID conflict
                    {analysis.uuidConflicts.length !== 1 && 's'}
                  </span>
                </div>
              )}

              {analysis.exactMatches.length > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-amber-500">⚠</span>
                  <span className="text-content">
                    {analysis.exactMatches.length} possible duplicate
                    {analysis.exactMatches.length !== 1 && 's'}
                  </span>
                </div>
              )}

              {analysis.sourceHashMatches.length > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400">⊘</span>
                  <span className="text-content-secondary">
                    {analysis.sourceHashMatches.length} skipped (bank statement duplicate
                    {analysis.sourceHashMatches.length !== 1 && 's'})
                  </span>
                </div>
              )}
            </div>

            <div className="mt-4 text-sm text-content-secondary">
              {payload.users.length} user{payload.users.length !== 1 && 's'} included
              {'groups' in payload && payload.groups && (
                <>
                  , {payload.groups.length} group{payload.groups.length !== 1 && 's'}
                </>
              )}
            </div>
          </div>

          {/* UUID Conflicts */}
          {analysis.uuidConflicts.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-500/30 dark:bg-amber-500/10">
              <h3 className="font-medium text-amber-700 dark:text-amber-400">UUID Conflicts</h3>
              <p className="mt-1 text-sm text-amber-600 dark:text-amber-500">
                These records already exist in your database. Choose how to handle each:
              </p>

              <div className="mt-4 space-y-3">
                {analysis.uuidConflicts.map((conflict) => (
                  <ConflictCard
                    key={conflict.incomingRecord.uuid}
                    conflict={conflict}
                    type="uuid"
                    resolution={resolvedConflicts.get(conflict.incomingRecord.uuid)}
                    showDetails={showConflictDetails === conflict.incomingRecord.uuid}
                    onToggleDetails={() =>
                      setShowConflictDetails(
                        showConflictDetails === conflict.incomingRecord.uuid
                          ? null
                          : conflict.incomingRecord.uuid
                      )
                    }
                    onResolve={(action, preferIncoming) =>
                      resolveConflict(conflict.incomingRecord.uuid, action, preferIncoming)
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* Exact Matches */}
          {analysis.exactMatches.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-500/30 dark:bg-amber-500/10">
              <h3 className="font-medium text-amber-700 dark:text-amber-400">
                Possible Duplicates
              </h3>
              <p className="mt-1 text-sm text-amber-600 dark:text-amber-500">
                These records have the same amount, date, and participants as existing records:
              </p>

              <div className="mt-4 space-y-3">
                {analysis.exactMatches.map((match) => (
                  <ConflictCard
                    key={match.incomingRecord.uuid}
                    conflict={match}
                    type="exact"
                    resolution={resolvedConflicts.get(match.incomingRecord.uuid)}
                    showDetails={showConflictDetails === match.incomingRecord.uuid}
                    onToggleDetails={() =>
                      setShowConflictDetails(
                        showConflictDetails === match.incomingRecord.uuid
                          ? null
                          : match.incomingRecord.uuid
                      )
                    }
                    onResolve={(action, preferIncoming) =>
                      resolveConflict(match.incomingRecord.uuid, action, preferIncoming)
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={resetImport}
              className="flex-1 rounded-xl border border-border-default bg-surface px-4 py-2.5 font-medium text-content transition-colors hover:bg-surface-tertiary"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={!canImport || isImporting}
              className="flex-1 rounded-xl bg-primary px-4 py-2.5 font-medium text-white transition-all hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isImporting ? 'Importing...' : `Import ${analysis.newRecords.length} Records`}
            </button>
          </div>

          {!canImport && totalConflicts > 0 && (
            <p className="text-center text-sm text-amber-600 dark:text-amber-400">
              Please resolve all {totalConflicts - resolvedCount} remaining conflict
              {totalConflicts - resolvedCount !== 1 && 's'} before importing
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// Conflict card component
interface ConflictCardProps {
  conflict: DuplicateMatch
  type: 'uuid' | 'exact'
  resolution?: ResolvedConflict
  showDetails: boolean
  onToggleDetails: () => void
  onResolve: (action: ResolvedConflict['action'], preferIncoming?: boolean) => void
}

function ConflictCard({
  conflict,
  type,
  resolution,
  showDetails,
  onToggleDetails,
  onResolve,
}: ConflictCardProps) {
  const { incomingRecord, existingRecord } = conflict

  return (
    <div className="rounded-xl bg-white p-4 dark:bg-surface">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium text-content">
            {incomingRecord.icon} {incomingRecord.title}
          </p>
          <p className="text-sm text-content-secondary">
            {incomingRecord.currency} {incomingRecord.amount.toLocaleString()} •{' '}
            {incomingRecord.date}
          </p>
        </div>
        <button onClick={onToggleDetails} className="text-sm text-primary hover:underline">
          {showDetails ? 'Hide details' : 'Compare'}
        </button>
      </div>

      {showDetails && (
        <div className="mt-4 grid gap-4 border-t border-border-default pt-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-content-secondary">
              Incoming
            </p>
            <RecordDetails record={incomingRecord} />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-content-secondary">
              Existing
            </p>
            <RecordDetails record={existingRecord} />
          </div>
        </div>
      )}

      {/* Resolution buttons */}
      <div className="mt-3 flex flex-wrap gap-2 border-t border-border-default pt-3">
        {type === 'uuid' ? (
          <>
            <button
              onClick={() => onResolve('merge', true)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                resolution?.action === 'merge' && resolution.preferIncoming
                  ? 'bg-primary text-white'
                  : 'bg-surface-tertiary text-content-secondary hover:bg-surface-hover'
              }`}
            >
              Use Incoming
            </button>
            <button
              onClick={() => onResolve('merge', false)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                resolution?.action === 'merge' && !resolution.preferIncoming
                  ? 'bg-primary text-white'
                  : 'bg-surface-tertiary text-content-secondary hover:bg-surface-hover'
              }`}
            >
              Keep Existing
            </button>
            <button
              onClick={() => onResolve('keep-new')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                resolution?.action === 'keep-new'
                  ? 'bg-primary text-white'
                  : 'bg-surface-tertiary text-content-secondary hover:bg-surface-hover'
              }`}
            >
              Keep Both
            </button>
            <button
              onClick={() => onResolve('skip')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                resolution?.action === 'skip'
                  ? 'bg-red-500 text-white'
                  : 'text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
              }`}
            >
              Skip
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => onResolve('skip')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                resolution?.action === 'skip'
                  ? 'bg-primary text-white'
                  : 'bg-surface-tertiary text-content-secondary hover:bg-surface-hover'
              }`}
            >
              It's a Duplicate
            </button>
            <button
              onClick={() => onResolve('keep-new')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                resolution?.action === 'keep-new'
                  ? 'bg-primary text-white'
                  : 'bg-surface-tertiary text-content-secondary hover:bg-surface-hover'
              }`}
            >
              Keep Both
            </button>
          </>
        )}
      </div>

      {resolution && (
        <p className="mt-2 text-xs text-green-600 dark:text-green-400">
          ✓ Resolved:{' '}
          {resolution.action === 'skip'
            ? 'Will skip'
            : resolution.action === 'keep-new'
              ? 'Will keep both'
              : resolution.preferIncoming
                ? 'Will use incoming'
                : 'Will keep existing'}
        </p>
      )}
    </div>
  )
}

// Record details component for comparison
function RecordDetails({ record }: { record: ExpenseRecord }) {
  return (
    <div className="space-y-1 text-sm">
      <p>
        <span className="text-content-secondary">Title:</span>{' '}
        <span className="text-content">{record.title}</span>
      </p>
      <p>
        <span className="text-content-secondary">Amount:</span>{' '}
        <span className="text-content">
          {record.currency} {record.amount.toLocaleString()}
        </span>
      </p>
      <p>
        <span className="text-content-secondary">Date:</span>{' '}
        <span className="text-content">{record.date}</span>
      </p>
      <p>
        <span className="text-content-secondary">Category:</span>{' '}
        <span className="text-content">
          {record.icon} {record.category}
        </span>
      </p>
      <p>
        <span className="text-content-secondary">Paid by:</span>{' '}
        <span className="text-content">{record.paidBy.map((p) => p.email).join(', ')}</span>
      </p>
      <p>
        <span className="text-content-secondary">Paid for:</span>{' '}
        <span className="text-content">{record.paidFor.map((p) => p.email).join(', ')}</span>
      </p>
      {record.description && (
        <p>
          <span className="text-content-secondary">Description:</span>{' '}
          <span className="text-content">{record.description}</span>
        </p>
      )}
    </div>
  )
}
