import { Outlet, NavLink } from 'react-router-dom'

const navItems = [
  { to: '/', label: 'Records', icon: '📝' },
  { to: '/groups', label: 'Groups', icon: '👥' },
  { to: '/users', label: 'Users', icon: '👤' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <main className="flex-1 overflow-auto pb-16">
        <Outlet />
      </main>

      <nav className="fixed right-0 bottom-0 left-0 border-t border-gray-200 bg-white">
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
