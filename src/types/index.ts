export interface Participant {
  email: string // normalized: lowercase, trimmed
  share: number // interpretation depends on shareType
}

export type ShareType = 'equal' | 'percentage' | 'exact' | 'shares'

// Account payment for tracking split payments across accounts
export interface AccountPayment {
  accountId: string
  amount: number
}

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
  accounts?: AccountPayment[] // optional: which accounts were used with amounts (supports split payments)
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
  enableAiMemory: boolean // default: true - store AI interaction summary
  aiUserSummary?: string // brief summary of user preferences and interaction patterns
  lastUsedCurrency: string // ISO 4217
  defaultDisplayCurrency: string // ISO 4217 - for dashboard balance display
  currentUserEmail?: string // email of the current user ("me")
  theme: Theme // default: 'system'
  defaultAccountId?: string // default account for new expenses
  onboardingComplete?: boolean // whether user has completed onboarding
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

// ============================================================================
// Sync Types
// ============================================================================

export type SyncMode = 'solo' | 'synced'

export type ProviderType = 'pinata' | 'infura' | 'web3storage' | 'selfhosted'

/**
 * Device keys stored in IndexedDB
 * These are generated once and never change for a device
 */
export interface DeviceKeys {
  key: string // 'device-keys' - single row key
  // IPNS key pair (Ed25519)
  ipnsPrivateKey: string // base64 encoded 32-byte seed
  ipnsPublicKey: string // base64 encoded 32-byte public key
  // Auth/signing key pair (P-256)
  authPrivateKey: string // base64 encoded 32-byte private key
  authPublicKey: string // base64 encoded 65-byte uncompressed public key
  // Derived device ID
  deviceId: string // hex(SHA-256(authPublicKey))
  // Creation timestamp
  createdAt: number
}

/**
 * Sync configuration including provider settings
 */
export interface SyncConfig {
  key: string // 'sync-config' - single row key
  mode: SyncMode // 'solo' or 'synced'
  // Provider configuration (stored as JSON string for flexibility)
  providerType?: ProviderType
  providerConfig?: string // JSON-encoded provider-specific config
  // Symmetric keys (base64 encoded, only present in 'synced' mode)
  personalKey?: string // 32-byte Personal Key
  broadcastKey?: string // 32-byte Broadcast Key
  // Self person UUID (links to Person in sync types)
  selfPersonUuid?: string
  // Migration tracking
  migrated: boolean // true if solo data has been migrated to mutations
  migratedAt?: number // timestamp of migration
  // CID history (JSON-encoded Map<string, CidHistory>)
  cidHistory?: string
}

/**
 * Queued mutation for offline support
 * Mutations are stored here before being published to IPFS
 */
export interface QueuedMutation {
  id: number // auto-increment, per-device incremental ID
  mutationJson: string // JSON-encoded Mutation
  status: 'pending' | 'published'
  createdAt: number
  publishedAt?: number
}

/**
 * Peer sync state tracking
 * Tracks the last synced mutation ID from each peer device
 */
export interface PeerSyncState {
  deviceId: string // peer's device ID (primary key)
  ipnsPublicKey: string // peer's IPNS public key (base64)
  lastSyncedId: number // highest mutation ID verified & stored from this device
  lastSyncedAt: number // timestamp of last successful sync
  lastAttemptedAt?: number // timestamp of last sync attempt
  consecutiveFailures: number // for backoff calculation
}
