/**
 * Multi-Gateway Manager
 *
 * Provides robust content fetching across multiple IPFS gateways.
 * Supports fallback, timeout, and prioritized gateway selection.
 */

import type { GatewayConfig, FetchResult, IpnsRecord } from './types'
import { IpfsError, DEFAULT_GATEWAYS } from './types'

// ============================================================================
// Gateway Manager
// ============================================================================

export class GatewayManager {
  private gateways: GatewayConfig[]
  private healthStatus: Map<string, GatewayHealth> = new Map()

  constructor(gateways: GatewayConfig[] = DEFAULT_GATEWAYS) {
    this.gateways = [...gateways].sort((a, b) => a.priority - b.priority)

    // Initialize health status for all gateways
    for (const gateway of this.gateways) {
      this.healthStatus.set(gateway.url, {
        lastSuccess: 0,
        lastFailure: 0,
        consecutiveFailures: 0,
      })
    }
  }

  /**
   * Fetch content from the first available gateway
   * Tries gateways in priority order, skipping unhealthy ones
   */
  async fetch(cid: string): Promise<FetchResult> {
    const sortedGateways = this.getSortedGateways()
    let lastError: Error | undefined

    for (const gateway of sortedGateways) {
      try {
        const result = await this.fetchFromGateway(gateway, cid)
        this.recordSuccess(gateway.url)
        return result
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        this.recordFailure(gateway.url)
        // Continue to next gateway
      }
    }

    throw new IpfsError(
      `Fetch failed after trying all gateways: ${lastError?.message}`,
      'FETCH_FAILED',
      lastError
    )
  }

  /**
   * Fetch content from a specific gateway
   */
  private async fetchFromGateway(gateway: GatewayConfig, cid: string): Promise<FetchResult> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), gateway.timeout)

    try {
      const response = await fetch(`${gateway.url}${cid}`, {
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        if (response.status === 404) {
          throw new IpfsError(`Content not found: ${cid}`, 'NOT_FOUND')
        }
        throw new Error(`Gateway returned ${response.status}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      return {
        data: new Uint8Array(arrayBuffer),
        cid,
      }
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof IpfsError) throw error
      if (error instanceof Error && error.name === 'AbortError') {
        throw new IpfsError(`Gateway timeout: ${gateway.url}`, 'TIMEOUT')
      }
      throw error
    }
  }

  /**
   * Resolve IPNS from multiple gateways in parallel
   * Returns the record with the highest sequence number
   */
  async resolveIpnsHighestSeq(name: string): Promise<IpnsRecord | null> {
    const sortedGateways = this.getSortedGateways()

    // Try all gateways in parallel
    const promises = sortedGateways.map((gateway) =>
      this.resolveIpnsFromGateway(gateway, name).catch(() => null)
    )

    const results = await Promise.all(promises)
    const validResults = results.filter((r): r is IpnsRecord => r !== null)

    if (validResults.length === 0) {
      return null
    }

    // Return the record with highest sequence number
    return validResults.reduce((best, current) =>
      current.sequence > best.sequence ? current : best
    )
  }

  /**
   * Resolve IPNS from a specific gateway
   */
  private async resolveIpnsFromGateway(
    gateway: GatewayConfig,
    name: string
  ): Promise<IpnsRecord | null> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), gateway.timeout)

    try {
      // Convert IPFS gateway URL to IPNS
      const ipnsUrl = gateway.url.replace('/ipfs/', '/ipns/')
      const response = await fetch(`${ipnsUrl}${name}`, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'follow',
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        return null
      }

      // Extract CID from the final URL
      const resolvedUrl = response.url
      const cidMatch = resolvedUrl.match(/\/ipfs\/([a-zA-Z0-9]+)/)
      if (cidMatch) {
        this.recordSuccess(gateway.url)
        return {
          name,
          value: cidMatch[1],
          sequence: 0, // Gateways don't expose sequence number
        }
      }

      return null
    } catch {
      clearTimeout(timeoutId)
      this.recordFailure(gateway.url)
      return null
    }
  }

  /**
   * Get gateways sorted by health and priority
   * Unhealthy gateways are moved to the end
   */
  private getSortedGateways(): GatewayConfig[] {
    const now = Date.now()

    return [...this.gateways].sort((a, b) => {
      const healthA = this.healthStatus.get(a.url)!
      const healthB = this.healthStatus.get(b.url)!

      // Penalize gateways with recent failures
      const penaltyA = this.calculatePenalty(healthA, now)
      const penaltyB = this.calculatePenalty(healthB, now)

      return a.priority + penaltyA - (b.priority + penaltyB)
    })
  }

  /**
   * Calculate penalty score for a gateway based on its health
   */
  private calculatePenalty(health: GatewayHealth, now: number): number {
    // No penalty if no failures or last success was after last failure
    if (health.consecutiveFailures === 0 || health.lastSuccess > health.lastFailure) {
      return 0
    }

    // Penalty decays over time (halves every minute)
    const timeSinceFailure = now - health.lastFailure
    const decayFactor = Math.pow(0.5, timeSinceFailure / 60000)

    // Base penalty is proportional to consecutive failures (max 100)
    const basePenalty = Math.min(health.consecutiveFailures * 10, 100)

    return basePenalty * decayFactor
  }

  /**
   * Record a successful request to a gateway
   */
  private recordSuccess(url: string): void {
    const health = this.healthStatus.get(url)
    if (health) {
      health.lastSuccess = Date.now()
      health.consecutiveFailures = 0
    }
  }

  /**
   * Record a failed request to a gateway
   */
  private recordFailure(url: string): void {
    const health = this.healthStatus.get(url)
    if (health) {
      health.lastFailure = Date.now()
      health.consecutiveFailures++
    }
  }

  /**
   * Add a new gateway
   */
  addGateway(gateway: GatewayConfig): void {
    if (!this.gateways.some((g) => g.url === gateway.url)) {
      this.gateways.push(gateway)
      this.gateways.sort((a, b) => a.priority - b.priority)
      this.healthStatus.set(gateway.url, {
        lastSuccess: 0,
        lastFailure: 0,
        consecutiveFailures: 0,
      })
    }
  }

  /**
   * Remove a gateway
   */
  removeGateway(url: string): void {
    this.gateways = this.gateways.filter((g) => g.url !== url)
    this.healthStatus.delete(url)
  }

  /**
   * Get current gateway list
   */
  getGateways(): GatewayConfig[] {
    return [...this.gateways]
  }

  /**
   * Get health status for all gateways
   */
  getHealthStatus(): Map<string, GatewayHealth> {
    return new Map(this.healthStatus)
  }
}

// ============================================================================
// Types
// ============================================================================

interface GatewayHealth {
  lastSuccess: number // timestamp of last successful request
  lastFailure: number // timestamp of last failed request
  consecutiveFailures: number // number of consecutive failures
}

// ============================================================================
// Factory
// ============================================================================

export function createGatewayManager(gateways?: GatewayConfig[]): GatewayManager {
  return new GatewayManager(gateways)
}
