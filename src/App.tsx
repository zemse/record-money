import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Layout } from './components/Layout'
import { DashboardPage } from './pages/DashboardPage'
import { RecordsPage } from './pages/RecordsPage'
import { UsersPage } from './pages/UsersPage'
import { GroupsPage } from './pages/GroupsPage'
import { SettingsPage } from './pages/SettingsPage'
import { ImportPage } from './pages/ImportPage'
import { ScanPage } from './pages/ScanPage'
import { Onboarding } from './components/Onboarding'
import {
  db,
  initializeSettings,
  initializeDefaultGroup,
  migrateUngroupedRecords,
  initializeDefaultCategories,
} from './db'
import { ThemeProvider } from './hooks/useTheme'

function AppContent() {
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const settings = useLiveQuery(() => db.settings.get('main'))

  useEffect(() => {
    const init = async () => {
      await initializeSettings()
      await initializeDefaultGroup()
      await initializeDefaultCategories()
      await migrateUngroupedRecords()
      setInitialized(true)
    }
    init()
  }, [])

  // Show onboarding for new users
  useEffect(() => {
    if (initialized && settings !== undefined) {
      if (!settings?.onboardingComplete) {
        setShowOnboarding(true)
      }
    }
  }, [initialized, settings])

  const handleOnboardingComplete = () => {
    setShowOnboarding(false)
  }

  // Show loading while initializing
  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-secondary">
        <div className="text-center">
          <span className="text-4xl">💰</span>
          <p className="mt-2 text-content-secondary">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {showOnboarding && <Onboarding onComplete={handleOnboardingComplete} />}
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="records" element={<RecordsPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="groups" element={<GroupsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="import" element={<ImportPage />} />
            <Route path="scan" element={<ScanPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </>
  )
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  )
}

export default App
