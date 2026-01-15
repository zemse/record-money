# Data Structures

All data on IPFS is public. Everything must be encrypted.

## DeviceManifest (IPNS root)

```typescript
{
  databaseCid: CID,                      // → encrypted full db
  changeIdEncrypted: EncryptedValue,     // encrypted with device sym key
  changeLogIndexEncrypted: EncryptedValue, // encrypted with device sym key
  // decrypts to: [{startId, endId, cid}]
  deviceRingCid: CID,                    // → DeviceRing (individually encrypted)
  peerDirectoryCid: CID                  // → PeerDirectory (individually encrypted)
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

```typescript
{
  entries: [{
    ciphertext  // ECDH encrypted, contains:
    // {
    //   friendDevices: [{authPubKey, ipnsPubKey}],
    //   selfDevices: [{authPubKey, ipnsPubKey}],  // for friend to discover my devices
    //   sharedGroups: [{cid, symmetricKey}]
    // }
  }]
}
```

Randomized order to prevent analysis.

## ChangeLogChunk

```typescript
// Entire chunk is encrypted with device sym key
// Decrypts to:
{
  transactions: [{id, cid}]  // each cid → encrypted Transaction
}
```

One chunk per ~100 txs. Chunk itself is encrypted to hide transaction IDs.

## GroupManifest

```typescript
// Entire manifest is encrypted with group sym key
// Decrypts to:
{
  database: { records, members },
  changeLogIndex: [{startId, endId, cid}],  // cids point to encrypted group ChangeLogChunks
  currentChangeId
}
```

Group ChangeLogChunks are also encrypted with group sym key.

## GroupMember

Part of GroupManifest.database.members (encrypted within GroupManifest):

```typescript
{
  uuid, name, email?,
  devices: [{authPublicKey, ipnsPublicKey}],
  addedAt, addedBy
}
```

## Encryption Summary

| Structure | Encryption |
|-----------|------------|
| DeviceManifest fields | Device sym key |
| DeviceRing entries | Device sym key (except symmetricKeyCiphertext which uses ECDH) |
| PeerDirectory entries | ECDH per-friend |
| ChangeLogChunk | Device sym key |
| Transaction content | Device sym key |
| GroupManifest | Group sym key |
| Group ChangeLogChunk | Group sym key |
