/**
 * IPFS Provider Types
 *
 * Defines the interface for pluggable IPFS pinning providers.
 * Providers handle upload, fetch, pin/unpin, and IPNS operations.
 */

// ============================================================================
// Provider Configuration
// ============================================================================

export type ProviderType = 'pinata' | 'infura' | 'web3storage' | 'selfhosted'

export interface PinataConfig {
  type: 'pinata'
  apiKey: string
  apiSecret: string
  gateway?: string // optional custom gateway, defaults to gateway.pinata.cloud
}

export interface InfuraConfig {
  type: 'infura'
  projectId: string
  projectSecret: string
}

export interface Web3StorageConfig {
  type: 'web3storage'
  token: string
}

export interface SelfHostedConfig {
  type: 'selfhosted'
  apiUrl: string // e.g., http://localhost:5001/api/v0
  gatewayUrl: string // e.g., http://localhost:8080/ipfs
}

export type ProviderConfig = PinataConfig | InfuraConfig | Web3StorageConfig | SelfHostedConfig

// ============================================================================
// IPFS Operations
// ============================================================================

export interface UploadResult {
  cid: string
  size: number
}

export interface FetchResult {
  data: Uint8Array
  cid: string
}

export interface IpnsRecord {
  name: string // IPNS name (derived from public key)
  value: string // CID it points to
  sequence: number // IPNS sequence number
}

export interface IpnsPublishResult {
  name: string
  value: string
  sequence: number
}

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * Interface for IPFS pinning providers.
 * All providers must implement these methods.
 */
export interface IpfsProvider {
  /** Provider type identifier */
  readonly type: ProviderType

  /**
   * Upload data to IPFS and pin it
   * @param data Raw bytes to upload
   * @param options Optional metadata
   * @returns CID and size
   */
  upload(data: Uint8Array, options?: UploadOptions): Promise<UploadResult>

  /**
   * Fetch data from IPFS by CID
   * Uses provider's gateway or public gateways
   * @param cid Content identifier
   * @returns Raw bytes
   */
  fetch(cid: string): Promise<FetchResult>

  /**
   * Unpin content from provider's pinning service
   * Content may still be available on network but won't be persisted by provider
   * @param cid Content identifier to unpin
   */
  unpin(cid: string): Promise<void>

  /**
   * Check if content is pinned by this provider
   * @param cid Content identifier
   */
  isPinned(cid: string): Promise<boolean>

  /**
   * Resolve an IPNS name to its current CID
   * @param name IPNS name (usually derived from Ed25519 public key)
   * @returns Current IPNS record or null if not found
   */
  resolveIpns(name: string): Promise<IpnsRecord | null>

  /**
   * Publish an IPNS record
   * Updates the IPNS name to point to a new CID
   * @param privateKey Ed25519 private key (32 bytes)
   * @param cid CID to point to
   * @param sequence Sequence number (must be higher than current)
   * @returns Published record
   */
  publishIpns(privateKey: Uint8Array, cid: string, sequence: number): Promise<IpnsPublishResult>

  /**
   * Validate provider configuration
   * Makes a test API call to verify credentials
   * @throws Error if configuration is invalid
   */
  validateConfig(): Promise<void>
}

export interface UploadOptions {
  /** Optional name for the content (for organization in provider dashboard) */
  name?: string
  /** Optional metadata key-value pairs */
  metadata?: Record<string, string>
}

// ============================================================================
// Multi-Gateway Support
// ============================================================================

export interface GatewayConfig {
  url: string
  priority: number // lower = higher priority
  timeout: number // ms
}

export const DEFAULT_GATEWAYS: GatewayConfig[] = [
  { url: 'https://gateway.pinata.cloud/ipfs/', priority: 1, timeout: 10000 },
  { url: 'https://ipfs.io/ipfs/', priority: 2, timeout: 15000 },
  { url: 'https://cloudflare-ipfs.com/ipfs/', priority: 3, timeout: 15000 },
  { url: 'https://dweb.link/ipfs/', priority: 4, timeout: 15000 },
]

// ============================================================================
// Error Types
// ============================================================================

export class IpfsError extends Error {
  constructor(
    message: string,
    public readonly code: IpfsErrorCode,
    public readonly cause?: Error
  ) {
    super(message)
    this.name = 'IpfsError'
  }
}

export type IpfsErrorCode =
  | 'UPLOAD_FAILED'
  | 'FETCH_FAILED'
  | 'UNPIN_FAILED'
  | 'IPNS_RESOLVE_FAILED'
  | 'IPNS_PUBLISH_FAILED'
  | 'INVALID_CONFIG'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'NOT_FOUND'
  | 'TIMEOUT'
