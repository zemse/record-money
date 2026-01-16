/**
 * Device Management Component
 *
 * Displays paired devices and allows device removal
 */

import { useState, useEffect } from 'react'
import { db, getAllPeerSyncStates } from '../db'
import { getSelfPerson, getAllPeople } from '../db'
import { removeDevice, selfRemoveDevice, checkIfPossiblyRemoved } from '../sync/security'
import { getDeviceKeysAsBytes } from '../sync/device-setup'
import type { PeerSyncState, StoredPerson } from '../types'

interface DeviceManagementProps {
  onClose?: () => void
}

interface DeviceInfo {
  deviceId: string
  name: string
  isSelf: boolean
  lastSyncedAt?: number
  consecutiveFailures: number
  ipnsPublicKey: string
}

export function DeviceManagement({ onClose }: DeviceManagementProps) {
  const [devices, setDevices] = useState<DeviceInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState<string | null>(null)
  const [possiblyRemoved, setPossiblyRemoved] = useState(false)

  useEffect(() => {
    loadDevices()
  }, [])

  async function loadDevices() {
    try {
      setLoading(true)
      const deviceKeys = await getDeviceKeysAsBytes()
      const selfPerson = await getSelfPerson()
      const peerStates = await getAllPeerSyncStates()

      const deviceList: DeviceInfo[] = []

      // Add current device
      if (deviceKeys) {
        deviceList.push({
          deviceId: deviceKeys.deviceId,
          name: 'This device',
          isSelf: true,
          consecutiveFailures: 0,
          ipnsPublicKey: '',
        })
      }

      // Add self person's other devices
      if (selfPerson?.devices) {
        for (const device of selfPerson.devices) {
          if (device.deviceId !== deviceKeys?.deviceId) {
            const peerState = peerStates.find((p) => p.deviceId === device.deviceId)
            deviceList.push({
              deviceId: device.deviceId,
              name: `Device ${device.deviceId.slice(0, 8)}`,
              isSelf: false,
              lastSyncedAt: peerState?.lastSyncedAt,
              consecutiveFailures: peerState?.consecutiveFailures || 0,
              ipnsPublicKey: device.ipnsPublicKey,
            })
          }
        }
      }

      setDevices(deviceList)

      // Check if we might have been removed
      const removalCheck = await checkIfPossiblyRemoved()
      setPossiblyRemoved(removalCheck.possiblyRemoved)
    } catch (err) {
      console.error('Failed to load devices:', err)
      setError('Failed to load devices')
    } finally {
      setLoading(false)
    }
  }

  async function handleRemoveDevice(deviceId: string) {
    try {
      setRemoving(deviceId)
      setError(null)

      const result = await removeDevice(deviceId)

      if (result.success) {
        await loadDevices()
        setShowConfirm(null)
      } else {
        setError(result.error || 'Failed to remove device')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove device')
    } finally {
      setRemoving(null)
    }
  }

  async function handleSelfRemove() {
    try {
      setRemoving('self')
      setError(null)

      const result = await selfRemoveDevice()

      if (result.success) {
        // Redirect to setup or reload
        window.location.reload()
      } else {
        setError(result.error || 'Failed to remove device')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove device')
    } finally {
      setRemoving(null)
    }
  }

  function formatLastSynced(timestamp?: number): string {
    if (!timestamp) return 'Never'

    const diff = Date.now() - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  }

  if (loading) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-500">Loading devices...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Device Management</h2>
        {onClose && (
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            Close
          </button>
        )}
      </div>

      {possiblyRemoved && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-yellow-800 dark:text-yellow-200 text-sm">
            Sync has failed multiple times. You may have been removed from this device ring.
            Consider re-pairing with your other devices.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
        </div>
      )}

      <div className="space-y-3">
        {devices.map((device) => (
          <div
            key={device.deviceId}
            className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">
                  {device.name}
                  {device.isSelf && (
                    <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded">
                      Current
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-500">ID: {device.deviceId.slice(0, 16)}...</div>
                {!device.isSelf && (
                  <div className="text-sm text-gray-500">
                    Last synced: {formatLastSynced(device.lastSyncedAt)}
                    {device.consecutiveFailures > 0 && (
                      <span className="text-yellow-600 ml-2">
                        ({device.consecutiveFailures} failures)
                      </span>
                    )}
                  </div>
                )}
              </div>

              {showConfirm === device.deviceId ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRemoveDevice(device.deviceId)}
                    disabled={removing === device.deviceId}
                    className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                  >
                    {removing === device.deviceId ? 'Removing...' : 'Confirm'}
                  </button>
                  <button
                    onClick={() => setShowConfirm(null)}
                    className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                !device.isSelf && (
                  <button
                    onClick={() => setShowConfirm(device.deviceId)}
                    className="px-3 py-1 text-sm text-red-600 hover:text-red-700 border border-red-200 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    Remove
                  </button>
                )
              )}
            </div>
          </div>
        ))}
      </div>

      {devices.length === 1 && (
        <p className="mt-4 text-sm text-gray-500 text-center">
          Only this device is paired. Add more devices using the Pair Device option.
        </p>
      )}

      <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Danger Zone</h3>
        {showConfirm === 'self' ? (
          <div className="flex gap-2">
            <button
              onClick={handleSelfRemove}
              disabled={removing === 'self'}
              className="px-3 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
            >
              {removing === 'self' ? 'Removing...' : 'Yes, Remove This Device'}
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
            onClick={() => setShowConfirm('self')}
            className="text-sm text-red-600 hover:text-red-700"
          >
            Remove this device from sync
          </button>
        )}
        <p className="mt-1 text-xs text-gray-500">
          This will stop syncing on this device. Your data will remain locally but you wont receive
          updates from other devices.
        </p>
      </div>
    </div>
  )
}

export default DeviceManagement
