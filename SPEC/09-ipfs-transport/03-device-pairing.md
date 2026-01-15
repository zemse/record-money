# Device Pairing

## Prerequisite

At least one device must have Piñata API key.

## QR Payload (Device A generates)

```typescript
{
  ipnsPublicKey,
  authPublicKey,
  tempIpnsPrivateKey,    // for B to respond
  pinataApiKey?          // only if B is fresh
}
```

## Flow

1. **A generates QR**, optionally includes Piñata key
2. **B scans**, validates, if fresh needs Piñata key in payload
3. **B publishes** own DeviceManifest, adds A to DeviceRing with encrypted sym key
4. **B publishes response** to temp IPNS: `{ipnsPubKey, authPubKey}`
5. **B shows 4 emojis** (hash of response)
6. **A polls temp IPNS**, sees response
7. **A verifies emojis match** with B
8. **A fetches B's manifest**, derives shared secret, decrypts B's sym key
9. **A imports B's database**, handles conflicts
10. **A updates own manifest**, adds B to DeviceRing
11. **B polls A's IPNS**, finds self in DeviceRing, imports A's data
12. **Done**, both now sync continuously

## Emoji Derivation

```
hash = sha256(ipnsPubKey || authPubKey)
emojis = [emojiSet[hash[0]], emojiSet[hash[1]], emojiSet[hash[2]], emojiSet[hash[3]]]
```

## Adding Device C Later

A pairs with C → A adds C to DeviceRing → B polls A, sees C → B adds C → all three sync
