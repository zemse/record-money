import { Outlet, NavLink } from 'react-router-dom'

const navItems = [
  { to: '/', label: 'Records', icon: '📝' },
  { to: '/groups', label: 'Groups', icon: '👥' },
  { to: '/users', label: 'Users', icon: '👤' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

export function Layout() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Desktop Sidebar - hidden on mobile */}
      <nav className="fixed top-0 left-0 hidden h-full w-56 flex-col border-r border-gray-200 bg-white md:flex">
        <div className="border-b border-gray-200 p-4">
          <h1 className="text-lg font-bold text-indigo-600">💰 Record Money</h1>
        </div>
        <div className="flex flex-1 flex-col gap-1 p-2">
          {navItems.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-600'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              <span className="text-lg">{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Main content area */}
      <main className="min-h-screen flex-1 pb-16 md:ml-56 md:pb-0">
        <div className="mx-auto max-w-4xl">
          <Outlet />
        </div>
      </main>

      {/* Mobile Bottom Navigation - hidden on desktop */}
      <nav className="fixed right-0 bottom-0 left-0 border-t border-gray-200 bg-white md:hidden">
        <div className="mx-auto flex max-w-md justify-around">
          {navItems.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center py-2 text-xs ${
                  isActive ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-700'
                }`
              }
            >
              <span className="text-xl">{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
