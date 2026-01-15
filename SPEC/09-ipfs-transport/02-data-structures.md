# Data Structures

All data on IPFS is public. Everything must be encrypted.

**Database vs Mutations:** Database is current state. Mutations are ordered updates. Applying all mutations from start produces the same state (intentional redundancy for sync reliability).

## Encryption Keys

Two symmetric keys with different access levels:

| Key | Shared With | Purpose |
|-----|-------------|---------|
| **Personal Key** | Self devices only | Encrypt personal database, mutations |
| **Broadcast Key** | Self devices + peers | Encrypt device ring (for peer discovery) |

Keys are distributed via PeerDirectory (ECDH encrypted per-recipient).

## DeviceManifest (IPNS root)

```typescript
{
  // Encrypted with Personal Key (self devices only)
  databaseCid: CID,                        // → encrypted full db (personal + group data)
  latestMutationId: EncryptedValue,        // encrypted with Personal Key
  chunkIndex: EncryptedValue,              // encrypted with Personal Key
  // decrypts to: [{startId, endId, cid}]

  // Encrypted with Broadcast Key (self devices + peers)
  deviceRingCid: CID,                      // → DeviceRing

  // ECDH encrypted per-entry
  peerDirectoryCid: CID                    // → PeerDirectory
}
```

## DeviceRing

Encrypted entirely with Broadcast Key. Peers can decrypt to discover devices to poll.

```typescript
// Entire structure encrypted with Broadcast Key
// Decrypts to:
{
  devices: [{
    authPublicKey: Uint8Array,   // 65-byte uncompressed P-256 public key
    ipnsPublicKey: Uint8Array,   // 32-byte Ed25519 public key
    lastSyncedId: number         // last mutation ID synced from this device
  }]
}
```

**How it works:**
1. Self devices get Broadcast Key from PeerDirectory (via ECDH)
2. Peers also get Broadcast Key from PeerDirectory (via ECDH)
3. Anyone with Broadcast Key can decrypt DeviceRing and see all devices
4. Peers use this to discover which IPNS feeds to poll

## PeerDirectory

**Purpose:** Key distribution and group sharing. Not source of truth for group membership.

Used to:
- Distribute Personal Key and Broadcast Key to self devices
- Distribute Broadcast Key to peers (for device discovery)
- Share Group Keys and manifest locations

```typescript
{
  entries: [{
    ciphertext  // ECDH encrypted per-recipient, contains:
    // {
    //   personalKey?: Uint8Array,   // 32-byte Personal Key (only for self devices)
    //   broadcastKey: Uint8Array,   // 32-byte Broadcast Key (publisher's key)
    //   sharedGroups: [{
    //     groupUuid: string,        // group identifier
    //     symmetricKey: Uint8Array, // 32-byte Group Key
    //     manifestCid: CID          // points to publisher's GroupManifest
    //   }]
    // }
  }]
}
```

Randomized order to prevent analysis.

**Entry types:**
- **Self device entry:** Contains `personalKey` + `broadcastKey` + `sharedGroups`
- **Peer entry:** Contains `broadcastKey` + `sharedGroups` (no `personalKey`)

**Note:** The `broadcastKey` and `manifestCid` belong to the **publisher** (owner of this PeerDirectory), not the recipient. Recipients use the Broadcast Key to decrypt the publisher's DeviceRing.

**Note:** PeerDirectory entries may exist for peers not yet in a group (pending invites) or may lag behind actual group membership. GroupManifest.database.people is the source of truth for who is in a group.

## MutationChunk

```typescript
// Entire chunk is encrypted with Personal Key
// Decrypts to:
{
  mutations: [{id, cid}]  // each cid → encrypted Mutation
}
```

One chunk per ~100 mutations. Chunk itself is encrypted to hide mutation IDs.

## GroupManifest

**Source of truth** for group data and membership. Each member publishes their own GroupManifest.

```typescript
// Entire manifest is encrypted with Group Key
// Decrypts to:
{
  database: {
    records: Record[],       // group expenses (merged from all members)
    people: Person[]         // SOURCE OF TRUTH for group membership
  },
  chunkIndex: [{startId, endId, cid}],  // cids point to encrypted group MutationChunks
  latestMutationId: number              // highest mutation ID in THIS manifest (publisher's own)
}
```

Group MutationChunks are also encrypted with Group Key.

**Per-member publishing:** Each group member publishes their own GroupManifest containing:
- Their own mutations for this group (`latestMutationId` tracks their sequence)
- Merged database state from all members they've synced with
- The CID is shared via PeerDirectory `sharedGroups[].manifestCid`

**Membership determination:**
- A person is a member if they have an entry in `database.people`
- Person entries are added/removed via mutations (`targetType: 'person'`)
- `isPlaceholder: true` indicates pending member (invited but not yet joined with devices)

## Person

All individuals are tracked as Persons with UUID as primary identifier. See `01-data-models.md` for full Person interface.

Part of database (personal or group, encrypted):

```typescript
interface Person {
  uuid: string;             // primary identifier, immutable
  name: string;
  email?: string;
  devices?: DeviceInfo[];   // devices belonging to this person
  addedAt: number;
  addedBy?: string;         // UUID of person who added them
  isSelf?: boolean;         // true if this is the current user
  isPlaceholder?: boolean;  // true if not yet claimed an account
}

interface DeviceInfo {
  deviceId: string;         // SHA-256(authPublicKey) - unique device identifier
  ipnsPublicKey: Uint8Array;  // 32-byte Ed25519 public key - for polling
  authPublicKey: Uint8Array;  // 65-byte P-256 public key - for ECDH/verification
}
```

**Device management in groups:**
- When a member joins, the inviter adds the member's devices to `Person.devices`
- Members manage their own `devices` array (add/remove their own devices via mutations)
- Other members read `Person.devices` to discover which IPNS feeds to poll

**Placeholder persons** are created when someone is added to expenses before they have an account. They can later claim the UUID via invite link or merge with their new account.

## Encryption Summary

| Structure | Encryption | Who Can Decrypt |
|-----------|------------|-----------------|
| Database (databaseCid) | Personal Key | Self devices only |
| latestMutationId & chunkIndex | Personal Key | Self devices only |
| MutationChunk | Personal Key | Self devices only |
| Mutation content | Personal Key | Self devices only |
| DeviceRing | Broadcast Key | Self devices + Peers |
| PeerDirectory entries | ECDH per-recipient | Individual recipient |
| GroupManifest | Group Key | Group members |
| Group MutationChunk | Group Key | Group members |
