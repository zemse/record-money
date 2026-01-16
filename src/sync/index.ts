/**
 * P2P Sync Module
 *
 * Implements IPFS-based sync protocol for multi-device and group sync.
 * See SPEC/09-ipfs-transport for full specification.
 */

// Crypto utilities
export {
  // P-256 key operations
  generateP256KeyPair,
  getP256PublicKey,
  signP256,
  verifyP256,
  ecdhP256,
  deriveDeviceId,
  // Ed25519 key operations (for IPNS)
  generateEd25519KeyPair,
  getEd25519PublicKey,
  signEd25519,
  verifyEd25519,
  // Symmetric key operations
  generateSymmetricKey,
  deriveAesKeyFromSharedSecret,
  // AES-GCM encryption
  encryptAesGcm,
  decryptAesGcm,
  encryptAesGcmPacked,
  decryptAesGcmPacked,
  // Hashing
  hashSha256,
  hashSha256String,
  // Encoding utilities
  bytesToHex,
  hexToBytes,
  bytesToBase64,
  base64ToBytes,
  stringToBytes,
  bytesToString,
  // ECDH key sharing
  encryptForRecipient,
  decryptFromSender,
  // Emoji verification
  deriveVerificationEmojis,
  // Types
  type P256KeyPair,
  type Ed25519KeyPair,
  type EncryptedData,
} from './crypto'

// Mutation operations
export {
  // Canonical JSON
  serializeForSigning,
  serializeMutation,
  deserializeMutation,
  // Mutation creation
  createMutation,
  signMutation,
  createSignedMutation,
  // Mutation verification
  verifyMutationSignature,
  verifyMutationTimestamp,
  verifyMutation,
  // Field change helpers
  createScalarChange,
  computeFieldChanges,
  applyFieldChanges,
  // Constants
  CURRENT_PROTOCOL_VERSION,
  type CreateMutationParams,
  type VerificationResult,
} from './mutations'

// Types
export type {
  // Person and device
  Person,
  DeviceInfo,
  Participant,
  // Group
  Group,
  PendingUpgrade,
  UpgradeProposal,
  // Mutations
  Mutation,
  MutationOperation,
  CreateOp,
  DeleteOp,
  UpdateOp,
  MergeOp,
  ExitOp,
  ResolveConflictOp,
  ProposeUpgradeOp,
  // Field changes
  FieldChange,
  ScalarChange,
  ArrayAddOp,
  ArrayRemoveOp,
  ArrayUpdateOp,
  // Manifests and data structures
  DeviceManifest,
  DeviceRing,
  DeviceRingEntry,
  PeerDirectory,
  PeerDirectoryEntry,
  PeerDirectoryPayload,
  SharedGroup,
  MutationChunk,
  MutationChunks,
  GroupManifest,
  GroupDatabase,
  // Records
  ExpenseRecord,
  ShareType,
  AccountPayment,
  // Sync state
  SyncMode,
  SyncState,
  MutationQueueStatus,
  QueuedMutation,
} from './types'

// Schema serialization and encryption
export {
  // DeviceManifest
  type SerializedDeviceManifest,
  createDeviceManifest,
  serializeDeviceManifest,
  deserializeDeviceManifest,
  decryptDeviceManifest,
  // DeviceRing
  createEncryptedDeviceRing,
  decryptDeviceRing,
  createDeviceRingEntry,
  // PeerDirectory
  type SerializedPeerDirectory,
  createPeerDirectoryEntry,
  decryptPeerDirectoryEntry,
  createSerializedPeerDirectory,
  serializePeerDirectory,
  deserializePeerDirectory,
  findAndDecryptPeerDirectoryEntry,
  // GroupManifest
  createEncryptedGroupManifest,
  decryptGroupManifest,
  createGroupManifest,
  // MutationChunks
  createEncryptedMutationChunk,
  decryptMutationChunk,
  findChunksToSync,
  createMutationChunk,
  // Database
  type PersonalDatabase,
  createEncryptedDatabase,
  decryptDatabase,
  // Validation
  isValidDeviceManifest,
  isValidDeviceRing,
  isValidPeerDirectoryPayload,
  isValidGroupManifest,
} from './schemas'

// IPFS provider module
export {
  // Types
  type ProviderType,
  type ProviderConfig,
  type PinataConfig,
  type InfuraConfig,
  type Web3StorageConfig,
  type SelfHostedConfig,
  type IpfsProvider,
  type UploadResult,
  type FetchResult,
  type IpnsRecord,
  type IpnsPublishResult,
  type UploadOptions,
  type GatewayConfig,
  type IpfsErrorCode,
  type CidEntry,
  type CidHistory,
  // Classes and errors
  IpfsError,
  DEFAULT_GATEWAYS,
  PinataProvider,
  GatewayManager,
  CidManager,
  // Factory functions
  createProvider,
  createPinataProvider,
  createGatewayManager,
  createCidManager,
  validateProviderConfig,
  getProviderDisplayName,
  getAvailableProviders,
} from './ipfs'
