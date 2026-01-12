import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { DashboardPage } from './pages/DashboardPage'
import { RecordsPage } from './pages/RecordsPage'
import { UsersPage } from './pages/UsersPage'
import { GroupsPage } from './pages/GroupsPage'
import { SettingsPage } from './pages/SettingsPage'
import {
  initializeSettings,
  initializeDefaultGroup,
  migrateUngroupedRecords,
  initializeDefaultCategories,
} from './db'
import { ThemeProvider } from './hooks/useTheme'

function App() {
  useEffect(() => {
    const init = async () => {
      await initializeSettings()
      await initializeDefaultGroup()
      await initializeDefaultCategories()
      await migrateUngroupedRecords()
    }
    init()
  }, [])

  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="records" element={<RecordsPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="groups" element={<GroupsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
