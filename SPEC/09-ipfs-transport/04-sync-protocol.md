# Sync Protocol

## Solo Mode

When sync is not enabled (no devices paired):
- Records stored directly in IndexedDB (no mutations)
- No signing, no mutation log

## Migration on First Pair

When user pairs their first device, existing solo data is automatically migrated:

1. **Seal existing records**: Generate `create` mutation for each existing record
2. **Batch sign**: Sign all mutations with device signing key
3. **Assign IDs**: Mutations get sequential IDs starting from 1
4. **Publish**: Include sealed mutations in initial manifest
5. **Sync**: Other device receives all sealed data as normal mutations

```typescript
// Migration pseudocode
for (const record of existingSoloRecords) {
  const mutation = {
    uuid: generateUUID(),
    id: nextMutationId++,
    kind: 'create',
    recordType: 'record',
    dataNew: record,
    timestamp: Date.now(),
    authorDevicePublicKey: deviceAuthPublicKey
  };
  sign(mutation);
  mutations.push(mutation);
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

Conflict = same record, same field, different values

```
A: edit X.amount from 100 to 150
B: edit X.amount from 100 to 200
→ conflict
```

No conflict if different fields edited.

## Conflict Resolution

UI: side-by-side comparison showing all conflicting values

**Binary conflict (2 devices):**
- Show both values + timestamps + authors
- User picks: Keep Mine | Keep Theirs

**Multi-device conflict (3+ devices):**
- Show all conflicting values side-by-side
- Display for each: value, timestamp, author device name
- User picks one value as winner
- Create override mutation for winning value
- Mark all other conflicting mutations as ignored

**Resolution actions:**
- Keep Mine → mark incoming mutation(s) as ignored
- Keep Theirs/Pick Winner → create override mutation

Bulk conflicts: scroll UI, left/right to choose

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
