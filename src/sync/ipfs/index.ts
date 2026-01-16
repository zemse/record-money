/**
 * IPFS Integration Module
 *
 * Provides pluggable IPFS storage with support for multiple pinning providers.
 * Handles upload, fetch, IPNS, and content management.
 */

// Types
export type {
  ProviderType,
  ProviderConfig,
  PinataConfig,
  InfuraConfig,
  Web3StorageConfig,
  SelfHostedConfig,
  IpfsProvider,
  UploadResult,
  FetchResult,
  IpnsRecord,
  IpnsPublishResult,
  UploadOptions,
  GatewayConfig,
  IpfsErrorCode,
} from './types'

export { IpfsError, DEFAULT_GATEWAYS } from './types'

// Providers
export { PinataProvider, createPinataProvider } from './pinata-provider'

// Gateway Manager
export { GatewayManager, createGatewayManager } from './gateway-manager'

// CID Manager
export type { CidEntry, CidHistory } from './cid-manager'
export { CidManager, createCidManager } from './cid-manager'

// Factory
export {
  createProvider,
  validateProviderConfig,
  getProviderDisplayName,
  getAvailableProviders,
} from './provider-factory'
