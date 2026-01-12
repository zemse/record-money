import type { Category } from '../types'

// Default system categories that are pre-installed
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'food', name: 'Food', icon: '🍽️', isSystem: true },
  { id: 'transport', name: 'Transport', icon: '🚗', isSystem: true },
  { id: 'shopping', name: 'Shopping', icon: '🛍️', isSystem: true },
  { id: 'entertainment', name: 'Entertainment', icon: '🎬', isSystem: true },
  { id: 'bills', name: 'Bills', icon: '📄', isSystem: true },
  { id: 'health', name: 'Health', icon: '💊', isSystem: true },
  { id: 'travel', name: 'Travel', icon: '✈️', isSystem: true },
  { id: 'settlement', name: 'Settlement', icon: '🤝', isSystem: true },
  { id: 'other', name: 'Other', icon: '💰', isSystem: true },
]

// Get icon for a category by name
export function getCategoryIcon(categoryName: string, categories: Category[]): string {
  const category = categories.find((c) => c.name.toLowerCase() === categoryName.toLowerCase())
  return category?.icon || '💰'
}

// Generate a unique ID for a custom category
export function generateCategoryId(name: string): string {
  return `custom-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`
}
