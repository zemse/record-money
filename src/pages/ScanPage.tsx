import { useState, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateUUID, now } from '../db'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import {
  parseReceiptImage,
  parseBankStatement,
  fileToBase64,
  getMediaType,
  type ParsedReceipt,
} from '../utils/claudeClient'
import { generateSourceHash } from '../utils/deduplication'
import type { ExpenseRecord, ShareType } from '../types'
import { DEFAULT_CLAUDE_MODEL } from '../types'

type ScanMode = 'receipt' | 'statement'

interface PendingExpense {
  id: string
  data: Omit<ExpenseRecord, 'uuid' | 'createdAt' | 'updatedAt'>
  selected: boolean
  isDuplicate: boolean
}

export function ScanPage() {
  const [mode, setMode] = useState<ScanMode>('receipt')
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  // Receipt parsing state
  const [parsedReceipt, setParsedReceipt] = useState<ParsedReceipt | null>(null)

  // Bank statement state
  const [pendingExpenses, setPendingExpenses] = useState<PendingExpense[]>([])
  const [statementInfo, setStatementInfo] = useState<{
    bankName?: string
    accountNumber?: string
    statementPeriod?: string
  } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const settings = useLiveQuery(() => db.settings.get('main'))
  const existingRecords = useLiveQuery(() => db.records.toArray())
  const isOnline = useOnlineStatus()

  const hasApiKey = !!settings?.claudeApiKey
  const currentUserEmail = settings?.currentUserEmail

  const getCategoryIcon = (category: string): string => {
    const icons: Record<string, string> = {
      Food: '🍽️',
      Transport: '🚗',
      Shopping: '🛍️',
      Entertainment: '🎬',
      Bills: '📄',
      Health: '💊',
      Travel: '✈️',
      Income: '💰',
      Other: '💰',
    }
    return icons[category] || '💰'
  }

  const handleFileSelect = async (file: File) => {
    setError(null)
    setParsedReceipt(null)
    setPendingExpenses([])
    setStatementInfo(null)

    // Validate file type
    const mediaType = getMediaType(file)
    if (!mediaType) {
      setError('Please select a valid image file (JPEG, PNG, WebP, or GIF)')
      return
    }

    // Check file size (max 20MB for Claude)
    if (file.size > 20 * 1024 * 1024) {
      setError('Image file is too large. Maximum size is 20MB.')
      return
    }

    // Show preview
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(file)

    setIsProcessing(true)

    try {
      const base64 = await fileToBase64(file)

      if (mode === 'receipt') {
        const result = await parseReceiptImage(
          settings!.claudeApiKey!,
          base64,
          mediaType,
          settings?.claudeModel || DEFAULT_CLAUDE_MODEL
        )

        if (result.success) {
          setParsedReceipt(result.data)
        } else {
          setError(result.error)
        }
      } else {
        const result = await parseBankStatement(
          settings!.claudeApiKey!,
          base64,
          mediaType,
          settings?.claudeModel || DEFAULT_CLAUDE_MODEL
        )

        if (result.success) {
          setStatementInfo(result.data.accountInfo || null)

          // Convert transactions to pending expenses and check for duplicates
          const pending: PendingExpense[] = result.data.transactions.map((txn, index) => {
            const sourceHash = generateSourceHash(
              file.name,
              txn.date,
              Math.abs(txn.amount),
              txn.title
            )

            // Check for duplicates
            const isDuplicate = existingRecords?.some(
              (r) =>
                r.sourceHash === sourceHash ||
                (r.amount === Math.abs(txn.amount) &&
                  r.date === txn.date &&
                  r.title.toLowerCase() === txn.title.toLowerCase())
            )

            return {
              id: `pending-${index}`,
              data: {
                title: txn.title,
                description: txn.reference ? `Ref: ${txn.reference}` : '',
                category: txn.category,
                amount: Math.abs(txn.amount),
                currency: txn.currency,
                date: txn.date,
                time: '12:00',
                icon: getCategoryIcon(txn.category),
                paidBy: currentUserEmail
                  ? [{ email: currentUserEmail, share: Math.abs(txn.amount) }]
                  : [],
                paidFor: currentUserEmail
                  ? [{ email: currentUserEmail, share: Math.abs(txn.amount) }]
                  : [],
                shareType: 'equal' as ShareType,
                groupId: null,
                comments: `Imported from bank statement${txn.type === 'income' ? ' (Income)' : ''}`,
                sourceHash,
              },
              selected: !isDuplicate,
              isDuplicate: isDuplicate || false,
            }
          })

          setPendingExpenses(pending)
        } else {
          setError(result.error)
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to process image')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSaveReceipt = async () => {
    if (!parsedReceipt || !currentUserEmail) return

    const record: ExpenseRecord = {
      uuid: generateUUID(),
      title: parsedReceipt.title,
      description: parsedReceipt.merchant || '',
      category: parsedReceipt.category,
      amount: parsedReceipt.amount,
      currency: parsedReceipt.currency,
      date: parsedReceipt.date,
      time: new Date().toTimeString().slice(0, 5),
      icon: getCategoryIcon(parsedReceipt.category),
      paidBy: [{ email: currentUserEmail, share: parsedReceipt.amount }],
      paidFor: [{ email: currentUserEmail, share: parsedReceipt.amount }],
      shareType: 'equal',
      groupId: null,
      comments: parsedReceipt.lineItems?.join('\n') || 'Scanned from receipt',
      createdAt: now(),
      updatedAt: now(),
    }

    await db.records.add(record)

    // Reset state
    setParsedReceipt(null)
    setImagePreview(null)
    setError(null)
  }

  const handleImportSelected = async () => {
    const toImport = pendingExpenses.filter((e) => e.selected && !e.isDuplicate)

    for (const expense of toImport) {
      const record: ExpenseRecord = {
        uuid: generateUUID(),
        ...expense.data,
        createdAt: now(),
        updatedAt: now(),
      }
      await db.records.add(record)
    }

    // Reset state
    setPendingExpenses([])
    setStatementInfo(null)
    setImagePreview(null)
    setError(null)
  }

  const toggleExpenseSelection = (id: string) => {
    setPendingExpenses((prev) =>
      prev.map((e) => (e.id === id && !e.isDuplicate ? { ...e, selected: !e.selected } : e))
    )
  }

  const selectAll = () => {
    setPendingExpenses((prev) => prev.map((e) => (e.isDuplicate ? e : { ...e, selected: true })))
  }

  const deselectAll = () => {
    setPendingExpenses((prev) => prev.map((e) => ({ ...e, selected: false })))
  }

  if (!hasApiKey) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-content">Scan</h1>
          <p className="text-sm text-content-secondary">Scan receipts and bank statements</p>
        </div>
        <div className="rounded-2xl border border-border-default bg-surface p-8 text-center">
          <span className="text-4xl">🔑</span>
          <p className="mt-3 font-medium text-content">API Key Required</p>
          <p className="mt-1 text-sm text-content-secondary">
            Add your Claude API key in Settings to enable AI scanning features.
          </p>
        </div>
      </div>
    )
  }

  if (!currentUserEmail) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-content">Scan</h1>
          <p className="text-sm text-content-secondary">Scan receipts and bank statements</p>
        </div>
        <div className="rounded-2xl border border-border-default bg-surface p-8 text-center">
          <span className="text-4xl">👤</span>
          <p className="mt-3 font-medium text-content">Set Up Your Identity</p>
          <p className="mt-1 text-sm text-content-secondary">
            Go to Settings and set yourself as "Me" to use scanning features.
          </p>
        </div>
      </div>
    )
  }

  if (!isOnline) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-content">Scan</h1>
          <p className="text-sm text-content-secondary">Scan receipts and bank statements</p>
        </div>
        <div className="rounded-2xl border border-border-default bg-surface p-8 text-center">
          <span className="text-4xl">📡</span>
          <p className="mt-3 font-medium text-content">Internet Required</p>
          <p className="mt-1 text-sm text-content-secondary">
            Scanning requires an internet connection to process images.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-content">Scan</h1>
        <p className="text-sm text-content-secondary">Scan receipts and bank statements</p>
      </div>

      {/* Mode Selector */}
      <div className="flex gap-2">
        <button
          onClick={() => {
            setMode('receipt')
            setParsedReceipt(null)
            setPendingExpenses([])
            setStatementInfo(null)
            setImagePreview(null)
            setError(null)
          }}
          className={`flex-1 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
            mode === 'receipt'
              ? 'bg-primary text-white'
              : 'bg-surface-tertiary text-content-secondary hover:bg-surface-hover'
          }`}
        >
          🧾 Receipt
        </button>
        <button
          onClick={() => {
            setMode('statement')
            setParsedReceipt(null)
            setPendingExpenses([])
            setStatementInfo(null)
            setImagePreview(null)
            setError(null)
          }}
          className={`flex-1 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
            mode === 'statement'
              ? 'bg-primary text-white'
              : 'bg-surface-tertiary text-content-secondary hover:bg-surface-hover'
          }`}
        >
          🏦 Bank Statement
        </button>
      </div>

      {/* Upload Area */}
      {!parsedReceipt && pendingExpenses.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-border-default bg-surface p-8">
          {isProcessing ? (
            <div className="text-center">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="mt-4 font-medium text-content">
                {mode === 'receipt' ? 'Analyzing receipt...' : 'Extracting transactions...'}
              </p>
              <p className="mt-1 text-sm text-content-secondary">This may take a few seconds</p>
            </div>
          ) : (
            <div className="text-center">
              <span className="text-5xl">{mode === 'receipt' ? '🧾' : '🏦'}</span>
              <p className="mt-4 font-medium text-content">
                {mode === 'receipt' ? 'Upload a receipt image' : 'Upload a bank statement image'}
              </p>
              <p className="mt-1 text-sm text-content-secondary">
                Supports JPEG, PNG, WebP, and GIF (max 20MB)
              </p>

              <div className="mt-6 flex justify-center gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
                >
                  📁 Choose File
                </button>
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="rounded-xl bg-surface-tertiary px-6 py-2.5 text-sm font-medium text-content transition-colors hover:bg-surface-hover"
                >
                  📷 Take Photo
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                className="hidden"
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                capture="environment"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                className="hidden"
              />
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 dark:bg-red-500/10">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={() => {
              setError(null)
              setImagePreview(null)
            }}
            className="mt-2 text-sm font-medium text-red-600 hover:text-red-700 dark:text-red-400"
          >
            Try again
          </button>
        </div>
      )}

      {/* Image Preview (only show during processing or error) */}
      {imagePreview && isProcessing && (
        <div className="overflow-hidden rounded-xl border border-border-default">
          <img src={imagePreview} alt="Preview" className="max-h-64 w-full object-contain" />
        </div>
      )}

      {/* Receipt Result */}
      {parsedReceipt && (
        <div className="rounded-2xl border border-border-default bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-content">Extracted Expense</h2>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                parsedReceipt.confidence === 'high'
                  ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                  : parsedReceipt.confidence === 'medium'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
              }`}
            >
              {parsedReceipt.confidence} confidence
            </span>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{getCategoryIcon(parsedReceipt.category)}</span>
              <div>
                <p className="font-medium text-content">{parsedReceipt.title}</p>
                {parsedReceipt.merchant && (
                  <p className="text-sm text-content-secondary">{parsedReceipt.merchant}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-content-tertiary">Amount</p>
                <p className="font-medium text-content">
                  {parsedReceipt.currency} {parsedReceipt.amount.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-content-tertiary">Date</p>
                <p className="font-medium text-content">{parsedReceipt.date}</p>
              </div>
              <div>
                <p className="text-content-tertiary">Category</p>
                <p className="font-medium text-content">{parsedReceipt.category}</p>
              </div>
            </div>

            {parsedReceipt.lineItems && parsedReceipt.lineItems.length > 0 && (
              <div>
                <p className="text-sm text-content-tertiary">Line Items</p>
                <ul className="mt-1 space-y-0.5 text-sm text-content-secondary">
                  {parsedReceipt.lineItems.map((item, i) => (
                    <li key={i}>• {item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={handleSaveReceipt}
              className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
            >
              Save Expense
            </button>
            <button
              onClick={() => {
                setParsedReceipt(null)
                setImagePreview(null)
              }}
              className="rounded-xl bg-surface-tertiary px-4 py-2.5 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Bank Statement Results */}
      {pendingExpenses.length > 0 && (
        <div className="rounded-2xl border border-border-default bg-surface p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-medium text-content">Extracted Transactions</h2>
              {statementInfo && (
                <p className="text-sm text-content-secondary">
                  {statementInfo.bankName}
                  {statementInfo.accountNumber && ` •••• ${statementInfo.accountNumber}`}
                  {statementInfo.statementPeriod && ` • ${statementInfo.statementPeriod}`}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-xs text-primary hover:text-primary-hover">
                Select All
              </button>
              <span className="text-content-tertiary">|</span>
              <button
                onClick={deselectAll}
                className="text-xs text-primary hover:text-primary-hover"
              >
                Deselect All
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {pendingExpenses.map((expense) => (
              <div
                key={expense.id}
                className={`flex items-center gap-3 rounded-xl p-3 transition-colors ${
                  expense.isDuplicate
                    ? 'bg-surface-tertiary opacity-50'
                    : expense.selected
                      ? 'bg-primary/10'
                      : 'bg-surface-tertiary'
                }`}
              >
                <input
                  type="checkbox"
                  checked={expense.selected}
                  disabled={expense.isDuplicate}
                  onChange={() => toggleExpenseSelection(expense.id)}
                  className="h-4 w-4 rounded border-border-default text-primary focus:ring-primary disabled:cursor-not-allowed"
                />
                <span className="text-xl">{expense.data.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-content">{expense.data.title}</p>
                  <p className="text-sm text-content-secondary">
                    {expense.data.date} • {expense.data.category}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-content">
                    {expense.data.currency} {expense.data.amount.toLocaleString()}
                  </p>
                  {expense.isDuplicate && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">Duplicate</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-content-secondary">
              {pendingExpenses.filter((e) => e.selected && !e.isDuplicate).length} of{' '}
              {pendingExpenses.filter((e) => !e.isDuplicate).length} selected
              {pendingExpenses.some((e) => e.isDuplicate) && (
                <span className="ml-2 text-amber-600 dark:text-amber-400">
                  ({pendingExpenses.filter((e) => e.isDuplicate).length} duplicates skipped)
                </span>
              )}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setPendingExpenses([])
                  setStatementInfo(null)
                  setImagePreview(null)
                }}
                className="rounded-xl bg-surface-tertiary px-4 py-2.5 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                onClick={handleImportSelected}
                disabled={!pendingExpenses.some((e) => e.selected && !e.isDuplicate)}
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                Import Selected
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
