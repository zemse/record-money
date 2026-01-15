# Sync Protocol

## Solo Mode

When sync is not enabled (no devices paired):
- Records stored directly in IndexedDB (no mutations)
- No signing, no mutation log

## Migration on First Pair

When user pairs their first device, existing solo data is automatically migrated:

1. **Create self person**: Generate `create` mutation for current user as Person (with `isSelf: true`)
2. **Seal existing persons**: Generate `create` mutation for each existing contact
3. **Seal existing records**: Generate `create` mutation for each existing record
4. **Batch sign**: Sign all mutations with device signing key
5. **Assign IDs**: Mutations get sequential IDs starting from 1
6. **Publish**: Include sealed mutations in initial manifest
7. **Sync**: Other device receives all sealed data as normal mutations

```typescript
// Migration pseudocode
const mutations = [];

// First, create self person (with device info)
const selfPerson = {
  uuid: generateUUID(),
  name: currentUserName,
  email: currentUserEmail,
  devices: [{
    deviceId: hex(SHA256(authPublicKey)),
    ipnsPublicKey: ipnsPublicKey,
    authPublicKey: authPublicKey
  }],
  isSelf: true,
  addedAt: Date.now()
};
mutations.push(createMutation('person', selfPerson));

// Then existing contacts
for (const person of existingPersons) {
  mutations.push(createMutation('person', person));
}

// Then records
for (const record of existingSoloRecords) {
  mutations.push(createMutation('record', record));
}

function createMutation(targetType, data) {
  const mutation = {
    uuid: generateUUID(),
    id: nextMutationId++,
    targetUuid: data.uuid,
    targetType,
    operation: { type: 'create', data },
    timestamp: Date.now(),
    authorDevicePublicKey: deviceAuthPublicKey
  };
  sign(mutation);
  return mutation;
}
```

**Edge cases:**
- Large dataset (1000+ records): Show progress indicator, batch in chunks
- Migration happens only once per user (tracked in device settings)
- If pairing fails mid-migration: rollback, retry on next pair attempt

---

## Offline Handling

The app is offline-first. All changes work locally and sync when connectivity is available.

### Mutation Queue

Mutations are stored locally in IndexedDB before publishing:

```typescript
// IndexedDB store for pending mutations
db.version(N).stores({
  mutationQueue: 'id, status',  // status: 'pending' | 'published'
  ...
});
```

**Creating mutations (offline or online):**
1. User makes a change
2. Create mutation with next local `id` (per-device incremental)
3. Sign mutation
4. Store in `mutationQueue` with `status: 'pending'`
5. Apply to local database immediately
6. If online: trigger publish

### Per-Device Ordering

Each device maintains its own mutation sequence:
- `id` field is per-device incremental (1, 2, 3, ...)
- No global ordering across devices
- Other devices track `lastSyncedId` per device they sync with

```typescript
// DeviceRing tracks sync progress per device
{
  devices: [{
    ...
    lastSyncedId  // "I've seen mutations 1-47 from this device"
  }]
}
```

**Why no global order?**
- Devices can be offline for arbitrary periods
- `id` is per-device, not comparable across devices

**Cross-device ordering:** When mutations from different devices need ordering (e.g., replay, conflict detection), sort by `timestamp`. Clock drift may cause imperfect ordering, but this is acceptable for a high-trust environment.

### Publishing When Online

When device comes online (or is already online):

```typescript
async function publishPendingMutations() {
  const pending = await db.mutationQueue
    .where('status').equals('pending')
    .sortBy('id');

  if (pending.length === 0) return;

  // Add to mutation chunks
  for (const mutation of pending) {
    appendToCurrentChunk(mutation);
  }

  // Upload and publish
  await uploadNewChunks();
  await updateManifest();
  await publishToIpns();

  // Mark as published
  await db.mutationQueue
    .where('status').equals('pending')
    .modify({ status: 'published' });
}
```

### Sync After Being Offline

When device reconnects after being offline:

1. **Publish own pending mutations** first
2. **Poll other devices** for their new mutations
3. **For each device**, compare their `latestMutationId` with our `lastSyncedIdForThem`
4. **Fetch new mutations** from their mutation index
5. **Check for conflicts** with our pending/published mutations
6. **Auto-merge** non-conflicting changes
7. **Queue conflicts** for user resolution
8. **Update** `lastSyncedId` for each device

