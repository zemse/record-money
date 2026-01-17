# Milestone 8: P2P Sync

## 8.1 Crypto Foundation
- [x] P-256 keygen, ECDH, AES-GCM helpers
- [x] Ed25519 keygen for IPNS
- [x] Personal Key + Broadcast Key generation
- [x] Mutation signing/verification
- [x] Canonical JSON

## 8.2 IPFS Integration
- [x] Pluggable pinning provider interface
- [x] Piñata provider implementation
- [ ] Infura provider implementation (optional)
- [ ] web3.storage provider implementation (optional)
- [ ] Self-hosted IPFS provider implementation (optional)
- [x] Upload, fetch, IPNS resolve/update
- [x] Multi-gateway (highest seq)
- [x] Unpin old CIDs

## 8.3 Data Structures
- [x] DeviceManifest, DeviceRing, PeerDirectory schemas
- [x] Mutation, GroupManifest schemas
- [x] IndexedDB updates for sync metadata
- [x] Provider config storage

## 8.4 Device Setup
- [x] First-time setup UI
- [x] Provider selection and config input
- [x] Key generation
- [x] Initial manifest publish

## 8.5 Device Pairing
- [x] QR gen/scan with provider config (backend)
- [x] Temp IPNS handshake (backend)
- [x] Emoji verification (backend)
- [x] PeerDirectory update (share Personal Key + Broadcast Key)
- [x] DeviceRing update
- [x] Solo data migration (seal existing records as mutations)
- [x] QR generation and scanning UI
- [x] Emoji verification UI
- [x] Migration progress UI for large datasets

## 8.6 Sync Engine
- [x] Adaptive polling (15s foreground, 5min background)
- [x] Manual sync button
- [x] Page visibility detection (pause when hidden)
- [x] Rate limit backoff
- [x] Change detection
- [x] Mutation fetch/verify/apply
- [x] Dedup by uuid
- [x] Sync state tracking

## 8.7 Conflict Resolution
- [x] Conflict detection
- [x] Binary conflict UI (2 devices)
- [x] Multi-device conflict UI (3+ devices, show all values)
- [x] Bulk scroll UI
- [x] Override mutation creation

## 8.8 Publishing
- [x] Mutation creation on local CRUD
- [x] Mutations management
- [x] Manifest rebuild + publish
- [x] Full replication of imported mutations

## 8.9 Groups
- [x] Create group (Group Key generation, group mutation)
- [x] Personal Ledger (special self-only group)
- [x] Invite existing peer (PeerDirectory)
- [x] Invite link generation (without Group Key)
- [x] Join request flow
- [x] Invite approval UI
- [x] Group sync (GroupManifest polling)
- [x] Member add/remove
- [x] Key rotation (event-based only)
- [x] Exit group (voluntary departure with archived data)

## 8.10 Security
- [x] Device removal + key rotation
- [x] Event-based key rotation (no time-based)
- [x] Malformed content handling
- [x] Fork group flow

## 8.11 UI
- [x] Sync status indicator with manual sync button
- [x] Device management
- [x] Pairing flow
- [x] Group members
- [x] Pending invite approvals
- [x] Conflict notifications

## 8.12 Testing
- [x] Multi-device sync (manual testing guide)
- [x] Multi-user groups (manual testing guide)
- [x] Conflicts (binary and multi-device) (manual testing guide)
- [x] Device/member removal and key rotation (manual testing guide)
- [x] Offline/online transitions (manual testing guide)
- [x] Adaptive polling behavior (manual testing guide)

See `08-testing-guide.md` for detailed manual testing scenarios.

**Review gate after each section**

## Development Notes

Use mock pinning provider for unit tests. For multi-device testing: use multiple browser profiles or incognito + normal window.

## Implementation Summary

- 328 unit tests covering all core functionality
- Manual testing guide for multi-device integration scenarios
- All services implemented with TypeScript types
- QR code support: qrcode.react for generation, html5-qrcode for camera scanning
