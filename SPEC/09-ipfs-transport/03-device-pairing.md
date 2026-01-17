# Device Pairing

## Prerequisite

At least one device must have a pinning provider configured with IPNS support.

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

**A** = existing device with keys (or first device generating keys)
**B** = new device joining

1. **A generates QR**, optionally includes provider config
2. **B scans**, validates, if fresh needs provider config in payload
3. **B generates** own device keypairs (signing + IPNS)
4. **B publishes response** to temp IPNS: `{ipnsPubKey, authPubKey}`
5. **B shows 6 emojis** (hash of response)
6. **A polls temp IPNS**, sees response
7. **A verifies emojis match** with B
8. **A migrates solo data** (if first pair): generates Personal Key + Broadcast Key, seals existing records as mutations
9. **A updates own manifest**:
   - Adds B to PeerDirectory with `personalKey` + `broadcastKey` (ECDH encrypted for B)
   - Adds B to DeviceRing (encrypted with Broadcast Key)
10. **B polls A's IPNS**, finds self in PeerDirectory, decrypts to get keys
11. **B migrates solo data** (if has any): seals existing records as mutations using received keys
12. **B publishes own DeviceManifest**:
    - Adds A to PeerDirectory with `personalKey` + `broadcastKey` (ECDH encrypted for A)
    - Adds A to DeviceRing (encrypted with Broadcast Key)
13. **A polls B's IPNS**, imports B's data, handles conflicts
14. **Done**, both now sync continuously

## Emoji Derivation

```
hash = sha256(ipnsPubKey || authPubKey)
emojis = [emojiSet[hash[0]], emojiSet[hash[1]], emojiSet[hash[2]],
          emojiSet[hash[3]], emojiSet[hash[4]], emojiSet[hash[5]]]
```

Uses 6 bytes (48 bits of entropy) for security against collision attacks. With 256-entry emoji set, provides ~281 trillion combinations.

## Adding Device C Later

When user already has devices A and B paired, and adds device C:

1. **A pairs with C** using the flow above (A shares keys with C)
2. **A adds C** to DeviceRing and PeerDirectory
3. **B polls A's DeviceRing** → sees new device C
4. **B adds C** to B's PeerDirectory (with `personalKey` + `broadcastKey` for C)
5. **B adds C** to B's DeviceRing
6. **C polls B's IPNS** → finds self in B's PeerDirectory → can now sync with B
7. **All three devices** now sync with each other

## Implementation Notes

- QR generation: `qrcode.react` (QRCodeSVG component)
- QR scanning: `html5-qrcode` (camera-based scanning with permission handling)
- UI provides fallback manual code entry for devices without camera
- Session timeout: 1 hour, polling interval: 3 seconds
