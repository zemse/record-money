# Data Structures

All data on IPFS is public. Everything must be encrypted.

**Database vs Mutations:** Database is current state. Mutations are ordered updates. Applying all mutations from start produces the same state (intentional redundancy for sync reliability).

## DeviceManifest (IPNS root)

```typescript
{
  databaseCid: CID,                          // → encrypted full db
  mutationIdEncrypted: EncryptedValue,       // encrypted with device sym key
  mutationIndexEncrypted: EncryptedValue, // encrypted with device sym key
  // decrypts to: [{startId, endId, cid}]
  deviceRingCid: CID,                        // → DeviceRing (individually encrypted)
  peerDirectoryCid: CID                      // → PeerDirectory (individually encrypted)
}
```

## DeviceRing

```typescript
{
  devices: [{
    authPublicKeyEncrypted,     // encrypted with device sym key
    ipnsPublicKeyEncrypted,     // encrypted with device sym key
    symmetricKeyCiphertext,     // encrypted with ECDH shared secret (NOT sym key)
    lastSyncedIdEncrypted       // encrypted with device sym key
  }]
}
```

**How new device B gets symmetric key:**
1. B iterates through all entries in A's DeviceRing
2. For each entry, B tries: `ECDH(B.private, A.public)` → decrypt `symmetricKeyCiphertext`
3. One will succeed (the entry A created for B)
4. B now has symmetric key and can decrypt other fields

Note: DeviceRing is typically small (2-5 devices), so trying all entries is fast.

## PeerDirectory

**Purpose:** Key exchange only. Not source of truth for group membership.

Used to:
- Share group symmetric keys with peers (encrypted per-peer)
- Help peers discover my devices
- Establish secure communication channels

```typescript
{
  entries: [{
    ciphertext  // ECDH encrypted per-person, contains:
    // {
    //   peerDevices: [{authPubKey, ipnsPubKey}],
    //   selfDevices: [{authPubKey, ipnsPubKey}],  // for peer to discover my devices
    //   sharedGroups: [{groupId, symmetricKey}]
    // }
  }]
}
```

Randomized order to prevent analysis.

**Note:** PeerDirectory entries may exist for peers not yet in a group (pending invites) or may lag behind actual group membership. GroupManifest.database.people is the source of truth for who is in a group.

## MutationChunk

```typescript
// Entire chunk is encrypted with device sym key
// Decrypts to:
{
  mutations: [{id, cid}]  // each cid → encrypted Mutation
}
```

One chunk per ~100 mutations. Chunk itself is encrypted to hide mutation IDs.

## GroupManifest

**Source of truth** for group data and membership.

```typescript
// Entire manifest is encrypted with group sym key
// Decrypts to:
{
  database: {
    records: Record[],       // group expenses
    people: Person[]         // SOURCE OF TRUTH for group membership
  },
  mutationIndex: [{startId, endId, cid}],  // cids point to encrypted group MutationChunks
  currentMutationId: number
}
```

Group MutationChunks are also encrypted with group sym key.

**Membership determination:**
- A person is a member if they have an entry in `database.people`
- Person entries are added/removed via mutations (`targetType: 'person'`)
- `isPlaceholder: true` indicates pending member (invited but not yet joined with devices)

## Person

All individuals are tracked as Persons with UUID as primary identifier. See `01-data-models.md` for full Person interface.

Part of database (personal or group, encrypted):

```typescript
{
  uuid: string;             // primary identifier, immutable
  name: string;
  email?: string;
  devices?: DeviceInfo[];   // populated in sync mode, self-managed
  addedAt: number;
  addedBy?: string;         // UUID of person who added them
  isSelf?: boolean;         // true if this is the current user
  isPlaceholder?: boolean;  // true if not yet claimed an account
}
```

**Placeholder persons** are created when someone is added to expenses before they have an account. They can later claim the UUID via invite link or merge with their new account.

## Encryption Summary

| Structure | Encryption |
|-----------|------------|
| DeviceManifest fields | Device sym key |
| DeviceRing entries | Device sym key (except symmetricKeyCiphertext which uses ECDH) |
| PeerDirectory entries | ECDH per-friend |
| MutationChunk | Device sym key |
| Mutation content | Device sym key |
| GroupManifest | Group sym key |
| Group MutationChunk | Group sym key |
