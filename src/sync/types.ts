/**
 * Types for P2P sync protocol
 * Based on SPEC/09-ipfs-transport
 */

// ============================================================================
// Person (replaces User with email-based identification)
// ============================================================================

export interface DeviceInfo {
  deviceId: string // SHA-256(authPublicKey) - unique device identifier
  ipnsPublicKey: Uint8Array // 32-byte Ed25519 public key - for polling
  authPublicKey: Uint8Array // 65-byte P-256 public key - for ECDH/verification
}

export interface Person {
  uuid: string // primary identifier, immutable
  name: string // display name
  email?: string // optional, can change
  devices?: DeviceInfo[] // devices belonging to this person
  addedAt: number // timestamp ms
  addedBy?: string // UUID of person who added them
  isSelf?: boolean // true if this is the current user
  isPlaceholder?: boolean // true if not yet claimed an account
}

// ============================================================================
// Participant (for records)
// ============================================================================

export interface Participant {
  personUuid: string // references Person.uuid
  share: number // interpretation depends on shareType
}

// ============================================================================
// Group (extended for sync)
// ============================================================================

export interface Group {
  uuid: string
  name: string
  createdAt: number // Unix ms
  createdBy?: string // UUID of person who created the group
  protocolVersion: number // current active protocol version (starts at 1)
  pendingUpgrade?: PendingUpgrade
}

export interface PendingUpgrade {
  windowStart: number // Unix ms - when first proposal was received
  windowEnd: number // windowStart + 48 hours
  proposals: UpgradeProposal[]
}

export interface UpgradeProposal {
  personUuid: string // who proposed
  maxSupportedVersion: number
}

// ============================================================================
// Mutations
// ============================================================================

export interface Mutation {
  version: number // protocol version (1, 2, 3, ...)
  uuid: string // UUIDv4 - mutation identifier
  id: number // per-device incremental
  targetUuid: string // UUID or deviceId of target
  targetType: 'record' | 'person' | 'group' | 'device'
  operation: MutationOperation
  timestamp: number // Unix ms (user-visible, for display/ordering)
  signedAt: number // Unix ms (signing time, for validity checking)
  authorDevicePublicKey: Uint8Array // 65-byte uncompressed P-256 public key
  signature: Uint8Array // 64-byte ECDSA P-256 signature (r || s)
}

export type MutationOperation =
  | CreateOp
  | DeleteOp
  | UpdateOp
  | MergeOp
  | ExitOp
  | ResolveConflictOp
  | ProposeUpgradeOp

export interface CreateOp {
  type: 'create'
  data: Record<string, unknown> // full object for creation
}

export interface DeleteOp {
  type: 'delete'
}

export interface ExitOp {
  type: 'exit'
}

export interface UpdateOp {
  type: 'update'
  changes: FieldChange[]
}

export interface MergeOp {
  type: 'merge'
  fromUuid: string // UUID being merged into targetUuid
}

export interface ResolveConflictOp {
  type: 'resolve_conflict'
  conflictType: 'field' | 'delete_vs_update' | 'merge_vs_update'
  winnerMutationUuid: string
  voidedMutationUuids: string[]
  targetUuid: string
  summary?: string
}

export interface ProposeUpgradeOp {
  type: 'propose_upgrade'
  maxSupportedVersion: number
}

// ============================================================================
// Field Changes
// ============================================================================

export type FieldChange = ScalarChange | ArrayAddOp | ArrayRemoveOp | ArrayUpdateOp

export interface ScalarChange {
  field: string
  old: unknown
  new: unknown
}

export interface ArrayAddOp {
  field: 'paidBy' | 'paidFor' | 'devices'
  op: 'add'
  key: string // personUuid for paidBy/paidFor, deviceId for devices
  value: Participant | DeviceInfo
}

export interface ArrayRemoveOp {
  field: 'paidBy' | 'paidFor' | 'devices'
  op: 'remove'
  key: string
  oldValue: Participant | DeviceInfo
}

export interface ArrayUpdateOp {
  field: 'paidBy' | 'paidFor' | 'devices'
  op: 'update'
  key: string
  old: Participant | DeviceInfo
  new: Participant | DeviceInfo
}

// ============================================================================
// Device Manifest (IPNS root)
// ============================================================================

export interface DeviceManifest {
  databaseCid: string // CID → encrypted full db
  latestMutationId: Uint8Array // encrypted with Personal Key
  chunkIndex: Uint8Array // encrypted with Personal Key → MutationChunks
  deviceRingCid: string // CID → DeviceRing (encrypted with Broadcast Key)
  peerDirectoryCid: string // CID → PeerDirectory
}

// ============================================================================
// Device Ring
// ============================================================================

export interface DeviceRing {
  devices: DeviceRingEntry[]
}

export interface DeviceRingEntry {
  authPublicKey: Uint8Array // 65-byte uncompressed P-256 public key
  ipnsPublicKey: Uint8Array // 32-byte Ed25519 public key
  lastSyncedId: number // highest mutation ID verified & stored from this device
}

// ============================================================================
// Peer Directory
// ============================================================================

export interface PeerDirectory {
  entries: PeerDirectoryEntry[]
}

export interface PeerDirectoryEntry {
  recipientPublicKey: Uint8Array // who this entry is for
  ciphertext: Uint8Array // ECDH encrypted payload
}

export interface PeerDirectoryPayload {
  personalKey?: Uint8Array // 32-byte Personal Key (only for self devices)
  broadcastKey: Uint8Array // 32-byte Broadcast Key (publisher's key)
  sharedGroups: SharedGroup[]
}

export interface SharedGroup {
  groupUuid: string
  symmetricKey: Uint8Array // 32-byte Group Key
  manifestCid: string // points to publisher's GroupManifest
}

// ============================================================================
// Mutation Chunks
// ============================================================================

export interface MutationChunk {
  startId: number
  endId: number
  cid: string // IPFS CID → encrypted Mutation[]
}

export type MutationChunks = MutationChunk[]

// ============================================================================
// Group Manifest
// ============================================================================

export interface GroupManifest {
  group: Group
  database: GroupDatabase
  chunkIndex: MutationChunks
  latestMutationId: number
}

export interface GroupDatabase {
  records: ExpenseRecord[]
  people: Person[]
}

// ============================================================================
// Expense Record (from existing types, adapted for sync)
// ============================================================================

export type ShareType = 'equal' | 'percentage' | 'exact' | 'shares'

export interface AccountPayment {
  accountId: string
  amount: number
}

export interface ExpenseRecord {
  uuid: string
  title: string
  description: string
  category: string
  amount: number
  currency: string
  date: string
  time: string
  icon: string
  paidBy: Participant[] // now uses personUuid instead of email
  paidFor: Participant[]
  shareType: ShareType
  groupId: string | null
  accounts?: AccountPayment[]
  comments: string
  sourceHash?: string
  createdAt: number
  updatedAt: number
}

// ============================================================================
// Sync State
// ============================================================================

export type SyncMode = 'solo' | 'synced'

export interface SyncState {
  mode: SyncMode
  selfPersonUuid?: string
  personalKey?: Uint8Array
  broadcastKey?: Uint8Array
  migrated: boolean // true if solo data has been migrated to mutations
}

// ============================================================================
// Mutation Queue (for offline support)
// ============================================================================

export type MutationQueueStatus = 'pending' | 'published'

export interface QueuedMutation {
  id: number // per-device incremental ID
  mutation: Mutation
  status: MutationQueueStatus
  createdAt: number
  publishedAt?: number
}
