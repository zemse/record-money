/**
 * Group Members Component
 *
 * Displays group members and allows member management
 */

import { useState, useEffect } from 'react'
import { db, getAllPeople, getSelfPerson } from '../db'
import { removeMember, exitGroup, PERSONAL_LEDGER_NAME } from '../sync/groups'
import { generateInviteLink } from '../sync/groups'
import { forkGroup } from '../sync/security'
import type { Group, StoredPerson } from '../types'

interface GroupMembersProps {
  groupUuid: string
  onClose?: () => void
}

export function GroupMembers({ groupUuid, onClose }: GroupMembersProps) {
  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<StoredPerson[]>([])
  const [selfPerson, setSelfPerson] = useState<StoredPerson | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [showForkConfirm, setShowForkConfirm] = useState(false)
  const [selectedForFork, setSelectedForFork] = useState<string[]>([])

  useEffect(() => {
    loadGroup()
  }, [groupUuid])

  async function loadGroup() {
    try {
      setLoading(true)
      const g = await db.groups.get(groupUuid)
      setGroup(g || null)

      if (g) {
        const allPeople = await getAllPeople()
        const groupMembers = allPeople.filter((p) => g.members.includes(p.uuid))
        setMembers(groupMembers)
      }

      const self = await getSelfPerson()
      setSelfPerson(self || null)
    } catch (err) {
      console.error('Failed to load group:', err)
      setError('Failed to load group')
    } finally {
      setLoading(false)
    }
  }

  async function handleRemoveMember(personUuid: string) {
    try {
      setRemoving(personUuid)
      setError(null)

      const result = await removeMember(groupUuid, personUuid)

      if (result.success) {
        await loadGroup()
        setShowConfirm(null)
      } else {
        setError(result.error || 'Failed to remove member')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member')
    } finally {
      setRemoving(null)
    }
  }

  async function handleExitGroup() {
    try {
      setRemoving('exit')
      setError(null)

      const result = await exitGroup(groupUuid)

      if (result.success) {
        onClose?.()
      } else {
        setError(result.error || 'Failed to exit group')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to exit group')
    } finally {
      setRemoving(null)
    }
  }

  async function handleGenerateInvite() {
    try {
      setError(null)
      const result = await generateInviteLink(groupUuid)

      if (result.success && result.inviteLink) {
        setInviteLink(result.inviteLink)
        setShowInvite(true)
      } else {
        setError(result.error || 'Failed to generate invite')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate invite')
    }
  }

  async function handleForkGroup() {
    if (selectedForFork.length === 0) {
      setError('Select at least one person to exclude')
      return
    }

    try {
      setRemoving('fork')
      setError(null)

      const result = await forkGroup(groupUuid, selectedForFork)

      if (result.success) {
        setShowForkConfirm(false)
        setSelectedForFork([])
        // Reload to show new group
        await loadGroup()
      } else {
        setError(result.error || 'Failed to fork group')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fork group')
    } finally {
      setRemoving(null)
    }
  }

  function copyInviteLink() {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink)
    }
  }

  const isPersonalLedger = group?.name === PERSONAL_LEDGER_NAME
  const canManageMembers = !isPersonalLedger && members.length > 1

  if (loading) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-500">Loading group...</span>
        </div>
      </div>
    )
  }

  if (!group) {
    return (
      <div className="p-4">
        <p className="text-red-500">Group not found</p>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold">{group.name}</h2>
          <p className="text-sm text-gray-500">{members.length} members</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            Close
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
        </div>
      )}

      {/* Invite section */}
      {!isPersonalLedger && (
        <div className="mb-4">
          {showInvite && inviteLink ? (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-sm font-medium mb-2">Share this invite link:</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inviteLink}
                  readOnly
                  className="flex-1 px-2 py-1 text-sm border rounded bg-white dark:bg-gray-900"
                />
                <button
                  onClick={copyInviteLink}
                  className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Copy
                </button>
              </div>
              <button
                onClick={() => setShowInvite(false)}
                className="mt-2 text-sm text-gray-500 hover:text-gray-700"
              >
                Hide
              </button>
            </div>
          ) : (
            <button
              onClick={handleGenerateInvite}
              className="w-full px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Invite New Member
            </button>
          )}
        </div>
      )}

      {/* Members list */}
      <div className="space-y-2">
        {members.map((member) => (
          <div
            key={member.uuid}
            className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">
                  {member.name}
                  {member.isSelf && (
                    <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded">
                      You
                    </span>
                  )}
                  {member.isPlaceholder && (
                    <span className="ml-2 text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 px-2 py-0.5 rounded">
                      Pending
                    </span>
                  )}
                </div>
                {member.email && <div className="text-sm text-gray-500">{member.email}</div>}
                <div className="text-xs text-gray-400">{member.devices?.length || 0} devices</div>
              </div>

              {canManageMembers && !member.isSelf && (
                <>
                  {showConfirm === member.uuid ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRemoveMember(member.uuid)}
                        disabled={removing === member.uuid}
                        className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                      >
                        {removing === member.uuid ? 'Removing...' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setShowConfirm(null)}
                        className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowConfirm(member.uuid)}
                      className="px-3 py-1 text-sm text-red-600 hover:text-red-700 border border-red-200 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      Remove
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      {!isPersonalLedger && (
        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
          {/* Fork group */}
          {members.length > 1 && (
            <div>
              {showForkConfirm ? (
                <div className="p-3 border border-yellow-200 dark:border-yellow-800 rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                    Select members to exclude from the new group:
                  </p>
                  <div className="space-y-2 mb-3">
                    {members
                      .filter((m) => !m.isSelf)
                      .map((member) => (
                        <label key={member.uuid} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedForFork.includes(member.uuid)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedForFork([...selectedForFork, member.uuid])
                              } else {
                                setSelectedForFork(
                                  selectedForFork.filter((id) => id !== member.uuid)
                                )
                              }
                            }}
                          />
                          <span className="text-sm">{member.name}</span>
                        </label>
                      ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleForkGroup}
                      disabled={removing === 'fork' || selectedForFork.length === 0}
                      className="px-3 py-1 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
                    >
                      {removing === 'fork' ? 'Creating...' : 'Create Fork'}
                    </button>
                    <button
                      onClick={() => {
                        setShowForkConfirm(false)
                        setSelectedForFork([])
                      }}
                      className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowForkConfirm(true)}
                  className="text-sm text-yellow-600 hover:text-yellow-700"
                >
                  Fork group (exclude bad actors)
                </button>
              )}
            </div>
          )}

          {/* Exit group */}
          <div>
            {showConfirm === 'exit' ? (
              <div className="flex gap-2">
                <button
                  onClick={handleExitGroup}
                  disabled={removing === 'exit'}
                  className="px-3 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                >
                  {removing === 'exit' ? 'Leaving...' : 'Yes, Leave Group'}
                </button>
                <button
                  onClick={() => setShowConfirm(null)}
                  className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowConfirm('exit')}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Leave this group
              </button>
            )}
            <p className="mt-1 text-xs text-gray-500">
              You can leave but your data up to this point will be archived locally.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default GroupMembers
