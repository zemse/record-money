# Groups

## Structure

Each group has:
- Symmetric key (shared among members)
- Each member publishes own group feed
- All members poll all other members' feeds

## Creating Group

1. Generate group sym key
2. Add self as first member
3. Publish group manifest
4. Add to own PeerDirectory

## Inviting Members

### Existing friend (via PeerDirectory)

Add group to PeerEntry for that friend. Friend discovers by polling your PeerDirectory.

### New person (invite link)

```typescript
// Link payload (base64 encoded)
{
  groupId: string,
  groupName: string,
  inviterAuthPublicKey: Uint8Array,
  inviterIpnsPublicKey: Uint8Array,
  tempIpnsPrivateKey: Uint8Array,    // for recipient to publish response
  tempSymmetricKey: Uint8Array        // to encrypt the response
}
```

Note: Group symmetric key NOT included in link for security.

### Invite link flow

1. **Inviter generates link** with temp IPNS key + temp sym key + own device keys
2. **Recipient clicks link**, app opens with invite details
3. **Recipient publishes response** to temp IPNS (encrypted with temp sym key):
   ```typescript
   {
     recipientAuthPublicKey: Uint8Array,
     recipientIpnsPublicKey: Uint8Array,
     recipientName?: string
   }
   ```
4. **Recipient shows 4 emojis** (hash of response, same as device pairing)
5. **Inviter polls temp IPNS**, sees encrypted response
6. **Inviter decrypts** with temp sym key, gets recipient's device keys
7. **Inviter verifies emojis** match with recipient (prevents MITM)
8. **Both become friends**:
   - Inviter adds recipient to PeerDirectory (with group sym key in entry)
   - Recipient adds inviter to PeerDirectory
9. **Recipient polls inviter's PeerDirectory**, finds self, gets group sym key
10. **Recipient joins group**: creates member mutation, publishes own group manifest
11. **Other members discover new member** via group → add to their PeerDirectory
12. **New member discovers other members** via group → adds them to PeerDirectory

### Rejecting invite

Inviter simply does not approve (doesn't add to PeerDirectory). Temp IPNS response is ignored.

### Invite link security

- Temp IPNS key is single-use, discard after
- Emoji verification prevents link interception attacks
- If link is compromised: emojis won't match, no group access granted

## Device Discovery in Groups

### New member joining

After new member joins via invite link:
1. New member decrypts GroupManifest → sees all existing members' devices
2. New member adds each existing member to own PeerDirectory (as friend)
3. Existing members see new member in GroupManifest → add to their PeerDirectory
4. All members can now poll each other's devices

### Existing member adds new device

Member adds new device → updates `selfDevices` in all PeerDirectory entries for friends → friends poll, see new device → start polling it

## Removing Members

1. Create member removal mutation
2. Rotate group sym key
3. Update PeerDirectory with new key for remaining members only
4. Others see removal → stop polling removed member → get new key from PeerDirectory

### Key rotation race

Device sees rotation mutation but hasn't received new key yet → show UI error, retry, handle socially

## Closing Group

Create close mutation → stop polling → keep data for reference → hide from active groups

## Personal Group

Default group, only own devices, not shared. For personal expense tracking.
