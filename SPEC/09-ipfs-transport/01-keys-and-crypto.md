# Keys & Crypto

## Per Device

| Key | Purpose |
|-----|---------|
| Signing keypair (P-256) | Sign transactions, SecureEnclave compatible |
| IPNS keypair (Ed25519) | Publish to own feed |
| Symmetric key (AES-256-GCM) | Encrypt content |

## Key Sharing

Device A shares sym key with Device B:
1. `sharedSecret = ECDH(A.private, B.public)`
2. Encrypt sym key with sharedSecret
3. Publish in DeviceRing

## Rotation

- Device sym key: rotate every 24h or on device removal
- Group sym key: rotate on member removal

## Transaction Signing

```typescript
{
  uuid: string,              // global unique
  id: number,                // per-device incremental
  kind: 'create'|'update'|'delete'|'override',
  recordType: 'record'|'device'|'user'|'member'|'group',
  targetUuid?: string,
  dataOld?: any,
  dataNew?: any,
  timestamp: number,
  authorDevicePublicKey: Uint8Array,
  signature: Uint8Array      // ECDSA over hash of above
}
```
