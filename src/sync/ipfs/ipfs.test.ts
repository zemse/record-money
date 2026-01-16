/**
 * IPFS Integration Tests
 *
 * Tests for provider interface, gateway manager, CID manager, and factory functions.
 * Uses mocks since actual IPFS operations require API credentials.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  IpfsError,
  DEFAULT_GATEWAYS,
  createProvider,
  getProviderDisplayName,
  getAvailableProviders,
} from './index'
import { GatewayManager } from './gateway-manager'
import { CidManager } from './cid-manager'
import type { IpfsProvider, PinataConfig } from './types'

// ============================================================================
// Mock Provider for Testing
// ============================================================================

function createMockProvider(): IpfsProvider {
  return {
    type: 'pinata',
    upload: vi.fn().mockResolvedValue({ cid: 'QmTest123', size: 100 }),
    fetch: vi.fn().mockResolvedValue({ data: new Uint8Array([1, 2, 3]), cid: 'QmTest123' }),
    unpin: vi.fn().mockResolvedValue(undefined),
    isPinned: vi.fn().mockResolvedValue(true),
    resolveIpns: vi.fn().mockResolvedValue({ name: 'testname', value: 'QmTest123', sequence: 1 }),
    publishIpns: vi.fn().mockResolvedValue({ name: 'testname', value: 'QmTest123', sequence: 1 }),
    validateConfig: vi.fn().mockResolvedValue(undefined),
  }
}

// ============================================================================
// IpfsError Tests
// ============================================================================

describe('IpfsError', () => {
  it('should create error with message and code', () => {
    const error = new IpfsError('Test error', 'UPLOAD_FAILED')
    expect(error.message).toBe('Test error')
    expect(error.code).toBe('UPLOAD_FAILED')
    expect(error.name).toBe('IpfsError')
  })

  it('should create error with cause', () => {
    const cause = new Error('Original error')
    const error = new IpfsError('Wrapped error', 'FETCH_FAILED', cause)
    expect(error.cause).toBe(cause)
  })
})

// ============================================================================
// Gateway Manager Tests
// ============================================================================

describe('GatewayManager', () => {
  let manager: GatewayManager

  beforeEach(() => {
    manager = new GatewayManager()
  })

  it('should initialize with default gateways', () => {
    const gateways = manager.getGateways()
    expect(gateways.length).toBe(DEFAULT_GATEWAYS.length)
  })

  it('should add new gateway', () => {
    manager.addGateway({ url: 'https://custom.gateway/ipfs/', priority: 0, timeout: 5000 })
    const gateways = manager.getGateways()
    expect(gateways.length).toBe(DEFAULT_GATEWAYS.length + 1)
  })

  it('should not add duplicate gateway', () => {
    const initialCount = manager.getGateways().length
    manager.addGateway(DEFAULT_GATEWAYS[0])
    expect(manager.getGateways().length).toBe(initialCount)
  })

  it('should remove gateway', () => {
    const initialCount = manager.getGateways().length
    manager.removeGateway(DEFAULT_GATEWAYS[0].url)
    expect(manager.getGateways().length).toBe(initialCount - 1)
  })

  it('should track health status for all gateways', () => {
    const healthStatus = manager.getHealthStatus()
    expect(healthStatus.size).toBe(DEFAULT_GATEWAYS.length)

    for (const gateway of DEFAULT_GATEWAYS) {
      expect(healthStatus.has(gateway.url)).toBe(true)
    }
  })

  it('should have zero consecutive failures initially', () => {
    const healthStatus = manager.getHealthStatus()

    for (const health of healthStatus.values()) {
      expect(health.consecutiveFailures).toBe(0)
    }
  })
})

// ============================================================================
// CID Manager Tests
// ============================================================================

describe('CidManager', () => {
  let provider: IpfsProvider
  let manager: CidManager

  beforeEach(() => {
    provider = createMockProvider()
    manager = new CidManager(provider)
  })

  it('should record new CID', async () => {
    await manager.recordCid('test-key', {
      cid: 'QmTest123',
      type: 'manifest',
      createdAt: Date.now(),
    })

    const current = manager.getCurrentCid('test-key')
    expect(current?.cid).toBe('QmTest123')
  })

  it('should move old CID to previous on new record', async () => {
    await manager.recordCid('test-key', {
      cid: 'QmOld',
      type: 'manifest',
      createdAt: Date.now() - 1000,
    })

    await manager.recordCid('test-key', {
      cid: 'QmNew',
      type: 'manifest',
      createdAt: Date.now(),
    })

    const history = manager.getHistory('test-key')
    expect(history?.current?.cid).toBe('QmNew')
    expect(history?.previous.length).toBe(1)
    expect(history?.previous[0].cid).toBe('QmOld')
  })

  it('should unpin old CIDs beyond history limit', async () => {
    // Create a manager with max history of 2
    const smallManager = new CidManager(provider, 2)

    // Add 4 CIDs
    for (let i = 0; i < 4; i++) {
      await smallManager.recordCid('test-key', {
        cid: `QmCid${i}`,
        type: 'manifest',
        createdAt: Date.now() + i,
      })
    }

    // Should have called unpin for old CIDs
    expect(provider.unpin).toHaveBeenCalled()
  })

  it('should return null for unknown key', () => {
    const current = manager.getCurrentCid('unknown-key')
    expect(current).toBeNull()
  })

  it('should export and import history', async () => {
    await manager.recordCid('key1', { cid: 'QmCid1', type: 'manifest', createdAt: Date.now() })
    await manager.recordCid('key2', { cid: 'QmCid2', type: 'database', createdAt: Date.now() })

    const exported = manager.export()
    expect(exported.size).toBe(2)

    // Create new manager and import
    const newManager = new CidManager(provider)
    newManager.import(exported)

    expect(newManager.getCurrentCid('key1')?.cid).toBe('QmCid1')
    expect(newManager.getCurrentCid('key2')?.cid).toBe('QmCid2')
  })

  it('should get all tracked CIDs', async () => {
    await manager.recordCid('key1', { cid: 'QmCid1', type: 'manifest', createdAt: Date.now() })
    await manager.recordCid('key1', { cid: 'QmCid2', type: 'manifest', createdAt: Date.now() })
    await manager.recordCid('key2', { cid: 'QmCid3', type: 'database', createdAt: Date.now() })

    const allCids = manager.getAllCids()
    expect(allCids.length).toBe(3)
  })

  it('should unpin all tracked CIDs', async () => {
    await manager.recordCid(
      'key1',
      { cid: 'QmCid1', type: 'manifest', createdAt: Date.now() },
      false
    )
    await manager.recordCid(
      'key2',
      { cid: 'QmCid2', type: 'database', createdAt: Date.now() },
      false
    )

    await manager.unpinAll()

    expect(provider.unpin).toHaveBeenCalledWith('QmCid1')
    expect(provider.unpin).toHaveBeenCalledWith('QmCid2')
    expect(manager.getAllCids().length).toBe(0)
  })
})

// ============================================================================
// Provider Factory Tests
// ============================================================================

describe('Provider Factory', () => {
  it('should create Piñata provider', () => {
    const config: PinataConfig = {
      type: 'pinata',
      apiKey: 'test-key',
      apiSecret: 'test-secret',
    }

    const provider = createProvider(config)
    expect(provider.type).toBe('pinata')
  })

  it('should throw for unimplemented providers', () => {
    expect(() => createProvider({ type: 'infura', projectId: 'x', projectSecret: 'y' })).toThrow(
      IpfsError
    )
    expect(() => createProvider({ type: 'web3storage', token: 'x' })).toThrow(IpfsError)
    expect(() => createProvider({ type: 'selfhosted', apiUrl: 'x', gatewayUrl: 'y' })).toThrow(
      IpfsError
    )
  })

  it('should return correct display names', () => {
    expect(getProviderDisplayName('pinata')).toBe('Piñata')
    expect(getProviderDisplayName('infura')).toBe('Infura')
    expect(getProviderDisplayName('web3storage')).toBe('web3.storage')
    expect(getProviderDisplayName('selfhosted')).toBe('Self-hosted IPFS')
  })

  it('should return available providers', () => {
    const providers = getAvailableProviders()

    expect(providers.length).toBe(4)
    expect(providers.find((p) => p.type === 'pinata')?.available).toBe(true)
    expect(providers.find((p) => p.type === 'infura')?.available).toBe(false)
  })
})

// ============================================================================
// Default Gateways Tests
// ============================================================================

describe('Default Gateways', () => {
  it('should have valid gateway configurations', () => {
    for (const gateway of DEFAULT_GATEWAYS) {
      expect(gateway.url).toMatch(/^https:\/\//)
      expect(gateway.url).toMatch(/\/ipfs\/$/)
      expect(gateway.priority).toBeGreaterThan(0)
      expect(gateway.timeout).toBeGreaterThan(0)
    }
  })

  it('should have unique URLs', () => {
    const urls = DEFAULT_GATEWAYS.map((g) => g.url)
    const uniqueUrls = [...new Set(urls)]
    expect(urls.length).toBe(uniqueUrls.length)
  })

  it('should have unique priorities', () => {
    const priorities = DEFAULT_GATEWAYS.map((g) => g.priority)
    const uniquePriorities = [...new Set(priorities)]
    expect(priorities.length).toBe(uniquePriorities.length)
  })
})