### Conflict Scenarios

**Both devices offline, both edit same field:**
```
Device A (offline): amount 100 → 150, creates mutation id=5
Device B (offline): amount 100 → 200, creates mutation id=8
Both come online...
A publishes id=5, B publishes id=8
A polls B, sees id=8 conflicts with own id=5
→ Conflict UI shown to user
```

**Different fields edited offline (no conflict):**
```
Device A (offline): amount 100 → 150
Device B (offline): title "Lunch" → "Team Lunch"
Both come online...
→ Auto-merge: both changes applied
```

### Edge Cases

**Removed while offline:**
- Device A removes Device B while B is offline
- B creates mutations offline, stores in local queue
- B comes online:
  - B can still publish pending mutations to own IPNS (local data preserved)
  - B cannot decrypt A's new data (key was rotated)
  - A ignores B's IPNS (A stopped polling B after removal)
  - UI on B shows: "Sync failed - cannot decrypt. You may have been removed."
- B's local data remains intact and usable in solo mode
- If removal was accidental, B can re-pair and merge data

**Large offline queue:**
- Device offline for weeks with many changes
- On reconnect: batch publish in chunks
- Show progress indicator
- Handle conflicts incrementally

**App killed while offline:**
- Mutations in IndexedDB `mutationQueue` survive app restart
- On next launch: check queue, publish when online

**Network flaky:**
- Publish fails mid-upload
- Retry with exponential backoff
- Mutations stay in queue until successfully published
- Idempotent: re-uploading same mutation is safe (dedupe by uuid)

---

## Polling

Adaptive polling based on app state:
- **Foreground** (app visible): 15s interval
- **Background** (app hidden but running): 5 min interval
- **Inactive** (tab/app suspended): pause polling
- **Manual sync**: button to trigger immediate sync
- **Rate limit backoff**: exponential backoff on 429 errors

Multi-gateway: poll multiple IPFS gateways, use highest IPNS seq number

## Sync Flow

1. Poll device IPNS → get manifest
2. Decrypt their latestMutationId, compare with our lastSyncedId for them
3. If higher → fetch new mutations from chunkIndex
4. Verify each mutation (signature, known author, reasonable timestamp)
5. Dedupe by uuid (skip if already have)
6. Check conflicts
7. Apply or queue for conflict resolution
8. Update lastSyncedId

## Conflict Detection

With field-level mutations, conflicts are detected at the field level:

**Conflict** = same record, same field, same old value, different new values

```
A: { field: "amount", old: 100, new: 150 }
B: { field: "amount", old: 100, new: 200 }
→ CONFLICT (same field, same old value, different new values)
```

**No conflict** if different fields edited:
```
A: { field: "amount", old: 100, new: 150 }
B: { field: "title", old: "Lunch", new: "Team Lunch" }
→ AUTO-MERGE (different fields, apply both)
```

**Array operations:**
```
A: { field: "paidBy", op: "add", key: "person-1", ... }
B: { field: "paidBy", op: "add", key: "person-2", ... }
→ NO CONFLICT (adding different participants)

A: { field: "paidBy", op: "update", key: "person-1", old: {share: 1}, new: {share: 2} }
B: { field: "paidBy", op: "update", key: "person-1", old: {share: 1}, new: {share: 3} }
→ CONFLICT (same participant, same old value)

A: { field: "paidBy", op: "remove", key: "person-1", ... }
B: { field: "paidBy", op: "update", key: "person-1", ... }
→ CONFLICT (remove vs update on same participant)
```

## Conflict Resolution

Conflicts are resolved by creating a `ResolveConflict` mutation that voids the losing mutations. This ensures replay from scratch produces the same state.

### ResolveConflict Mutation

```typescript
interface ResolveConflictOp {
  type: 'resolve_conflict';
  conflictType: 'field' | 'delete_vs_update' | 'merge_vs_update';
  winnerMutationUuid: string;       // the mutation that takes effect
  voidedMutationUuids: string[];    // mutations that have NO effect
  targetUuid: string;               // record/person involved (for context)
  summary?: string;                 // human-readable description
}
```

