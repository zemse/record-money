# Keys & Crypto

## Per Device

| Key | Purpose |
|-----|---------|
| Signing keypair (P-256) | Sign mutations, SecureEnclave compatible |
| IPNS keypair (Ed25519) | Publish to own feed |
| Symmetric key (AES-256-GCM) | Encrypt content |

## Key Sharing

Device A shares sym key with Device B:
1. `sharedSecret = ECDH(A.private, B.public)`
2. Encrypt sym key with sharedSecret
3. Publish in DeviceRing

## Rotation

Event-based only (no time-based rotation to support offline devices):
- Device sym key: rotate on device removal only
- Group sym key: rotate on member removal only

## Pinning Provider

Abstract pinning service to allow multiple providers.

```typescript
interface PinningProvider {
  name: string;
  upload(data: Uint8Array): Promise<CID>;
  pin(cid: CID): Promise<void>;
  unpin(cid: CID): Promise<void>;
  resolveIpns(key: string): Promise<CID>;
  publishIpns(key: Ed25519PrivateKey, cid: CID): Promise<void>;
}
```

Supported providers:
- Piñata (default)
- Infura
- web3.storage
- Self-hosted IPFS node

Provider config stored in device settings.

## Mutation Signing

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
