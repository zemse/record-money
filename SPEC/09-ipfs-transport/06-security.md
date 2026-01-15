# Security

## Threat Model

High-trust (family/friends). Fork to exclude bad actors.

### Protected

- Unauthorized writes → mutation signatures
- Tampering → signature verification
- Eavesdropping → symmetric encryption
- Single device compromise → key rotation

### Not protected

- Compromised group person → fork to exclude
- Metadata analysis → partial (randomized order)

## Device Removal

When a device needs to be removed (lost, stolen, or decommissioned).

### Removal Mutation

```typescript
{
  targetType: 'device',
  targetUuid: deviceId,  // SHA-256(authPublicKey) of device to remove
  operation: { type: 'delete' }
}
```

### Full Removal Flow

**Step 1: Create removal mutation**
```typescript
const deviceToRemove = "abc123...";  // deviceId to remove
const mutation = {
  uuid: generateUUID(),
  id: nextMutationId++,
  targetUuid: deviceToRemove,
  targetType: 'device',
  operation: { type: 'delete' },
  timestamp: Date.now(),
  authorDevicePublicKey: myAuthPublicKey
};
sign(mutation);
```

**Step 2: Generate new keys**
```typescript
const newPersonalKey = crypto.getRandomValues(new Uint8Array(32));
const newBroadcastKey = crypto.getRandomValues(new Uint8Array(32));
```

**Step 3: Update DeviceRing**
- Remove the deleted device's entry
- Re-encrypt entire DeviceRing with new Broadcast Key:
```typescript
const deviceRing = {
  devices: remainingDevices.map(d => ({
    authPublicKey: d.authPublicKey,
    ipnsPublicKey: d.ipnsPublicKey,
    lastSyncedId: d.lastSyncedId
  }))
};
const newDeviceRingCid = await upload(encrypt(deviceRing, newBroadcastKey));
```

**Step 4: Update PeerDirectory**
- Remove entry for deleted device
- Re-encrypt entries for remaining self devices with new Personal Key + Broadcast Key:
```typescript
for (const device of remainingDevices) {
  const sharedSecret = ECDH(myPrivateKey, device.authPublicKey);
  const aesKey = HKDF(sharedSecret, "recordmoney-key-share");
  device.ciphertext = AES_GCM_Encrypt(aesKey, { personalKey: newPersonalKey, broadcastKey: newBroadcastKey, sharedGroups });
}
```
- Re-encrypt entries for peers with new Broadcast Key only:
```typescript
for (const peer of peers) {
  const sharedSecret = ECDH(myPrivateKey, peer.authPublicKey);
  const aesKey = HKDF(sharedSecret, "recordmoney-key-share");
  peer.ciphertext = AES_GCM_Encrypt(aesKey, { broadcastKey: newBroadcastKey, sharedGroups });
}
```

**Step 5: Re-encrypt all data with new Personal Key**
- Database snapshot
- Mutation index
- All mutation chunks

```typescript
const newDatabaseCid = await upload(encrypt(database, newPersonalKey));
const newMutationChunks = await reencryptChunks(mutations, newPersonalKey);
const newChunkIndex = buildIndex(newMutationChunks);
```

**Step 6: Publish updated manifest**
```typescript
const manifest = {
  databaseCid: newDatabaseCid,
  latestMutationId: encrypt(latestMutationId, newPersonalKey),
  chunkIndex: encrypt(newChunkIndex, newPersonalKey),
  deviceRingCid: newDeviceRingCid,  // encrypted with new Broadcast Key
  peerDirectoryCid: newPeerDirectoryCid
};
await publishIpns(ipnsPrivateKey, manifest);
```

**Step 7: Unpin old content**
```typescript
await provider.unpin(oldDatabaseCid);
await provider.unpin(oldDeviceRingCid);
await provider.unpin(oldPeerDirectoryCid);
for (const chunk of oldMutationChunks) {
  await provider.unpin(chunk.cid);
}
```

### Propagation to Other Devices

When Device B sees a device removal mutation from Device A:

1. **Verify mutation** - check signature, ensure author is in DeviceRing
2. **Stop polling removed device** - remove from sync targets
3. **Perform own key rotation** - same steps 2-6 above
4. **Continue syncing** - poll remaining devices normally

```typescript
// On receiving device removal mutation
if (mutation.targetType === 'device' && mutation.operation.type === 'delete') {
  const removedDeviceId = mutation.targetUuid;

  // Verify author has permission (is in our DeviceRing)
  if (!isKnownDevice(mutation.authorDevicePublicKey)) {
    reject("Unknown author");
    return;
  }

  // Remove from our DeviceRing and rotate keys
  await removeDeviceAndRotateKeys(removedDeviceId);

  // Stop polling the removed device
  syncTargets.delete(removedDeviceId);
}
```

### Security Considerations

**What's protected:**
- Removed device cannot decrypt any NEW data (new symmetric key)
- Removed device cannot create valid mutations (signature rejected by others)

**What's NOT protected:**
- Removed device may have local copy of OLD data (already decrypted)
- Old IPFS content may be cached on gateways (eventually expires)
- Removed device could still publish to its own IPNS (but others stop polling)

**Mitigation for old data:**
- Unpinning removes from pinning provider
- Gateway caches expire (typically 24-48 hours)
- Cannot revoke data already on removed device's local storage

### Edge Cases

**Simultaneous removal:** Two devices try to remove each other
- Both mutations are valid if both authors were in DeviceRing at time of signing
- Result: both devices removed, remaining devices continue

**Self-removal:** Device removes itself
- Valid operation (e.g., user wiping device before selling)
- Other devices see mutation, perform key rotation
- Self-removed device stops syncing

**Last device removal:** Removing the only remaining device
- Should be prevented in UI ("Cannot remove last device")
- Would result in no devices able to decrypt data

**Offline device during removal:**
- Offline device misses the removal mutation
- When it comes online, it can't decrypt new data (wrong key)
- UI shows "Sync failed - you may have been removed"
- User can re-pair if removal was accidental

## Malicious Actor

Detection: invalid sig, unknown author, malformed content, bad timestamp

Response: stop pulling, show UI warning with name, handle socially

Nuclear option: fork group without bad actor

## Spam

No technical rate limit. If someone spams overrides:
- Their mutations are signed (identified)
- Show UI warning
- Remove from group or fork