**Example:**
```typescript
{
  uuid: "mut-resolve-123",
  id: 15,
  targetUuid: "rec-001",          // UUID of the record/person with conflict
  targetType: 'record',           // type of entity involved in conflict
  operation: {
    type: 'resolve_conflict',
    conflictType: 'field',
    winnerMutationUuid: "mut-456",
    voidedMutationUuids: ["mut-789"],
    targetUuid: "rec-001",        // same as outer targetUuid (for context in operation)
    summary: "Kept amount=150 from Device A, voided amount=200 from Device B"
  },
  timestamp: Date.now(),
  signedAt: Date.now(),
  authorDevicePublicKey: ...,
  signature: ...
}
```

### Replay Algorithm

When building state from mutations (fresh device or rebuild):

```typescript
function replayMutations(mutations: Mutation[]): Database {
  // Step 1: Collect all voided mutation UUIDs
  const voidedUuids = new Set<string>();
  for (const mut of mutations) {
    if (mut.operation.type === 'resolve_conflict') {
      for (const uuid of mut.operation.voidedMutationUuids) {
        voidedUuids.add(uuid);
      }
    }
  }

  // Step 2: Replay mutations, skipping voided ones
  const db = emptyDatabase();
  for (const mut of sortedByDeviceAndId(mutations)) {
    if (voidedUuids.has(mut.uuid)) {
      continue;  // This mutation was voided by a conflict resolution
    }
    applyMutation(db, mut);
  }
  return db;
}
```

### Conflict Types

#### 1. Field Conflict (same field, different values)

```
Device A: { field: "amount", old: 100, new: 150 }  // mut-A
Device B: { field: "amount", old: 100, new: 200 }  // mut-B
```

**Resolution:** User picks winner (e.g., A wins)
- Create ResolveConflict: `winnerMutationUuid: "mut-A", voidedMutationUuids: ["mut-B"]`
- mut-B has no effect when replaying

#### 2. Delete vs Update Conflict

```
Device A: { type: "delete", targetUuid: "rec-123" }           // mut-A
Device B: { type: "update", targetUuid: "rec-123", changes: [...] }  // mut-B
```

**Resolution options:**
- **Keep delete:** void the update → `voidedMutationUuids: ["mut-B"]`
- **Keep record:** void the delete → `voidedMutationUuids: ["mut-A"]`

**UI:** "Device A deleted this record. Device B updated it. What should happen?"
- Option 1: "Delete the record" (void update)
- Option 2: "Keep the record with updates" (void delete)

#### 3. Merge vs Update Conflict

```
Device A: { type: "merge", targetUuid: "person-1", fromUuid: "person-2" }  // mut-A
Device B: { type: "update", targetUuid: "person-2", changes: [...] }       // mut-B
```

Person-2 is being merged into person-1, but also being updated.

**Resolution options:**
- **Apply merge, discard update:** void mut-B
- **Apply merge, redirect update:** void mut-B, create new update targeting person-1
- **Cancel merge, keep update:** void mut-A

**UI:** "Device A merged [Person 2] into [Person 1]. Device B updated [Person 2]. What should happen?"
- Option 1: "Complete merge, discard updates to [Person 2]"
- Option 2: "Complete merge, apply updates to [Person 1] instead"
- Option 3: "Cancel merge, keep [Person 2] with updates"

### UI Flow

**Binary conflict (2 devices):**
- Show both values + timestamps + authors
- User picks: Keep Mine | Keep Theirs
- Creates ResolveConflict mutation voiding the loser

**Multi-device conflict (3+ devices):**
- Show all conflicting values side-by-side
- Display for each: value, timestamp, author device name
- User picks one value as winner
- Creates ResolveConflict mutation voiding all losers

**Bulk conflicts:** Scroll UI, swipe left/right to choose per field. Single "Apply All" creates one ResolveConflict per conflict.

**Auto-merge:** When no conflicts exist (different fields changed), apply all changes automatically without user intervention. No ResolveConflict needed.

### Conflicting Resolutions

Two devices may resolve the same conflict differently:

```
Device A: ResolveConflict { winnerMutationUuid: "mut-X", voidedMutationUuids: ["mut-Y"] }
Device B: ResolveConflict { winnerMutationUuid: "mut-Y", voidedMutationUuids: ["mut-X"] }
```

