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

## Browser Implementation Notes

- **Ed25519:** Use `@noble/ed25519` (~15KB, audited). Web Crypto API does not support Ed25519.
- **P-256, AES-GCM, HKDF, SHA-256:** Use native Web Crypto API.
- **Canonical JSON:** Use `fast-json-stable-stringify` for deterministic mutation serialization.

## Key Summary

### Device Keys (unique per device)

| Key | Type | Purpose | Storage |
|-----|------|---------|---------|
| **Signing Keypair** | ECDSA P-256 | Sign mutations | Device local storage |
| **IPNS Keypair** | Ed25519 | Publish to device's IPNS feed | Device local storage |

Each device generates its own keypairs on first launch. Private keys never leave the device.

**Key Storage:** Private keys stored in IndexedDB, encrypted with a browser-derived device key (no password required). Clearing browser data requires re-pairing.

### User Keys (shared across user's devices)

| Key | Type | Shared With | Purpose |
|-----|------|-------------|---------|
| **Personal Key** | AES-256 | Self devices only | Encrypt database, mutations |
| **Broadcast Key** | AES-256 | Self devices + peers | Encrypt DeviceRing (for discovery) |

First device generates both keys. Additional devices receive them via PeerDirectory (ECDH encrypted).

### Group Keys (shared across group members)

| Key | Type | Shared With | Purpose |
|-----|------|-------------|---------|
| **Group Key** | AES-256 | All group members | Encrypt GroupManifest, group mutations |

Group creator generates the key. Members receive it via PeerDirectory `sharedGroups` entries.

### Temporary Keys (single-use, discarded after)

| Key | Type | Purpose |
|-----|------|---------|
| **Temp IPNS Keypair** | Ed25519 | Response channel for device pairing / group invite |
| **Temp Symmetric Key** | AES-256 | Encrypt invite link response |

Generated for pairing/invite flows, discarded after use.

### Key Count Example

User with 2 devices in 3 groups:
- 4 keypairs (2 per device: signing + IPNS)
- 2 user keys (Personal + Broadcast)
- 3 group keys
- **Total: 9 persistent keys**

## Key Distribution

Keys are shared via PeerDirectory entries (ECDH encrypted per-recipient):

1. `sharedSecret = ECDH(A.private, B.public)` → 256-bit raw shared secret
2. `aesKey = HKDF-SHA256(sharedSecret, salt="recordmoney-key-share", info="")` → 256-bit AES key
3. `ciphertext = AES-256-GCM(aesKey, iv=random96bit, plaintext={personalKey?, broadcastKey, sharedGroups})`
4. Publish ciphertext in PeerDirectory

**Entry contents:**
- Self device entry: `personalKey` + `broadcastKey` + `sharedGroups`
- Peer entry: `broadcastKey` + `sharedGroups` (no `personalKey`)

Decryption with wrong key → AES-GCM auth tag fails → throws error (not garbage)

## Rotation

Event-based only (no time-based rotation to support offline devices):
- **Personal Key:** Rotate on device removal only
- **Broadcast Key:** Rotate on device removal OR peer removal
- **Group Key:** Rotate on member removal only

## Pinning Provider

Use provider HTTP APIs directly (not Helia). Provider must support IPNS or equivalent mutable naming.

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
  version: number;                 // protocol version (1, 2, 3, ...)
  uuid: string;                    // UUIDv4 - mutation identifier
  id: number;                      // per-device incremental
  targetUuid: string;              // UUID or deviceId of target
  targetType: 'record' | 'person' | 'group' | 'device';
  operation: MutationOperation;
  timestamp: number;               // Unix ms (user-visible, for display/ordering)
  signedAt: number;                // Unix ms (signing time, for validity checking)
  authorDevicePublicKey: Uint8Array;  // 65-byte uncompressed P-256 public key
  signature: Uint8Array;           // 64-byte ECDSA P-256 signature (r || s)
}

type MutationOperation =
  | CreateOp
  | DeleteOp
  | UpdateOp
  | MergeOp
  | ExitOp
  | ResolveConflictOp
  | ProposeUpgradeOp;

interface CreateOp {
  type: 'create';
  data: Record | Person | Group;   // full object for creation (not used for device)
}

interface DeleteOp {
  type: 'delete';
  // For device deletion, triggers key rotation
  // For person deletion (removal from group), triggers Group Key rotation
}

interface ExitOp {
  type: 'exit';
  // Only valid for targetType: 'person' (self)
  // Voluntary departure from group, no key rotation needed
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

interface ResolveConflictOp {
  type: 'resolve_conflict';
  conflictType: 'field' | 'delete_vs_update' | 'merge_vs_update';
  winnerMutationUuid: string;      // the mutation that takes effect
  voidedMutationUuids: string[];   // mutations that have NO effect when replaying
  targetUuid: string;              // record/person involved (for context)
  summary?: string;                // human-readable description
  // See 04-sync-protocol.md for full conflict resolution spec
}

interface ProposeUpgradeOp {
  type: 'propose_upgrade';
  maxSupportedVersion: number;     // highest version this client supports
  // Only valid for targetType: 'group'
  // System upgrades to min(all proposals) after 48 hours
  // See 08-protocol-versioning.md for upgrade flow
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

// Array operations (keyed by identifier)
interface ArrayAddOp {
  field: 'paidBy' | 'paidFor' | 'devices';
  op: 'add';
  key: string;              // personUuid for paidBy/paidFor, deviceId for devices
  value: Participant | DeviceInfo;
}

interface ArrayRemoveOp {
  field: 'paidBy' | 'paidFor' | 'devices';
  op: 'remove';
  key: string;              // personUuid for paidBy/paidFor, deviceId for devices
  oldValue: Participant | DeviceInfo;
}

interface ArrayUpdateOp {
  field: 'paidBy' | 'paidFor' | 'devices';
  op: 'update';
  key: string;              // personUuid for paidBy/paidFor, deviceId for devices
  old: Participant | DeviceInfo;
  new: Participant | DeviceInfo;
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
5. Check `signedAt` is within validity window (see below)

## Signature Validity Window

Mutations include a `signedAt` timestamp that's part of the signed payload. This prevents removed devices from creating new valid mutations.

**Validation rules:**
1. `signedAt` must be within ±5 minutes of current time when first received
2. Once accepted, mutation is stored and `signedAt` check is not repeated
3. If `signedAt` is too old/future, reject mutation with "signature expired"

**Why both `timestamp` and `signedAt`?**
- `timestamp`: User-controlled, for display and logical ordering (e.g., backdating an expense)
- `signedAt`: System-controlled, always set to current time when signing, used for validity

**Attack prevention:**
- Removed device creates mutation days later → `signedAt` is current → but device removed from DeviceRing → author check fails
- Removed device replays old mutation → `signedAt` is old → signature expired
- Combined: removed devices cannot create valid mutations after removal
