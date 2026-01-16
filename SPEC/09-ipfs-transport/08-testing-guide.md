# P2P Sync Testing Guide

## Setup

For multi-device testing, use:
- Multiple browser profiles (Chrome profiles)
- Incognito + normal window
- Different browsers (Chrome + Firefox)

Each "device" needs its own IndexedDB storage, hence separate browser profiles.

## Test Scenarios

### 1. Multi-Device Sync

**Setup:**
1. Open app in Browser Profile A
2. Complete sync setup with Pinata provider
3. Open app in Browser Profile B
4. Pair devices using QR code flow

**Test:**
1. Create record in Profile A
2. Wait for sync (or click manual sync)
3. Verify record appears in Profile B
4. Edit record in Profile B
5. Verify edit appears in Profile A

**Expected:**
- Records sync within 15 seconds (foreground polling)
- Same UUID preserved across devices
- Timestamps and metadata match

### 2. Multi-User Groups

**Setup:**
1. Device A: Create user, setup sync
2. Device B: Create different user, setup sync
3. Device A: Create group "Roommates"
4. Device A: Generate invite link
5. Device B: Open invite link, verify emojis, join

**Test:**
1. Device A: Create shared expense
2. Verify appears in Device B
3. Device B: Create shared expense
4. Verify appears in Device A

**Expected:**
- Both users see all group records
- Records show correct "paid by" and "paid for"
- Group membership correct on both devices

### 3. Conflict Resolution

**Setup:**
1. Pair two devices (A and B)
2. Create record on Device A, let it sync

**Test - Binary Conflict:**
1. Put both devices offline (airplane mode or dev tools)
2. Edit same record on both devices (different amounts)
3. Bring both devices online
4. Wait for sync
5. Conflict UI should appear
6. Pick winner, verify resolution syncs

**Test - Multi-Device Conflict:**
1. With 3+ devices paired
2. Edit same field on all devices while offline
3. Bring all online
4. Conflict UI shows all values
5. Pick winner

**Expected:**
- Conflict detected automatically
- All values shown with device names
- Resolution mutation syncs to all devices
- Voided mutations not applied

### 4. Device/Member Removal

**Test - Device Removal:**
1. Pair devices A, B, C
2. From Device A: Remove Device B
3. Verify B can no longer decrypt new data
4. Verify A and C continue syncing

**Test - Member Removal:**
1. Create group with Users A and B
2. User A: Remove User B from group
3. Verify B can't decrypt new group data
4. Verify A's key rotated

**Expected:**
- Removed device/member loses access to new data
- Keys rotated on remaining devices
- Old data preserved locally on removed device

### 5. Offline/Online Transitions

**Test:**
1. Pair two devices
2. Take Device B offline
3. Create 10+ records on Device A
4. Bring Device B online
5. Verify all records sync

**Expected:**
- Mutation chunks contain all changes
- No data loss during offline period
- Sync catches up within reasonable time

### 6. Adaptive Polling

**Test - Foreground:**
1. Watch network tab while app in foreground
2. Verify polling every ~15 seconds

**Test - Background:**
1. Switch to different tab
2. Watch network tab
3. Verify polling slows to ~5 minutes

**Test - Rate Limit:**
1. Configure provider to return 429 errors
2. Verify exponential backoff
3. Verify recovery when rate limit clears

**Expected:**
- Foreground: 15 second intervals
- Background: 5 minute intervals
- Backoff on 429s
- Pause when tab hidden

## Automated Unit Tests

The following are covered by unit tests (328 tests total):

- Crypto operations (key generation, ECDH, AES-GCM)
- Mutation signing and verification
- Schema serialization/deserialization
- Device setup flow
- Pairing handshake
- Migration of solo data
- Sync engine state management
- Conflict detection and resolution
- Publishing service
- Groups service
- Security service

Run tests with: `npm run test`

## Checklist

- [ ] Multi-device sync works bidirectionally
- [ ] New user can join via invite link
- [ ] Emoji verification matches on both devices
- [ ] Conflicts detected and UI shows all values
- [ ] Conflict resolution syncs to all devices
- [ ] Device removal triggers key rotation
- [ ] Removed device loses access to new data
- [ ] Offline changes sync when back online
- [ ] Polling adapts to foreground/background
- [ ] Rate limiting handled gracefully
