# Keys & Crypto

## Algorithms

| Purpose | Algorithm | Notes |
|---------|-----------|-------|
| Signing | ECDSA P-256 (secp256r1) | SecureEnclave/WebCrypto compatible |
| Key exchange | ECDH P-256 | Derives shared secret between devices |
| Symmetric encryption | AES-256-GCM | Authenticated encryption, 96-bit IV |
| Key derivation | HKDF-SHA256 | Derive AES key from ECDH shared secret |
| Hashing | SHA-256 | Mutation signatures, emoji derivation |
| IPNS keys | Ed25519 | Required by IPFS/IPNS |
| UUID | UUIDv4 | Mutation and record identifiers |

## Per Device

| Key | Algorithm | Purpose |
|-----|-----------|---------|
| Signing keypair | ECDSA P-256 | Sign mutations, SecureEnclave compatible |
| IPNS keypair | Ed25519 | Publish to own IPNS feed |
| Symmetric key | AES-256-GCM (256-bit) | Encrypt device content |

## Key Sharing

Device A shares sym key with Device B:
1. `sharedSecret = ECDH(A.private, B.public)` → 256-bit raw shared secret
2. `aesKey = HKDF-SHA256(sharedSecret, salt="recordmoney-key-share", info="")` → 256-bit AES key
3. `ciphertext = AES-256-GCM(aesKey, iv=random96bit, plaintext=symKey)`
4. Publish ciphertext in DeviceRing

Decryption with wrong key → AES-GCM auth tag fails → throws error (not garbage)

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
  uuid: string,              // UUIDv4
  id: number,                // per-device incremental
  kind: 'create'|'update'|'delete'|'override',
  recordType: 'record'|'device'|'user'|'member'|'group',
  targetUuid?: string,       // UUIDv4 of target record (for update/delete/override)
  dataOld?: any,
  dataNew?: any,
  timestamp: number,         // Unix ms
  authorDevicePublicKey: Uint8Array,  // 65-byte uncompressed P-256 public key
  signature: Uint8Array      // 64-byte ECDSA P-256 signature (r || s)
}
```

**Signing process:**
1. Build mutation object (without signature field)
2. Serialize to canonical JSON (sorted keys, no whitespace)
3. `hash = SHA-256(canonicalJson)`
4. `signature = ECDSA-P256-Sign(devicePrivateKey, hash)`

**Verification:**
1. Extract signature, rebuild mutation without it
2. Serialize to canonical JSON
3. `hash = SHA-256(canonicalJson)`
4. `valid = ECDSA-P256-Verify(authorDevicePublicKey, hash, signature)`
