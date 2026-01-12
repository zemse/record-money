import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'

export function SettingsPage() {
  const settings = useLiveQuery(() => db.settings.get('main'))

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-bold">Settings</h1>

      <div className="space-y-4">
        <div className="rounded-lg bg-white p-4 shadow">
          <h2 className="font-medium">Currency</h2>
          <p className="text-sm text-gray-500">
            Last used currency: {settings?.lastUsedCurrency || 'INR'}
          </p>
        </div>

        <div className="rounded-lg bg-white p-4 shadow">
          <h2 className="font-medium">Data</h2>
          <p className="mt-2 text-sm text-gray-500">
            All data is stored locally in your browser. Export your data regularly for backup.
          </p>
        </div>

        <div className="rounded-lg bg-white p-4 shadow">
          <h2 className="font-medium">About</h2>
          <p className="mt-2 text-sm text-gray-500">Record Money v0.1.0</p>
          <p className="text-sm text-gray-500">Decentralized expense tracking</p>
        </div>
      </div>
    </div>
  )
}