**Detection:** When importing a ResolveConflict, check if any of its `voidedMutationUuids` is the `winnerMutationUuid` in an existing ResolveConflict (or vice versa).

**Resolution:** Treat as a conflict requiring user input.

**UI:** "Two devices resolved a conflict differently. Which resolution should be used?"
- Show original conflict context (the field/record involved)
- Show both resolution choices with author device names
- User picks which resolution wins

**Result:** Create a new ResolveConflict that voids the losing ResolveConflict mutation:
```typescript
{
  operation: {
    type: 'resolve_conflict',
    conflictType: 'field',  // or original conflict type
    winnerMutationUuid: "resolve-A",  // the winning resolution
    voidedMutationUuids: ["resolve-B", "mut-Y"],  // losing resolution + its winner
    targetUuid: "rec-001",
    summary: "Accepted Device A's resolution, voided Device B's resolution"
  }
}
```

**Replay behavior:** The final ResolveConflict voids both the losing resolution AND the mutation that resolution had chosen as winner. This ensures consistent state.

## Capturing Old Values

On update: read current state from materialized view before applying change. Use current values as `old` in the mutation's field changes. This enables field-level conflict detection.

## Publishing

On local change:
1. Create + sign mutation
2. Append to mutations
3. Rebuild manifest
4. Upload to IPFS, update IPNS, unpin old

NOT on import (avoid cascade).

## Personal vs Group Mutations

Two mutation streams with intentional redundancy:

**Personal mutations (DeviceManifest.chunkIndex):**
- Complete ledger for this user
- Contains: Personal Ledger mutations + ALL group mutations (own + imported from other members)
- Encrypted with Personal Key
- Synced between self devices only

**Group mutations (GroupManifest.chunkIndex):**
- Subset for specific group only
- Contains: Only mutations targeting this group's records/people
- Encrypted with Group Key
- Synced with group members

**Redundancy:** When you make a group change, it goes to both:
1. Your personal mutations (complete audit trail)
2. That group's mutations (shared with members)

When you import a group member's mutations, they go to:
1. Your personal mutations (so you have the full ledger)
2. Your copy of that group's mutations

## Republishing (Full Replication)

Every device maintains the complete mutation ledger:
- All mutations from all paired devices
- All mutations from all group members
- No hop limits - full replication

Store imported mutations with original signature. Include in own mutations for faster propagation.

C can get A's changes via B without waiting for A.

**Storage:** Grows linearly with total mutations. This is acceptable - storage is cheap. UI should show per-group storage usage so users can see space consumption. No compaction mechanism needed.

## Error Recovery

### Publish Failures

**IPFS upload fails:**
- Retry with exponential backoff
- Local mutations remain in queue (`status: 'pending'`)
- UI shows "Sync pending" indicator
- Don't block user from making more changes

**IPNS publish fails (after successful IPFS upload):**
- Leave uploaded content pinned
- Queue IPNS publish for retry
- UI shows "Sync pending" indicator
- On successful retry, IPNS points to already-uploaded CIDs

**Orphan CIDs:**
- If IPNS publish keeps failing, uploaded CIDs remain pinned but unreferenced
- Acceptable trade-off: simpler than cleanup logic
- User can manually trigger cleanup in settings if storage becomes issue

### Sync Failures

**Cannot fetch peer's IPNS:**
- Retry with backoff
- After N failures, mark peer as "unreachable"
- UI shows "Cannot reach [Device Name]"
- Continue syncing with other peers

**Cannot decrypt peer's data:**
- Likely removed from group/devices (key rotated)
- UI shows "Sync failed - you may have been removed"
- Stop polling that peer
- Prompt user to re-pair if needed

**Signature verification fails:**
- Reject mutation
- Log for debugging
- Continue processing other mutations
- UI warning: "Invalid data from [Device Name]"

### Recovery Actions

**Manual sync button:**
- Retries all pending publishes
- Re-polls all peers
- Clears transient errors

**Full resync (nuclear option):**
- Available in settings
- Fetches full database from peer
- User chooses: merge or overwrite local
- Resets sync state for that peer

## Full Resync (fallback)

If mutations sync fails: fetch full database, merge or overwrite (user choice).
