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

export interface Settings {
  key: string // 'main' - single row key
  claudeApiKey?: string // stored locally
  autoApplyAiChanges: boolean // default: false
  lastUsedCurrency: string // ISO 4217
  theme: Theme // default: 'system'
}
