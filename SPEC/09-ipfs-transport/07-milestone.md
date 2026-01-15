# Milestone 8: P2P Sync

## 8.1 Crypto Foundation
- [ ] P-256 keygen, ECDH, AES-GCM helpers
- [ ] Mutation signing/verification
- [ ] Canonical JSON

## 8.2 IPFS Integration
- [ ] Pluggable pinning provider interface
- [ ] Piñata provider implementation
- [ ] Infura provider implementation (optional)
- [ ] web3.storage provider implementation (optional)
- [ ] Self-hosted IPFS provider implementation (optional)
- [ ] Upload, fetch, IPNS resolve/update
- [ ] Multi-gateway (highest seq)
- [ ] Unpin old CIDs

## 8.3 Data Structures
- [ ] DeviceManifest, DeviceRing, PeerDirectory schemas
- [ ] Mutation, GroupManifest schemas
- [ ] IndexedDB updates for sync metadata
- [ ] Provider config storage

## 8.4 Device Setup
- [ ] First-time setup UI
- [ ] Provider selection and config input
- [ ] Key generation
- [ ] Initial manifest publish

## 8.5 Device Pairing
- [ ] QR gen/scan with provider config
- [ ] Temp IPNS handshake
- [ ] Emoji verification
- [ ] DeviceRing update
- [ ] Solo data migration (seal existing records as mutations)
- [ ] Migration progress UI for large datasets

## 8.6 Sync Engine
- [ ] Adaptive polling (15s foreground, 5min background)
- [ ] Manual sync button
- [ ] Page visibility detection (pause when hidden)
- [ ] Rate limit backoff
- [ ] Change detection
- [ ] Mutation fetch/verify/apply
- [ ] Dedup by uuid
- [ ] Sync state tracking

## 8.7 Conflict Resolution
- [ ] Conflict detection
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
- [ ] Create group
- [ ] Invite existing friend (PeerDirectory)
- [ ] Invite link generation (without symmetric key)
- [ ] Join request flow
- [ ] Invite approval UI
- [ ] Group sync
- [ ] Member add/remove
- [ ] Key rotation (event-based only)
- [ ] Close group

## 8.10 Security
- [ ] Device removal + key rotation
- [ ] Event-based key rotation (no time-based)
- [ ] Malformed content handling
- [ ] Fork group flow

## 8.11 UI
- [ ] Sync status indicator with manual sync button
- [ ] Device management
- [ ] Pairing flow
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
