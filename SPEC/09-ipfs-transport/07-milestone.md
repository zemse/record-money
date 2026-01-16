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
- [ ] Binary conflict UI (2 devices)
- [ ] Multi-device conflict UI (3+ devices, show all values)
- [ ] Bulk scroll UI
- [ ] Override mutation creation

## 8.8 Publishing
- [ ] Mutation creation on local CRUD
- [ ] Mutations management
- [ ] Manifest rebuild + publish
- [ ] Full replication of imported mutations

## 8.9 Groups
- [ ] Create group (Group Key generation, group mutation)
- [ ] Personal Ledger (special self-only group)
- [ ] Invite existing peer (PeerDirectory)
- [ ] Invite link generation (without Group Key)
- [ ] Join request flow
- [ ] Invite approval UI
- [ ] Group sync (GroupManifest polling)
- [ ] Member add/remove
- [ ] Key rotation (event-based only)
- [ ] Exit group (voluntary departure with archived data)

## 8.10 Security
- [ ] Device removal + key rotation
- [ ] Event-based key rotation (no time-based)
- [ ] Malformed content handling
- [ ] Fork group flow

## 8.11 UI
- [x] Sync status indicator with manual sync button
- [ ] Device management
- [x] Pairing flow
- [ ] Group members
- [ ] Pending invite approvals
- [ ] Conflict notifications

## 8.12 Testing
- [ ] Multi-device sync
- [ ] Multi-user groups
- [ ] Conflicts (binary and multi-device)
- [ ] Device/member removal and key rotation
- [ ] Offline/online transitions
- [ ] Adaptive polling behavior

**Review gate after each section**

## Development Notes

Use mock pinning provider for unit tests. For multi-device testing: use multiple browser profiles or incognito + normal window.
