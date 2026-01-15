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

```
Link contains: groupId, groupName, symmetricKey, inviterIpns, inviterAuth
```

Anyone with link gets read access. Acceptable risk.

### Accepting invite

1. Store group + sym key
2. Poll inviter to get full group data
3. Add self as member (create tx)
4. Publish own group manifest

## Device Discovery in Groups

Member adds new device → updates selfDevices in PeerDirectory → others poll, see new device → start polling it

## Removing Members

1. Create member removal tx
2. Rotate group sym key
3. Update PeerDirectory with new key for remaining members only
4. Others see removal → stop polling removed member → get new key from PeerDirectory

### Key rotation race

Device sees rotation tx but hasn't received new key yet → show UI error, retry, handle socially

## Closing Group

Create close tx → stop polling → keep data for reference → hide from active groups

## Personal Group

Default group, only own devices, not shared. For personal expense tracking.
