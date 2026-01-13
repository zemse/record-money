import { useState, useRef, useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateUUID, now, updateSettings } from '../db'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import {
  sendMessage,
  parseExpenseAction,
  type Message,
  type ExpenseAction,
} from '../utils/claudeClient'
import { calculateUserBalances } from '../utils/balanceCalculator'
import type { ExpenseRecord } from '../types'
import { DEFAULT_CLAUDE_MODEL } from '../types'

interface ChatMessage extends Message {
  id: string
  timestamp: number
  action?: ExpenseAction
  actionStatus?: 'pending' | 'confirmed' | 'cancelled'
}

export function ChatPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const settings = useLiveQuery(() => db.settings.get('main'))
  const users = useLiveQuery(() => db.users.toArray())
  const records = useLiveQuery(() => db.records.toArray())
  const isOnline = useOnlineStatus()

  const hasApiKey = !!settings?.claudeApiKey
  const currentUserEmail = settings?.currentUserEmail
  const autoApply = settings?.autoApplyAiChanges ?? false

  // Calculate balances for the current user
  const userBalances = useMemo(() => {
    if (!currentUserEmail || !records) return null
    return calculateUserBalances(records, currentUserEmail)
  }, [records, currentUserEmail])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || !hasApiKey || isLoading) return

    const userMessage: ChatMessage = {
      id: generateUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    // Prepare context with expense data for queries
    const recentRecords = records
      ?.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 50) // Limit to 50 most recent records to avoid token limits
      .map((r) => ({
        uuid: r.uuid,
        title: r.title,
        amount: r.amount,
        currency: r.currency,
        category: r.category,
        date: r.date,
        paidBy: r.paidBy.map((p) => p.email),
        paidFor: r.paidFor.map((p) => p.email),
      }))

    const context = {
      currentUserEmail,
      currentDate: new Date().toISOString().split('T')[0],
      users: users?.map((u) => ({ email: u.email, alias: u.alias })) || [],
      recentExpenses: recentRecords || [],
      balances: userBalances
        ? {
            owes: userBalances.owes,
            owedBy: userBalances.owedBy,
            netBalance: userBalances.netBalance,
          }
        : null,
    }

    // Get conversation history for Claude
    const conversationHistory: Message[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }))
    conversationHistory.push({ role: 'user', content: input.trim() })

    const response = await sendMessage(
      settings!.claudeApiKey!,
      conversationHistory,
      context,
      settings?.claudeModel || DEFAULT_CLAUDE_MODEL
    )

    if (response.success) {
      const action = parseExpenseAction(response.content)
      const messageId = generateUUID()

      const assistantMessage: ChatMessage = {
        id: messageId,
        role: 'assistant',
        content: response.content,
        timestamp: Date.now(),
        action: action || undefined,
        actionStatus: action ? (autoApply ? 'confirmed' : 'pending') : undefined,
      }

      setMessages((prev) => [...prev, assistantMessage])

      // Auto-apply if enabled
      if (action && autoApply) {
        await applyExpenseAction(action)
      }
    } else {
      const errorMessage: ChatMessage = {
        id: generateUUID(),
        role: 'assistant',
        content: `Sorry, I encountered an error: ${response.error}`,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, errorMessage])
    }

    setIsLoading(false)
  }

  // Apply expense action (used by both manual confirm and auto-apply)
  const applyExpenseAction = async (action: ExpenseAction) => {
    if (action.action === 'create_expense') {
      const { data } = action

      // Resolve "me" to current user email
      const resolvePaidBy = data.paidBy.map((p) =>
        p === 'me' && currentUserEmail ? currentUserEmail : p
      )
      const resolvePaidFor = data.paidFor.map((p) =>
        p === 'me' && currentUserEmail ? currentUserEmail : p
      )

      // Create the expense record
      const record: ExpenseRecord = {
        uuid: generateUUID(),
        title: data.title,
        description: '',
        category: data.category,
        amount: data.amount,
        currency: data.currency,
        date: data.date,
        time: new Date().toTimeString().slice(0, 5),
        icon: getCategoryIcon(data.category),
        paidBy: resolvePaidBy.map((email) => ({
          email,
          share: data.amount / resolvePaidBy.length,
        })),
        paidFor: resolvePaidFor.map((email) => ({
          email,
          share: data.amount / resolvePaidFor.length,
        })),
        shareType: data.splitType,
        groupId: null,
        comments: 'Created via AI assistant',
        createdAt: now(),
        updatedAt: now(),
      }

      await db.records.add(record)

      // Add confirmation message
      const confirmMessage: ChatMessage = {
        id: generateUUID(),
        role: 'assistant',
        content: `Done! I've added "${data.title}" for ${data.currency} ${data.amount}.`,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, confirmMessage])
    } else if (action.action === 'update_expense') {
      const { data } = action

      // Find the existing record
      const existingRecord = await db.records.get(data.uuid)
      if (!existingRecord) {
        const errorMessage: ChatMessage = {
          id: generateUUID(),
          role: 'assistant',
          content: `Error: Could not find the expense to update.`,
          timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, errorMessage])
        return
      }

      // Build update object with only changed fields
      const updates: Partial<ExpenseRecord> = {
        updatedAt: now(),
      }

      if (data.title !== undefined) updates.title = data.title
      if (data.amount !== undefined) {
        updates.amount = data.amount
        // Recalculate shares if amount changed
        updates.paidBy = existingRecord.paidBy.map((p) => ({
          ...p,
          share: data.amount! / existingRecord.paidBy.length,
        }))
        updates.paidFor = existingRecord.paidFor.map((p) => ({
          ...p,
          share: data.amount! / existingRecord.paidFor.length,
        }))
      }
      if (data.currency !== undefined) updates.currency = data.currency
      if (data.category !== undefined) {
        updates.category = data.category
        updates.icon = getCategoryIcon(data.category)
      }
      if (data.date !== undefined) updates.date = data.date

      await db.records.update(data.uuid, updates)

      // Add confirmation message
      const confirmMessage: ChatMessage = {
        id: generateUUID(),
        role: 'assistant',
        content: `Done! I've updated the expense.`,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, confirmMessage])
    } else if (action.action === 'delete_expense') {
      const { data } = action

      // Find the existing record first (for confirmation message)
      const existingRecord = await db.records.get(data.uuid)
      if (!existingRecord) {
        const errorMessage: ChatMessage = {
          id: generateUUID(),
          role: 'assistant',
          content: `Error: Could not find the expense to delete.`,
          timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, errorMessage])
        return
      }

      await db.records.delete(data.uuid)

      // Add confirmation message
      const confirmMessage: ChatMessage = {
        id: generateUUID(),
        role: 'assistant',
        content: `Done! I've deleted "${existingRecord.title}".`,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, confirmMessage])
    }
  }

  const handleConfirmAction = async (messageId: string) => {
    const message = messages.find((m) => m.id === messageId)
    if (!message?.action) return

    await applyExpenseAction(message.action)

    // Update message status
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, actionStatus: 'confirmed' as const } : m))
    )
  }

  const handleCancelAction = (messageId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, actionStatus: 'cancelled' as const } : m))
    )
  }

  const getCategoryIcon = (category: string): string => {
    const icons: Record<string, string> = {
      Food: '🍽️',
      Transport: '🚗',
      Shopping: '🛍️',
      Entertainment: '🎬',
      Bills: '📄',
      Health: '💊',
      Travel: '✈️',
      Other: '💰',
    }
    return icons[category] || '💰'
  }

  // Floating button (always visible)
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        disabled={!isOnline}
        className={`fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all md:bottom-6 ${
          !isOnline
            ? 'cursor-not-allowed bg-gray-400'
            : hasApiKey
              ? 'bg-primary hover:bg-primary-hover hover:shadow-xl'
              : 'bg-amber-500 hover:bg-amber-600'
        }`}
        title={!isOnline ? 'AI requires internet' : hasApiKey ? 'AI Assistant' : 'Set up AI'}
      >
        <span className="text-2xl text-white">{hasApiKey ? '💬' : '🤖'}</span>
      </button>
    )
  }

  // Chat panel
  return (
    <div className="fixed bottom-24 right-4 z-50 flex h-[500px] w-[360px] flex-col rounded-2xl border border-border-default bg-surface shadow-2xl md:bottom-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🤖</span>
          <h3 className="font-medium text-content">AI Assistant</h3>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-content-secondary transition-colors hover:bg-surface-tertiary"
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {!hasApiKey ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="text-4xl">🔑</span>
            <p className="mt-3 font-medium text-content">API Key Required</p>
            <p className="mt-1 text-sm text-content-secondary">
              Add your Claude API key in Settings to enable AI features.
            </p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="text-4xl">💬</span>
            <p className="mt-3 font-medium text-content">Ask me anything!</p>
            <p className="mt-1 text-sm text-content-secondary">
              Try: "Add lunch at Starbucks, ₹450"
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                    message.role === 'user'
                      ? 'bg-primary text-white'
                      : 'bg-surface-tertiary text-content'
                  }`}
                >
                  {message.action && message.actionStatus === 'pending' ? (
                    <div>
                      <p className="mb-2 text-sm">{message.action.confirmation}</p>
                      {message.action.action === 'create_expense' && (
                        <div className="rounded-xl bg-surface p-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">
                              {getCategoryIcon(message.action.data.category)}
                            </span>
                            <div>
                              <p className="font-medium">{message.action.data.title}</p>
                              <p className="text-sm text-content-secondary">
                                {message.action.data.currency} {message.action.data.amount} •{' '}
                                {message.action.data.date}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      {message.action.action === 'update_expense' && (
                        <div className="rounded-xl bg-surface p-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">✏️</span>
                            <div>
                              <p className="font-medium">Update Expense</p>
                              <p className="text-sm text-content-secondary">
                                {message.action.data.title && `Title: ${message.action.data.title}`}
                                {message.action.data.amount &&
                                  ` • Amount: ${message.action.data.amount}`}
                                {message.action.data.category &&
                                  ` • ${message.action.data.category}`}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      {message.action.action === 'delete_expense' && (
                        <div className="rounded-xl bg-red-50 p-3 dark:bg-red-900/20">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">🗑️</span>
                            <div>
                              <p className="font-medium text-red-600 dark:text-red-400">
                                Delete Expense
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => handleConfirmAction(message.id)}
                          className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium text-white ${
                            message.action.action === 'delete_expense'
                              ? 'bg-red-500 hover:bg-red-600'
                              : 'bg-green-500 hover:bg-green-600'
                          }`}
                        >
                          {message.action.action === 'delete_expense' ? 'Delete' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => handleCancelAction(message.id)}
                          className="flex-1 rounded-lg bg-surface-tertiary px-3 py-1.5 text-sm font-medium text-content-secondary hover:bg-surface-hover"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : message.action && message.actionStatus === 'confirmed' ? (
                    <div>
                      <p className="mb-2 text-sm line-through opacity-70">
                        {message.action.confirmation}
                      </p>
                      <p className="text-sm text-green-600 dark:text-green-400">
                        ✓{' '}
                        {message.action.action === 'create_expense'
                          ? 'Added'
                          : message.action.action === 'update_expense'
                            ? 'Updated'
                            : 'Deleted'}
                      </p>
                    </div>
                  ) : message.action && message.actionStatus === 'cancelled' ? (
                    <div>
                      <p className="mb-2 text-sm line-through opacity-70">
                        {message.action.confirmation}
                      </p>
                      <p className="text-sm text-content-tertiary">Cancelled</p>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-surface-tertiary px-4 py-2.5">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-content-tertiary"></span>
                    <span
                      className="h-2 w-2 animate-bounce rounded-full bg-content-tertiary"
                      style={{ animationDelay: '0.1s' }}
                    ></span>
                    <span
                      className="h-2 w-2 animate-bounce rounded-full bg-content-tertiary"
                      style={{ animationDelay: '0.2s' }}
                    ></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      {hasApiKey && (
        <div className="border-t border-border-default p-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Type a message..."
              disabled={isLoading}
              className="flex-1 rounded-xl border border-border-default bg-surface px-4 py-2.5 text-content transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="rounded-xl bg-primary px-4 py-2.5 text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              ➤
            </button>
          </div>
          <label className="mt-2 flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={autoApply}
              onChange={(e) => updateSettings({ autoApplyAiChanges: e.target.checked })}
              className="h-4 w-4 rounded border-border-default text-primary focus:ring-primary"
            />
            <span className="text-xs text-content-secondary">Auto-apply changes</span>
          </label>
        </div>
      )}
    </div>
  )
}
