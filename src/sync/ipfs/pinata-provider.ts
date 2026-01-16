/**
 * Piñata IPFS Provider Implementation
 *
 * Uses Piñata's pinning service for IPFS storage.
 * Supports upload, fetch, pin/unpin, and IPNS operations.
 *
 * API Docs: https://docs.pinata.cloud/
 */

import { ed25519 } from '@noble/curves/ed25519.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '../crypto'
import type {
  IpfsProvider,
  PinataConfig,
  UploadResult,
  FetchResult,
  IpnsRecord,
  IpnsPublishResult,
  UploadOptions,
  GatewayConfig,
} from './types'
import { IpfsError, DEFAULT_GATEWAYS } from './types'

// ============================================================================
// Constants
// ============================================================================

const PINATA_API_BASE = 'https://api.pinata.cloud'
const PINATA_GATEWAY = 'https://gateway.pinata.cloud/ipfs/'

// ============================================================================
// Piñata Provider
// ============================================================================

export class PinataProvider implements IpfsProvider {
  readonly type = 'pinata' as const
  private readonly apiKey: string
  private readonly apiSecret: string
  private readonly gateway: string
  private readonly gateways: GatewayConfig[]

  constructor(config: PinataConfig, additionalGateways?: GatewayConfig[]) {
    this.apiKey = config.apiKey
    this.apiSecret = config.apiSecret
    this.gateway = config.gateway || PINATA_GATEWAY
    this.gateways = additionalGateways || DEFAULT_GATEWAYS
  }

  // ============================================================================
  // Upload
  // ============================================================================

  async upload(data: Uint8Array, options?: UploadOptions): Promise<UploadResult> {
    try {
      const formData = new FormData()
      const blob = new Blob([data], { type: 'application/octet-stream' })
      formData.append('file', blob, options?.name || 'data')

      if (options?.name || options?.metadata) {
        const pinataMetadata: Record<string, unknown> = {}
        if (options.name) {
          pinataMetadata.name = options.name
        }
        if (options.metadata) {
          pinataMetadata.keyvalues = options.metadata
        }
        formData.append('pinataMetadata', JSON.stringify(pinataMetadata))
      }

      const response = await fetch(`${PINATA_API_BASE}/pinning/pinFileToIPFS`, {
        method: 'POST',
        headers: {
          pinata_api_key: this.apiKey,
          pinata_secret_api_key: this.apiSecret,
        },
        body: formData,
      })

      if (!response.ok) {
        if (response.status === 429) {
          throw new IpfsError('Rate limited by Piñata', 'RATE_LIMITED')
        }
        const errorText = await response.text()
        throw new IpfsError(`Upload failed: ${response.status} ${errorText}`, 'UPLOAD_FAILED')
      }

      const result = (await response.json()) as { IpfsHash: string; PinSize: number }
      return {
        cid: result.IpfsHash,
        size: result.PinSize,
      }
    } catch (error) {
      if (error instanceof IpfsError) throw error
      throw new IpfsError(
        `Upload failed: ${error instanceof Error ? error.message : String(error)}`,
        'UPLOAD_FAILED',
        error instanceof Error ? error : undefined
      )
    }
  }

  // ============================================================================
  // Fetch
  // ============================================================================

