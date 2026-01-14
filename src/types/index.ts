export interface Participant {
  email: string // normalized: lowercase, trimmed
  share: number // interpretation depends on shareType
}

export type ShareType = 'equal' | 'percentage' | 'exact' | 'shares'

export interface ExpenseRecord {
  uuid: string // randomly generated, survives edits
  title: string
  description: string
  category: string
  amount: number
  currency: string // ISO 4217 (INR, USD, EUR)
  date: string // ISO date YYYY-MM-DD
  time: string // ISO time HH:MM
  icon: string // emoji
  paidBy: Participant[]
  paidFor: Participant[]
  shareType: ShareType
  groupId: string | null
  account?: string // optional: which account was used (Cash, Bank, Wallet, etc.)
  comments: string // verbose details, AI extraction notes
  sourceHash?: string // for bank statement dedup: `${filename}:${hash}`
  createdAt: number // timestamp ms
  updatedAt: number // timestamp ms
}

export interface User {
  email: string // primary identifier, normalized
  alias: string // display name
}

export interface Group {
  uuid: string
  name: string
  members: string[] // emails
  isDefault?: boolean // true for the built-in default group
  createdAt: number
  updatedAt: number
}

// Default group constant UUID
export const DEFAULT_GROUP_UUID = 'default-group'

export type Theme = 'light' | 'dark' | 'system'

// Available Claude models
export type ClaudeModel =
  | 'claude-haiku-3-5-20241022'
  | 'claude-sonnet-4-20250514'
  | 'claude-opus-4-20250514'
  | 'claude-opus-4-5-20251101'

export const CLAUDE_MODELS: { id: ClaudeModel; name: string; description: string }[] = [
  { id: 'claude-haiku-3-5-20241022', name: 'Haiku 3.5', description: 'Fast & affordable' },
  { id: 'claude-sonnet-4-20250514', name: 'Sonnet 4', description: 'Balanced performance' },
  { id: 'claude-opus-4-20250514', name: 'Opus 4', description: 'Most capable' },
  { id: 'claude-opus-4-5-20251101', name: 'Opus 4.5', description: 'Latest & greatest' },
]

export const DEFAULT_CLAUDE_MODEL: ClaudeModel = 'claude-sonnet-4-20250514'

export interface Settings {
  key: string // 'main' - single row key
  claudeApiKey?: string // stored locally
  claudeModel?: ClaudeModel // selected AI model
  autoApplyAiChanges: boolean // default: false
  lastUsedCurrency: string // ISO 4217
  defaultDisplayCurrency: string // ISO 4217 - for dashboard balance display
  currentUserEmail?: string // email of the current user ("me")
  theme: Theme // default: 'system'
  defaultAccountId?: string // default account for new expenses
}

// Exchange rates storage
export interface ExchangeRates {
  key: string // 'rates' - single row key
  baseCurrency: string // base currency (EUR for Frankfurter API)
  rates: Record<string, number> // currency code -> rate relative to base
  fetchedAt: number // timestamp ms when rates were fetched
}

// Category for expense classification
export interface Category {
  id: string // unique identifier
  name: string // display name
  icon: string // emoji icon
  isSystem: boolean // true for predefined categories, false for custom
}

// Account for tracking money source (user-defined)
export interface Account {
  id: string // unique identifier
  name: string // display name (e.g., "Cash", "HDFC Bank", "Wallet")
  icon: string // emoji icon
  createdAt: number // timestamp ms
}
