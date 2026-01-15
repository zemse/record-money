# Milestone 8: P2P Sync

~5-6 weeks total

## 8.1 Crypto Foundation
- [ ] P-256 keygen, ECDH, AES-GCM helpers
- [ ] Tx signing/verification
- [ ] Canonical JSON

## 8.2 IPFS Integration
- [ ] Piñata SDK
- [ ] Upload, fetch, IPNS resolve/update
- [ ] Multi-gateway (highest seq)
- [ ] Unpin old CIDs

## 8.3 Data Structures
- [ ] DeviceManifest, DeviceRing, PeerDirectory schemas
- [ ] Transaction, GroupManifest schemas
- [ ] IndexedDB updates for sync metadata

## 8.4 Device Setup
- [ ] First-time setup UI
- [ ] Piñata key input
- [ ] Key generation
- [ ] Initial manifest publish

## 8.5 Device Pairing
- [ ] QR gen/scan
- [ ] Temp IPNS handshake
- [ ] Emoji verification
- [ ] DeviceRing update
- [ ] Database import/merge

## 8.6 Sync Engine
- [ ] Polling loop (15s adaptive)
- [ ] Change detection
- [ ] Tx fetch/verify/apply
- [ ] Dedup by uuid
- [ ] Sync state tracking

## 8.7 Conflict Resolution
- [ ] Conflict detection
- [ ] Side-by-side UI
- [ ] Bulk scroll UI
- [ ] Override tx creation

## 8.8 Publishing
- [ ] Tx creation on local CRUD
- [ ] ChangeLog management
- [ ] Manifest rebuild + publish
- [ ] Republishing imported txs

## 8.9 Groups
- [ ] Create, invite (PeerDirectory + link)
- [ ] Group sync
- [ ] Member add/remove
- [ ] Key rotation
- [ ] Close group

## 8.10 Security
- [ ] Device removal
- [ ] Key rotation flows
- [ ] Malformed content handling
- [ ] Fork group flow

## 8.11 UI
- [ ] Sync status indicator
- [ ] Device management
- [ ] Pairing flow
- [ ] Group members
- [ ] Conflict notifications

## 8.12 Testing
- [ ] Multi-device sync
- [ ] Multi-user groups
- [ ] Conflicts, removal, rotation
- [ ] Offline/online transitions

**Review gate after each section**
