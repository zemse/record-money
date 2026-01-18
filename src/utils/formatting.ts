import type { User } from '../types'

/**
 * Get user alias by email, falling back to email if not found
 */
export function getUserAlias(email: string, users: User[] | undefined): string {
  const user = users?.find((u) => u.email === email)
  return user?.alias || email
}

/**
 * Format date string to human-readable format
 * Shows "Today", "Yesterday", or short date format
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (dateStr === today.toISOString().split('T')[0]) {
    return 'Today'
  }
  if (dateStr === yesterday.toISOString().split('T')[0]) {
    return 'Yesterday'
  }

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  })
}
