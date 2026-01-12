import type { User } from '../types'

interface MultipleUserPickerProps {
  users: User[]
  selected: string[]
  onChange: (selected: string[]) => void
  multiple: true
  placeholder?: string
}

interface SingleUserPickerProps {
  users: User[]
  selected: string
  onChange: (selected: string) => void
  multiple?: false
  placeholder?: string
}

type UserPickerProps = MultipleUserPickerProps | SingleUserPickerProps

export function UserPicker({
  users,
  selected,
  onChange,
  multiple = false,
  placeholder = 'Select users...',
}: UserPickerProps) {
  const selectedArray = Array.isArray(selected) ? selected : selected ? [selected] : []

  const toggleUser = (email: string) => {
    if (multiple) {
      const currentSelected = selectedArray
      if (currentSelected.includes(email)) {
        ;(onChange as (selected: string[]) => void)(currentSelected.filter((e) => e !== email))
      } else {
        ;(onChange as (selected: string[]) => void)([...currentSelected, email])
      }
    } else {
      ;(onChange as (selected: string) => void)(email)
    }
  }

  if (users.length === 0) {
    return (
      <div className="mt-1 rounded-md border border-gray-300 p-3 text-sm text-gray-500">
        No users available. Add users first.
      </div>
    )
  }

  return (
    <div className="mt-1 space-y-2">
      {selectedArray.length === 0 && <p className="text-sm text-gray-500">{placeholder}</p>}
      <div className="flex flex-wrap gap-2">
        {users.map((user) => {
          const isSelected = selectedArray.includes(user.email)
          return (
            <button
              key={user.email}
              type="button"
              onClick={() => toggleUser(user.email)}
              className={`rounded-full px-3 py-1 text-sm ${
                isSelected
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {user.alias}
            </button>
          )
        })}
      </div>
    </div>
  )
}
