import { Outlet, NavLink } from 'react-router-dom'

const navItems = [
  { to: '/', label: 'Records', icon: '📝' },
  { to: '/groups', label: 'Groups', icon: '👥' },
  { to: '/users', label: 'Users', icon: '👤' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

export function Layout() {
  return (
    <div className="flex min-h-screen bg-surface-secondary">
      {/* Desktop Sidebar */}
      <nav className="fixed top-0 left-0 hidden h-full w-60 flex-col border-r border-border-default bg-surface md:flex">
        <div className="p-5">
          <h1 className="text-xl font-semibold tracking-tight text-content">
            <span className="mr-2">💰</span>
            Record Money
          </h1>
        </div>

        <div className="flex flex-1 flex-col gap-1 px-3">
          {navItems.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-content-secondary hover:bg-surface-tertiary hover:text-content'
                }`
              }
            >
              <span className="text-base">{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </div>

        <div className="border-t border-border-default p-4">
          <p className="text-xs text-content-tertiary">v0.1.0 • All data local</p>
        </div>
      </nav>

      {/* Main content area */}
      <main className="min-h-screen flex-1 pb-20 md:ml-60 md:pb-6">
        <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed right-0 bottom-0 left-0 border-t border-border-default bg-surface/95 backdrop-blur-sm md:hidden">
        <div className="mx-auto flex max-w-md">
          {navItems.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
                  isActive ? 'text-primary' : 'text-content-tertiary'
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
