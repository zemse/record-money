# Sync Protocol

## Solo Mode

When sync is not enabled (no devices paired):
- Records stored directly in IndexedDB (no transactions)
- No signing, no changelog
- On first device pair: existing data NOT migrated to sync
- User starts fresh with sync - old local data remains accessible but separate

Rationale: Keeps solo usage simple, avoids migration complexity.

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
2. Decrypt their changeId, compare with our lastSyncedId for them
3. If higher → fetch new transactions from changeLogIndex
4. Verify each tx (signature, known author, reasonable timestamp)
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
- Create override tx for winning value
- Mark all other conflicting txs as ignored

**Resolution actions:**
- Keep Mine → mark incoming tx(s) as ignored
- Keep Theirs/Pick Winner → create override tx

Bulk conflicts: scroll UI, left/right to choose

## Publishing

On local change:
1. Create + sign transaction
2. Append to changeLog
3. Rebuild manifest
4. Upload to IPFS, update IPNS, unpin old

NOT on import (avoid cascade).

## Republishing (Full Replication)

Every device maintains the complete transaction ledger:
- All transactions from all paired devices
- All transactions from all group members
- No hop limits - full replication

Store imported txs with original signature. Include in own changeLog for faster propagation.

C can get A's changes via B without waiting for A.

**Note:** Storage grows linearly with total transactions across all users. Consider adding compaction in future (snapshot + prune old txs).

## Malformed Content

If verification fails: stop pulling from device, show UI warning with device/owner name, handle socially.

## Full Resync (fallback)

If changeLog sync fails: fetch full database, merge or overwrite (user choice).
