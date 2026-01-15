# Device Pairing

## Prerequisite

At least one device must have a pinning provider configured (Piñata, Infura, web3.storage, or self-hosted).

## QR Payload (Device A generates)

```typescript
{
  ipnsPublicKey,
  authPublicKey,
  tempIpnsPrivateKey,    // for B to respond
  providerConfig?        // only if B is fresh, contains provider credentials
}
```

Provider config structure depends on provider type:
```typescript
type ProviderConfig =
  | { type: 'pinata', apiKey: string, secretKey?: string }
  | { type: 'infura', projectId: string, projectSecret: string }
  | { type: 'web3storage', token: string }
  | { type: 'self-hosted', endpoint: string, authToken?: string }
```

## Flow

1. **A generates QR**, optionally includes provider config
2. **B scans**, validates, if fresh needs provider config in payload
3. **B migrates solo data** (if first pair): seal existing records as mutations (see [04-sync-protocol.md](./04-sync-protocol.md#migration-on-first-pair))
4. **B publishes** own DeviceManifest, adds A to DeviceRing with encrypted sym key
5. **B publishes response** to temp IPNS: `{ipnsPubKey, authPubKey}`
6. **B shows 4 emojis** (hash of response)
7. **A polls temp IPNS**, sees response
8. **A verifies emojis match** with B
9. **A migrates solo data** (if first pair): seal existing records as mutations
10. **A fetches B's manifest**, derives shared secret, decrypts B's sym key
11. **A imports B's database**, handles conflicts (if both had solo data, use conflict resolution UI)
12. **A updates own manifest**, adds B to DeviceRing
13. **B polls A's IPNS**, finds self in DeviceRing, imports A's data
14. **Done**, both now sync continuously

## Emoji Derivation

```
hash = sha256(ipnsPubKey || authPubKey)
emojis = [emojiSet[hash[0]], emojiSet[hash[1]], emojiSet[hash[2]], emojiSet[hash[3]]]
```

## Adding Device C Later

A pairs with C → A adds C to DeviceRing → B polls A, sees C → B adds C → all three sync