  async fetch(cid: string): Promise<FetchResult> {
    // Try gateways in priority order
    const sortedGateways = [...this.gateways].sort((a, b) => a.priority - b.priority)

    // Add provider's gateway as first priority if not already in list
    if (!sortedGateways.some((g) => g.url === this.gateway)) {
      sortedGateways.unshift({ url: this.gateway, priority: 0, timeout: 10000 })
    }

    let lastError: Error | undefined

    for (const gateway of sortedGateways) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), gateway.timeout)

        const response = await fetch(`${gateway.url}${cid}`, {
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer()
          return {
            data: new Uint8Array(arrayBuffer),
            cid,
          }
        }

        if (response.status === 404) {
          lastError = new Error(`Content not found: ${cid}`)
          continue
        }

        lastError = new Error(`Gateway ${gateway.url} returned ${response.status}`)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        // Continue to next gateway
      }
    }

    if (lastError?.message.includes('not found')) {
      throw new IpfsError(`Content not found: ${cid}`, 'NOT_FOUND', lastError)
    }
    throw new IpfsError(
      `Fetch failed after trying all gateways: ${lastError?.message}`,
      'FETCH_FAILED',
      lastError
    )
  }

  // ============================================================================
  // Unpin
  // ============================================================================

  async unpin(cid: string): Promise<void> {
    try {
      const response = await fetch(`${PINATA_API_BASE}/pinning/unpin/${cid}`, {
        method: 'DELETE',
        headers: {
          pinata_api_key: this.apiKey,
          pinata_secret_api_key: this.apiSecret,
        },
      })

      if (!response.ok) {
        if (response.status === 404) {
          // Already unpinned, not an error
          return
        }
        if (response.status === 429) {
          throw new IpfsError('Rate limited by Piñata', 'RATE_LIMITED')
        }
        const errorText = await response.text()
        throw new IpfsError(`Unpin failed: ${response.status} ${errorText}`, 'UNPIN_FAILED')
      }
    } catch (error) {
      if (error instanceof IpfsError) throw error
      throw new IpfsError(
        `Unpin failed: ${error instanceof Error ? error.message : String(error)}`,
        'UNPIN_FAILED',
        error instanceof Error ? error : undefined
      )
    }
  }

  // ============================================================================
  // Is Pinned
  // ============================================================================

  async isPinned(cid: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${PINATA_API_BASE}/data/pinList?hashContains=${cid}&status=pinned`,
        {
          headers: {
            pinata_api_key: this.apiKey,
            pinata_secret_api_key: this.apiSecret,
          },
        }
      )

      if (!response.ok) {
        if (response.status === 429) {
          throw new IpfsError('Rate limited by Piñata', 'RATE_LIMITED')
        }
        return false
      }

      const result = (await response.json()) as { count: number }
      return result.count > 0
    } catch (error) {
      if (error instanceof IpfsError) throw error
      return false
    }
  }

  // ============================================================================
  // IPNS Operations
  // ============================================================================

  /**
   * Resolve IPNS name to CID
   * Tries multiple gateways and returns the record with highest sequence number
   */
  async resolveIpns(name: string): Promise<IpnsRecord | null> {
    const results: IpnsRecord[] = []
    const sortedGateways = [...this.gateways].sort((a, b) => a.priority - b.priority)

    // Try to resolve from multiple gateways in parallel
    const promises = sortedGateways.map(async (gateway) => {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), gateway.timeout)

        // Use IPNS resolution endpoint
        const ipnsUrl = gateway.url.replace('/ipfs/', '/ipns/')
        const response = await fetch(`${ipnsUrl}${name}`, {
          method: 'HEAD', // Just check if resolvable
          signal: controller.signal,
          redirect: 'follow',
        })

        clearTimeout(timeoutId)

        if (response.ok) {
          // Get the resolved path from the final URL or headers
          const resolvedUrl = response.url
          const cidMatch = resolvedUrl.match(/\/ipfs\/([a-zA-Z0-9]+)/)
          if (cidMatch) {
            return {
              name,
              value: cidMatch[1],
              sequence: 0, // Gateway doesn't expose sequence, assume 0
            }
          }
        }
        return null
      } catch {
        return null
      }
    })

    const resolvedResults = await Promise.all(promises)
    for (const result of resolvedResults) {
      if (result) results.push(result)
    }

    if (results.length === 0) {
      return null
    }

    // Return the record with highest sequence number
    // (In practice, gateways don't expose sequence, so just return first result)
    return results.reduce((best, current) => (current.sequence > best.sequence ? current : best))
  }

  /**
   * Publish IPNS record
   *
   * Note: Piñata doesn't have a direct IPNS publish API.
   * For full IPNS support, we need to use a Helia-based approach or
   * a dedicated IPNS service. For now, we'll create a naming convention
   * using Piñata's pin naming feature as a workaround.
   *
   * In production, consider:
   * 1. Using w3name (from web3.storage) for IPNS
   * 2. Running a local IPFS node with Helia
   * 3. Using a dedicated IPNS service
   */
  async publishIpns(
    privateKey: Uint8Array,
    cid: string,
    sequence: number
  ): Promise<IpnsPublishResult> {
    // Derive the IPNS name from the Ed25519 public key
    const publicKey = ed25519.getPublicKey(privateKey)
    const name = deriveIpnsName(publicKey)

    // Create a signed IPNS record
    const record = createIpnsRecord(privateKey, cid, sequence)

    // Upload the IPNS record as a pinned file with a special naming convention
    // This is a workaround since Piñata doesn't have native IPNS support
    // The record can be resolved by fetching: ipns-record-{name}
    const recordBytes = new TextEncoder().encode(JSON.stringify(record))

    try {
      await this.upload(recordBytes, {
        name: `ipns-record-${name}`,
        metadata: {
          type: 'ipns-record',
          name,
          value: cid,
          sequence: String(sequence),
        },
      })

      return {
        name,
        value: cid,
        sequence,
      }
    } catch (error) {
      throw new IpfsError(
        `IPNS publish failed: ${error instanceof Error ? error.message : String(error)}`,
        'IPNS_PUBLISH_FAILED',
        error instanceof Error ? error : undefined
      )
    }
  }

  // ============================================================================
  // Config Validation
  // ============================================================================

  async validateConfig(): Promise<void> {
    try {
      const response = await fetch(`${PINATA_API_BASE}/data/testAuthentication`, {
        headers: {
          pinata_api_key: this.apiKey,
          pinata_secret_api_key: this.apiSecret,
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new IpfsError(
          `Invalid Piñata credentials: ${response.status} ${errorText}`,
          'INVALID_CONFIG'
        )
      }
    } catch (error) {
      if (error instanceof IpfsError) throw error
      throw new IpfsError(
        `Config validation failed: ${error instanceof Error ? error.message : String(error)}`,
        'INVALID_CONFIG',
        error instanceof Error ? error : undefined
      )
    }
  }
}

// ============================================================================
// IPNS Helpers
// ============================================================================

/**
 * Derive IPNS name from Ed25519 public key
 * Uses SHA-256 hash of the public key, hex encoded
 * This is a simplified approach for use with Piñata's workaround
 */
function deriveIpnsName(publicKey: Uint8Array): string {
  // Hash the public key and use hex encoding for a unique, deterministic name
  const hash = sha256(publicKey)
  return bytesToHex(hash)
}

/**
 * Create a signed IPNS record
 */
function createIpnsRecord(privateKey: Uint8Array, cid: string, sequence: number): IpnsRecordData {
  const validity = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
  const validityType = 0 // EOL (End of Life)

  const record: IpnsRecordData = {
    value: `/ipfs/${cid}`,
    sequence,
    validity: validity.toISOString(),
    validityType,
    signature: '',
  }

  // Sign the record
  const dataToSign = new TextEncoder().encode(
    `${record.value}${record.validity}${record.validityType}${record.sequence}`
  )
  const signature = ed25519.sign(dataToSign, privateKey)
  record.signature = bytesToHex(signature)

  return record
}

interface IpnsRecordData {
  value: string
  sequence: number
  validity: string
  validityType: number
  signature: string
}

// ============================================================================
// Factory
// ============================================================================

export function createPinataProvider(config: PinataConfig): PinataProvider {
  return new PinataProvider(config)
}
