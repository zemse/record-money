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

// First, create self person
const selfPerson = {
  uuid: generateUUID(),
  name: currentUserName,
  email: currentUserEmail,
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
2. Decrypt their mutationId, compare with our lastSyncedId for them
3. If higher → fetch new mutations from mutationIndex
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

UI: side-by-side comparison showing conflicting field values

**Binary conflict (2 devices):**
- Show both values + timestamps + authors
- User picks: Keep Mine | Keep Theirs

**Multi-device conflict (3+ devices):**
- Show all conflicting values side-by-side
- Display for each: value, timestamp, author device name
- User picks one value as winner

**Resolution actions:**
- Keep Mine → ignore incoming change for that field
- Keep Theirs/Pick Winner → create update mutation with winning value
- Winner mutation uses loser's `new` as `old` to maintain chain

**Auto-merge:** When no conflicts exist (different fields changed), apply all changes automatically without user intervention.

Bulk conflicts: scroll UI, left/right to choose per field

## Publishing

On local change:
1. Create + sign mutation
2. Append to mutations
3. Rebuild manifest
4. Upload to IPFS, update IPNS, unpin old

NOT on import (avoid cascade).

## Republishing (Full Replication)

Every device maintains the complete mutation ledger:
- All mutations from all paired devices
- All mutations from all group members
- No hop limits - full replication

Store imported mutations with original signature. Include in own mutations for faster propagation.

C can get A's changes via B without waiting for A.

**Note:** Storage grows linearly with total mutations across all users. Consider adding compaction in future (snapshot + prune old mutations).

## Full Resync (fallback)

If mutations sync fails: fetch full database, merge or overwrite (user choice).
