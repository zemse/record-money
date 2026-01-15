# Groups

## Structure

Each group has:
- Symmetric key (shared among members via PeerDirectory)
- GroupManifest containing records and people (source of truth)
- Each member publishes own group feed
- All members poll all other members' feeds

## Membership

**Source of truth:** `GroupManifest.database.people`

A person is a group member if:
1. They have a Person entry in `database.people`
2. Entry has `isPlaceholder: false` (or undefined) for active members
3. Entry has `isPlaceholder: true` for invited-but-not-joined members

**PeerDirectory vs GroupManifest:**
- PeerDirectory = how you exchange symmetric keys (1-to-1 encrypted)
- GroupManifest.database.people = who is in the group (source of truth)
- PeerDirectory may lag behind or include pending invites

## Creating Group

1. Generate Group Key
2. Create Person mutation for self (first member)
3. Publish group manifest

## Inviting People

### Existing peer (via PeerDirectory)

Add group to PeerEntry for that person. They discover by polling your PeerDirectory.

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
8. **Inviter adds recipient** to PeerDirectory (with Group Key in `sharedGroups`)
9. **Recipient polls inviter's PeerDirectory**, finds self, gets Group Key
10. **Recipient adds inviter** to own PeerDirectory (now with Group Key in `sharedGroups`)
11. **Recipient joins group**: creates person mutation, publishes own group manifest
12. **Other people discover new person** via group → add to their PeerDirectory
13. **New person discovers other people** via group → adds them to PeerDirectory

### Rejecting invite

Inviter simply does not approve (doesn't add to PeerDirectory). Temp IPNS response is ignored.

### Invite link security

- Temp IPNS key is single-use, discard after
- Emoji verification prevents link interception attacks
- If link is compromised: emojis won't match, no group access granted

## Device Discovery in Groups

### New person joining

After new person joins via invite link:
1. **Inviter adds new person** to GroupManifest with their `devices` populated
2. **New person fetches GroupManifest** → sees all existing members in `database.people`
3. **New person reads `Person.devices`** for each member → gets their `ipnsPublicKey` and `authPublicKey`
4. **New person adds each member** to own PeerDirectory (with Broadcast Key for ECDH)
5. **Existing members poll** inviter's GroupManifest → see new person → add to their PeerDirectory
6. **All members can now poll** each other's devices using `ipnsPublicKey` from `Person.devices`

### Existing person adds new device

1. Person adds new device to their DeviceRing (encrypted with Broadcast Key)
2. Person creates mutation to add device to their `Person.devices` in GroupManifest
3. Other members poll GroupManifest → see new device in `Person.devices` → start polling it

## Removing People

### Removal Flow

1. **Create person deletion mutation:**
   ```typescript
   {
     targetType: 'person',
     targetUuid: personToRemove.uuid,
     operation: { type: 'delete' }
   }
   ```

2. **Generate new Group Key**

3. **Update PeerDirectory:**
   - Remove entry for removed person
   - Update `sharedGroups` with new key for remaining members

4. **Re-encrypt GroupManifest** with new key

5. **Publish updated manifest**

6. **Other members:**
   - See deletion mutation
   - Get new key from their PeerDirectory entry
   - Stop polling removed person
   - Re-encrypt their own group data with new key

### Key Rotation Race

Device sees deletion mutation but hasn't received new key via PeerDirectory yet:
- Show UI: "Group key rotating, please wait..."
- Retry fetching PeerDirectory
- If still failing after retries: "Contact group admin to re-share key"
- Handle socially (re-invite if needed)

### Removed Person's View

- Cannot decrypt new group data (wrong key)
- UI shows: "You were removed from [Group Name]"
- Local data preserved for reference
- Can export their own records if needed

## Exiting Group

A member can voluntarily leave a group.

### Exit Mutation

```typescript
{
  targetType: 'person',
  targetUuid: selfPersonUuid,  // the exiting member's UUID
  operation: { type: 'exit' }  // signals voluntary departure
}
```

### Exit Flow

1. **Create exit mutation** for self
2. **Publish updated GroupManifest** with exit mutation
3. **Stop polling** other members' feeds for this group
4. **Remove group** from PeerDirectory `sharedGroups` for all peers
5. **Keep local data** archived for reference (charts, history)

### After Exit

- Other members see exit mutation → stop polling the departed member
- No key rotation needed (voluntary exit, not removal)
- Departed member retains read-only archive of data up to exit point
- Departed member cannot see new group activity after exit

## Personal Ledger

A special group containing only the user themselves:
- Has its own Group Key (like any group)
- Only self devices are members
- Not shared with peers
- Displayed as "Personal Ledger" in UI (other groups shown as "Group Ledgers")
- Used for personal expense tracking that doesn't involve others
