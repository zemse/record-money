# Data Structures

## DeviceManifest (IPNS root)

```typescript
{
  databaseCid: CID,                    // encrypted full db
  changeIdEncrypted: EncryptedValue,   // current change id
  changeLogIndex: [{startId, endId, cid}],  // chunked txs
  deviceRingCid: CID,                  // other devices of same user
  peerDirectoryCid: CID                // friends + groups
}
```

## DeviceRing

```typescript
{
  devices: [{
    authPublicKey,
    ipnsPublicKey,
    symmetricKeyCiphertext,    // encrypted with ECDH shared secret
    lastSyncedIdEncrypted
  }]
}
```

How B reads A's sym key: find entry with B's authPubKey → ECDH(B.priv, A.pub) → decrypt

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
{
  transactions: [{id, cid}]  // each cid → encrypted Transaction
}
```

One chunk per ~100 txs.

## GroupManifest

```typescript
{
  database: { records, members },
  changeLogIndex: [{startId, endId, cid}],
  currentChangeId
}
// encrypted with group sym key
```

## GroupMember

```typescript
{
  uuid, name, email?,
  devices: [{authPublicKey, ipnsPublicKey}],
  addedAt, addedBy
}
```
