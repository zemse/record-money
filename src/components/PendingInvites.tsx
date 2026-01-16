/**
 * Pending Invites Component
 *
 * Shows pending invite approvals with emoji verification
 */

import { useState, useEffect, useCallback } from 'react'
import { getAllPendingInvites, db } from '../db'
import {
  pollInviteResponse,
  approveJoinRequest,
  rejectJoinRequest,
  cancelInvite,
  getPendingInvitesToPoll,
  getRespondedInvites,
} from '../sync/groups'
import type { PendingInvite } from '../types'

interface PendingInvitesProps {
  onClose?: () => void
}

export function PendingInvites({ onClose }: PendingInvitesProps) {
  const [invites, setInvites] = useState<PendingInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState<string | null>(null)
  const [emojis, setEmojis] = useState<Record<string, string[]>>({})
  const [verifying, setVerifying] = useState<string | null>(null)

  const loadInvites = useCallback(async () => {
    try {
      const all = await getAllPendingInvites()
      // Filter to show pending and responded invites
      const relevant = all.filter((i) => i.status === 'pending' || i.status === 'responded')
      setInvites(relevant)
    } catch (err) {
      console.error('Failed to load invites:', err)
      setError('Failed to load invites')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadInvites()
  }, [loadInvites])

  // Poll for responses periodically
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      const pending = await getPendingInvitesToPoll()

      for (const invite of pending) {
        try {
          const result = await pollInviteResponse(invite.id)
          if (result.hasResponse && result.emojis) {
            setEmojis((prev) => ({ ...prev, [invite.id]: result.emojis! }))
            await loadInvites()
          }
        } catch (err) {
          console.error('Poll error:', err)
        }
      }
    }, 30000) // Poll every 30 seconds

    return () => clearInterval(pollInterval)
  }, [loadInvites])

  async function handlePollNow(inviteId: string) {
    try {
      setProcessing(inviteId)
      const result = await pollInviteResponse(inviteId)

      if (result.hasResponse) {
        if (result.emojis) {
          setEmojis((prev) => ({ ...prev, [inviteId]: result.emojis! }))
        }
        await loadInvites()
      } else {
        setError('No response yet')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check response')
    } finally {
      setProcessing(null)
    }
  }

  async function handleApprove(inviteId: string) {
    try {
      setProcessing(inviteId)
      setError(null)

      const result = await approveJoinRequest(inviteId)

      if (result.success) {
        await loadInvites()
        setVerifying(null)
      } else {
        setError(result.error || 'Failed to approve')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve')
    } finally {
      setProcessing(null)
    }
  }

  async function handleReject(inviteId: string) {
    try {
      setProcessing(inviteId)
      await rejectJoinRequest(inviteId)
      await loadInvites()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject')
    } finally {
      setProcessing(null)
    }
  }

  async function handleCancel(inviteId: string) {
    try {
      setProcessing(inviteId)
      await cancelInvite(inviteId)
      await loadInvites()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel')
    } finally {
      setProcessing(null)
    }
  }

  function formatTime(timestamp: number): string {
    const diff = Date.now() - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return new Date(timestamp).toLocaleDateString()
  }

  if (loading) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-500">Loading invites...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Pending Invites</h2>
        {onClose && (
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            Close
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-600 mt-1">
            Dismiss
          </button>
        </div>
      )}

      {invites.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No pending invites</p>
          <p className="text-sm text-gray-400 mt-1">
            When you invite someone to a group, their response will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {invites.map((invite) => (
            <div
              key={invite.id}
              className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-medium">{invite.groupName}</div>
                  <div className="text-sm text-gray-500">
                    Invited {formatTime(invite.createdAt)}
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded ${
                    invite.status === 'pending'
                      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                  }`}
                >
                  {invite.status === 'pending' ? 'Waiting' : 'Responded'}
                </span>
              </div>

              {invite.status === 'pending' && (
                <div className="mt-3">
                  <p className="text-sm text-gray-500 mb-2">
                    Share the invite link with the person you want to invite.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handlePollNow(invite.id)}
                      disabled={processing === invite.id}
                      className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                    >
                      {processing === invite.id ? 'Checking...' : 'Check Now'}
                    </button>
                    <button
                      onClick={() => handleCancel(invite.id)}
                      disabled={processing === invite.id}
                      className="px-3 py-1 text-sm text-gray-600 hover:text-gray-700 border border-gray-300 rounded"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {invite.status === 'responded' && (
                <div className="mt-3">
                  {invite.recipientName && (
                    <p className="text-sm mb-2">
                      <span className="font-medium">{invite.recipientName}</span> wants to join
                    </p>
                  )}

                  {verifying === invite.id ? (
                    <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                      <p className="text-sm font-medium mb-2">Verify these emojis match:</p>
                      {emojis[invite.id] ? (
                        <div className="flex gap-2 text-2xl mb-3 justify-center">
                          {emojis[invite.id].map((emoji, i) => (
                            <span key={i}>{emoji}</span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 mb-3">Loading verification code...</p>
                      )}
                      <p className="text-xs text-gray-500 mb-3">
                        Ask {invite.recipientName || 'the person'} to confirm they see the same
                        emojis on their device.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(invite.id)}
                          disabled={processing === invite.id}
                          className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                        >
                          {processing === invite.id ? 'Approving...' : 'Emojis Match - Approve'}
                        </button>
                        <button
                          onClick={() => setVerifying(null)}
                          className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          Back
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setVerifying(invite.id)}
                        className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
                      >
                        Verify & Approve
                      </button>
                      <button
                        onClick={() => handleReject(invite.id)}
                        disabled={processing === invite.id}
                        className="px-3 py-1 text-sm text-red-600 hover:text-red-700 border border-red-200 rounded"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Badge showing pending invite count
 */
export function PendingInvitesBadge({ onClick }: { onClick?: () => void }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    async function loadCount() {
      const responded = await getRespondedInvites()
      setCount(responded.length)
    }
    loadCount()

    const interval = setInterval(loadCount, 30000)
    return () => clearInterval(interval)
  }, [])

  if (count === 0) return null

  return (
    <button
      onClick={onClick}
      className="relative px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800"
    >
      Invites
      <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
        {count}
      </span>
    </button>
  )
}

export default PendingInvites
