/**
 * Sync Engine Tests
 *
 * Tests for the sync engine including polling, visibility, and backoff.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ============================================================================
// Mocks
// ============================================================================

const mockGetSyncConfig = vi.fn()
const mockUpdateSyncConfig = vi.fn()
const mockGetPendingMutations = vi.fn()
const mockMarkMutationsPublished = vi.fn()
const mockGetAllPeerSyncStates = vi.fn()
const mockUpdatePeerSyncState = vi.fn()
const mockGetDeviceKeys = vi.fn()

// Mock db module
vi.mock('../db', () => ({
  db: {},
  getSyncConfig: () => mockGetSyncConfig(),
  updateSyncConfig: (updates: unknown) => mockUpdateSyncConfig(updates),
  getPendingMutations: () => mockGetPendingMutations(),
  markMutationsPublished: (ids: number[]) => mockMarkMutationsPublished(ids),
  getAllPeerSyncStates: () => mockGetAllPeerSyncStates(),
  updatePeerSyncState: (deviceId: string, updates: unknown) =>
    mockUpdatePeerSyncState(deviceId, updates),
  getDeviceKeys: () => mockGetDeviceKeys(),
}))

// Mock device setup
const mockGetConfiguredProvider = vi.fn()
const mockGetDeviceKeysAsBytes = vi.fn()

vi.mock('./device-setup', () => ({
  getConfiguredProvider: () => mockGetConfiguredProvider(),
  getDeviceKeysAsBytes: () => mockGetDeviceKeysAsBytes(),
}))

// Mock schemas
vi.mock('./schemas', () => ({
  deserializeDeviceManifest: vi.fn(),
  decryptDeviceManifest: vi.fn(),
  decryptDeviceRing: vi.fn(),
  findChunksToSync: vi.fn().mockReturnValue([]),
  decryptMutationChunk: vi.fn().mockReturnValue([]),
  createDeviceManifest: vi.fn(),
  serializeDeviceManifest: vi.fn().mockReturnValue(new Uint8Array()),
  createEncryptedDeviceRing: vi.fn().mockResolvedValue(new Uint8Array()),
  createEncryptedMutationChunk: vi.fn().mockResolvedValue(new Uint8Array()),
  createMutationChunk: vi.fn(),
}))

// Mock mutations
vi.mock('./mutations', () => ({
  verifyMutation: vi.fn().mockReturnValue(true),
  deserializeMutation: vi.fn(),
}))

// Mock crypto
vi.mock('./crypto', () => ({
  base64ToBytes: vi.fn().mockReturnValue(new Uint8Array(32)),
  bytesToBase64: vi.fn().mockReturnValue('base64string'),
}))

// ============================================================================
// Tests
// ============================================================================

describe('SyncEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    // Default mock returns
    mockGetSyncConfig.mockResolvedValue({ mode: 'synced', personalKey: 'key', broadcastKey: 'key' })
    mockGetPendingMutations.mockResolvedValue([])
    mockGetAllPeerSyncStates.mockResolvedValue([])
    mockGetConfiguredProvider.mockResolvedValue(null)
    mockGetDeviceKeysAsBytes.mockResolvedValue({
      ipnsPrivateKey: new Uint8Array(32),
      ipnsPublicKey: new Uint8Array(32),
      authPrivateKey: new Uint8Array(32),
      authPublicKey: new Uint8Array(65),
      deviceId: 'test-device-id',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('lifecycle', () => {
    it('should start when sync is enabled', async () => {
      mockGetSyncConfig.mockResolvedValue({
        mode: 'synced',
        personalKey: 'key',
        broadcastKey: 'key',
      })

      const { SyncEngine } = await import('./sync-engine')
      const engine = new SyncEngine()

      await engine.start()

      expect(engine.getState().isRunning).toBe(true)
    })

    it('should not start when sync is not enabled', async () => {
      mockGetSyncConfig.mockResolvedValue({ mode: 'solo' })

      const { SyncEngine } = await import('./sync-engine')
      const engine = new SyncEngine()

      await engine.start()

      expect(engine.getState().isRunning).toBe(false)
    })

    it('should stop correctly', async () => {
      mockGetSyncConfig.mockResolvedValue({
        mode: 'synced',
        personalKey: 'key',
        broadcastKey: 'key',
      })

      const { SyncEngine } = await import('./sync-engine')
      const engine = new SyncEngine()

      await engine.start()
      expect(engine.getState().isRunning).toBe(true)

      engine.stop()
      expect(engine.getState().isRunning).toBe(false)
    })
  })

  describe('sync', () => {
    it('should perform sync cycle', async () => {
      mockGetSyncConfig.mockResolvedValue({
        mode: 'synced',
        personalKey: 'a2V5',
        broadcastKey: 'a2V5',
      })

      const { SyncEngine } = await import('./sync-engine')
      const engine = new SyncEngine()

      const result = await engine.sync()

      expect(result.success).toBe(true)
      expect(result.newMutations).toBe(0)
      expect(result.conflicts).toHaveLength(0)
    })

    it('should not run concurrent syncs', async () => {
      mockGetSyncConfig.mockResolvedValue({
        mode: 'synced',
        personalKey: 'a2V5',
        broadcastKey: 'a2V5',
      })

      const { SyncEngine } = await import('./sync-engine')
      const engine = new SyncEngine()

      // Start first sync
      const sync1Promise = engine.sync()

      // Try to start second sync immediately
      const result2 = await engine.sync()

      // Second sync should be rejected
      expect(result2.success).toBe(false)

      // Wait for first sync
      await sync1Promise
    })
  })

  describe('event listeners', () => {
    it('should emit events', async () => {
      mockGetSyncConfig.mockResolvedValue({
        mode: 'synced',
        personalKey: 'a2V5',
        broadcastKey: 'a2V5',
      })

      const { SyncEngine } = await import('./sync-engine')
      const engine = new SyncEngine()

      const events: string[] = []
      engine.addEventListener((event) => {
        events.push(event)
      })

      await engine.sync()

      expect(events).toContain('sync_start')
      expect(events).toContain('sync_complete')
      expect(events).toContain('state_change')
    })

    it('should allow removing listeners', async () => {
      mockGetSyncConfig.mockResolvedValue({
        mode: 'synced',
        personalKey: 'a2V5',
        broadcastKey: 'a2V5',
      })

      const { SyncEngine } = await import('./sync-engine')
      const engine = new SyncEngine()

      const events: string[] = []
      const unsubscribe = engine.addEventListener((event) => {
        events.push(event)
      })

      unsubscribe()
      await engine.sync()

      expect(events).toHaveLength(0)
    })
  })

  describe('backoff', () => {
    it('should increment failure count on error', async () => {
      mockGetSyncConfig.mockResolvedValue({
        mode: 'synced',
        personalKey: 'a2V5',
        broadcastKey: 'a2V5',
      })
      mockGetPendingMutations.mockRejectedValue(new Error('Test error'))

      const { SyncEngine } = await import('./sync-engine')
      const engine = new SyncEngine()

      await engine.sync()

      expect(engine.getState().consecutiveFailures).toBe(1)
      expect(engine.getState().lastError).toBe('Test error')
    })

    it('should reset failure count on success', async () => {
      mockGetSyncConfig.mockResolvedValue({
        mode: 'synced',
        personalKey: 'a2V5',
        broadcastKey: 'a2V5',
      })

      const { SyncEngine } = await import('./sync-engine')
      const engine = new SyncEngine()

      // Manually set failure count
      ;(engine as any).state.consecutiveFailures = 5

      await engine.sync()

      expect(engine.getState().consecutiveFailures).toBe(0)
    })

    it('should reset failure count on manual sync', async () => {
      mockGetSyncConfig.mockResolvedValue({
        mode: 'synced',
        personalKey: 'a2V5',
        broadcastKey: 'a2V5',
      })

      const { SyncEngine } = await import('./sync-engine')
      const engine = new SyncEngine()

      // Manually set failure count
      ;(engine as any).state.consecutiveFailures = 5

      await engine.manualSync()

      expect(engine.getState().consecutiveFailures).toBe(0)
    })
  })

  describe('state', () => {
    it('should track last sync time', async () => {
      mockGetSyncConfig.mockResolvedValue({
        mode: 'synced',
        personalKey: 'a2V5',
        broadcastKey: 'a2V5',
      })

      const { SyncEngine } = await import('./sync-engine')
      const engine = new SyncEngine()

      const beforeSync = Date.now()
      await engine.sync()
      const afterSync = Date.now()

      const lastSyncAt = engine.getState().lastSyncAt
      expect(lastSyncAt).toBeGreaterThanOrEqual(beforeSync)
      expect(lastSyncAt).toBeLessThanOrEqual(afterSync)
    })

    it('should return copy of state', async () => {
      const { SyncEngine } = await import('./sync-engine')
      const engine = new SyncEngine()

      const state1 = engine.getState()
      const state2 = engine.getState()

      expect(state1).not.toBe(state2)
      expect(state1).toEqual(state2)
    })
  })
})

describe('Singleton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('should return same instance', async () => {
    const { getSyncEngine } = await import('./sync-engine')

    const engine1 = getSyncEngine()
    const engine2 = getSyncEngine()

    expect(engine1).toBe(engine2)
  })
})
