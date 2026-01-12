import { useOnlineStatus } from '../hooks/useOnlineStatus'

export function OfflineBanner() {
  const isOnline = useOnlineStatus()

  if (isOnline) return null

  return (
    <div className="fixed left-0 right-0 top-0 z-50 bg-amber-500 px-4 py-2 text-center text-sm font-medium text-white shadow-md">
      <span className="mr-2">📡</span>
      You're offline. Changes will sync when you reconnect.
    </div>
  )
}
