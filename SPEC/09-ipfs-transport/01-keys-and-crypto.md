# Keys & Crypto

## Algorithms

| Purpose | Algorithm | Notes |
|---------|-----------|-------|
| Signing | ECDSA P-256 (secp256r1) | SecureEnclave/WebCrypto compatible |
| Key exchange | ECDH P-256 | Derives shared secret between devices |
| Symmetric encryption | AES-256-GCM | Authenticated encryption |
| Key derivation | HKDF-SHA256 | Derive AES key from ECDH shared secret |
| Hashing | SHA-256 | Mutation signatures, emoji derivation |
| IPNS keys | Ed25519 | Required by IPFS/IPNS |
| UUID | UUIDv4 | Mutation and record identifiers |

## Per-Device Keys

| Key | Purpose |
|-----|---------|
| Signing keypair (P-256) | Sign mutations |
| IPNS keypair (Ed25519) | Publish to own feed |
| Symmetric key (256-bit) | Encrypt device content |

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

## Device Identifier

Devices are identified by a hash of their auth public key:

```typescript
deviceId = hex(SHA-256(authPublicKey))  // 64-character hex string
```

This provides a stable, unique identifier derived from the device's signing key.

## Mutation Structure

Mutations track all changes to records, persons, groups, and devices using field-level granularity.

```typescript
interface Mutation {
  uuid: string;                    // UUIDv4 - mutation identifier
  id: number;                      // per-device incremental
  targetUuid: string;              // UUID or deviceId of target
  targetType: 'record' | 'person' | 'group' | 'device';
  operation: MutationOperation;
  timestamp: number;               // Unix ms
  authorDevicePublicKey: Uint8Array;  // 65-byte uncompressed P-256 public key
  signature: Uint8Array;           // 64-byte ECDSA P-256 signature (r || s)
}

type MutationOperation =
  | CreateOp
  | DeleteOp
  | UpdateOp
  | MergeOp;

interface CreateOp {
  type: 'create';
  data: Record | Person | Group;   // full object for creation (not used for device)
}

interface DeleteOp {
  type: 'delete';
  // For device deletion, triggers key rotation
}

interface UpdateOp {
  type: 'update';
  changes: FieldChange[];          // list of field-level changes
}

interface MergeOp {
  type: 'merge';
  fromUuid: string;                // UUID being merged into targetUuid
  // Only valid for targetType: 'person'
  // Clients replace all occurrences of fromUuid with targetUuid in records
}
```

### Field-Level Changes

Updates track individual field changes for precise conflict detection.

```typescript
type FieldChange =
  | ScalarChange
  | ArrayAddOp
  | ArrayRemoveOp
  | ArrayUpdateOp;

// Scalar field change (title, amount, category, etc.)
interface ScalarChange {
  field: string;
  old: any;
  new: any;
}

// Array operations for paidBy/paidFor (keyed by personUuid)
interface ArrayAddOp {
  field: 'paidBy' | 'paidFor';
  op: 'add';
  key: string;              // personUuid
  value: Participant;
}

interface ArrayRemoveOp {
  field: 'paidBy' | 'paidFor';
  op: 'remove';
  key: string;              // personUuid
  oldValue: Participant;
}

interface ArrayUpdateOp {
  field: 'paidBy' | 'paidFor';
  op: 'update';
  key: string;              // personUuid
  old: Participant;
  new: Participant;
}
```

### Example Mutations

**Create record:**
```typescript
{
  uuid: "mut-123",
  id: 1,
  targetUuid: "rec-456",
  targetType: "record",
  operation: {
    type: "create",
    data: { uuid: "rec-456", title: "Lunch", amount: 500, ... }
  },
  timestamp: 1705123456789,
  authorDevicePublicKey: ...,
  signature: ...
}
```

**Update record (scalar fields):**
```typescript
{
  uuid: "mut-124",
  id: 2,
  targetUuid: "rec-456",
  targetType: "record",
  operation: {
    type: "update",
    changes: [
      { field: "amount", old: 500, new: 600 },
      { field: "title", old: "Lunch", new: "Team Lunch" }
    ]
  },
  ...
}
```

**Update record (participant change):**
```typescript
{
  uuid: "mut-125",
  id: 3,
  targetUuid: "rec-456",
  targetType: "record",
  operation: {
    type: "update",
    changes: [
      { field: "paidBy", op: "add", key: "person-789", value: { personUuid: "person-789", share: 1 } },
      { field: "paidFor", op: "update", key: "person-123", old: { personUuid: "person-123", share: 1 }, new: { personUuid: "person-123", share: 2 } }
    ]
  },
  ...
}
```

## Mutation Signing

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
