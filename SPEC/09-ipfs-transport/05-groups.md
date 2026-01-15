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
Link contains: groupId, groupName, inviterIpns, inviterAuth
```

Note: Symmetric key NOT included in link for security.

### Invite link flow (manual approval)

1. **Inviter generates link** (no symmetric key in link)
2. **Recipient clicks link** → creates join request
3. **Recipient publishes** join request to their IPNS feed
4. **Inviter polls** recipient's feed, sees join request
5. **Inviter approves** → adds recipient to group, shares symmetric key via encrypted PeerEntry
6. **Recipient polls** inviter, receives key, can now decrypt group data
7. **Recipient adds** self as member (create mutation) and publishes own group manifest

### Rejecting invite

Inviter simply does not approve. Join request expires/is ignored.

## Device Discovery in Groups

Member adds new device → updates selfDevices in PeerDirectory → others poll, see new device → start polling it

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
