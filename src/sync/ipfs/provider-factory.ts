/**
 * Provider Factory
 *
 * Creates IPFS providers based on configuration.
 * Supports multiple provider types with a unified interface.
 */

import type { IpfsProvider, ProviderConfig } from './types'
import { IpfsError } from './types'
import { PinataProvider } from './pinata-provider'

// ============================================================================
// Factory
// ============================================================================

/**
 * Create an IPFS provider from configuration
 */
export function createProvider(config: ProviderConfig): IpfsProvider {
  switch (config.type) {
    case 'pinata':
      return new PinataProvider(config)

    case 'infura':
      // TODO: Implement Infura provider
      throw new IpfsError('Infura provider not yet implemented', 'INVALID_CONFIG')

    case 'web3storage':
      // TODO: Implement web3.storage provider
      throw new IpfsError('web3.storage provider not yet implemented', 'INVALID_CONFIG')

    case 'selfhosted':
      // TODO: Implement self-hosted provider
      throw new IpfsError('Self-hosted provider not yet implemented', 'INVALID_CONFIG')

    default:
      throw new IpfsError(
        `Unknown provider type: ${(config as ProviderConfig).type}`,
        'INVALID_CONFIG'
      )
  }
}

/**
 * Validate provider configuration without creating a provider
 */
export async function validateProviderConfig(config: ProviderConfig): Promise<void> {
  const provider = createProvider(config)
  await provider.validateConfig()
}

/**
 * Get human-readable provider name
 */
export function getProviderDisplayName(type: ProviderConfig['type']): string {
  switch (type) {
    case 'pinata':
      return 'Piñata'
    case 'infura':
      return 'Infura'
    case 'web3storage':
      return 'web3.storage'
    case 'selfhosted':
      return 'Self-hosted IPFS'
    default:
      return 'Unknown'
  }
}

/**
 * Get available provider types
 */
export function getAvailableProviders(): Array<{
  type: ProviderConfig['type']
  name: string
  available: boolean
  description: string
}> {
  return [
    {
      type: 'pinata',
      name: 'Piñata',
      available: true,
      description: 'Managed IPFS pinning service with free tier',
    },
    {
      type: 'infura',
      name: 'Infura',
      available: false,
      description: 'Enterprise-grade IPFS infrastructure',
    },
    {
      type: 'web3storage',
      name: 'web3.storage',
      available: false,
      description: 'Decentralized storage backed by Filecoin',
    },
    {
      type: 'selfhosted',
      name: 'Self-hosted IPFS',
      available: false,
      description: 'Connect to your own IPFS node',
    },
  ]
}
