# Sync Protocol

## Polling

- Frequency: ~15s per device, adaptive to avoid rate limits
- Multi-gateway: poll multiple IPFS gateways, use highest IPNS seq number

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

UI: side-by-side, show both values + timestamps + authors

User picks: Keep Mine | Keep Theirs

- Keep Mine → mark incoming tx as ignored
- Keep Theirs → create override tx

Bulk conflicts: scroll UI, left/right to choose

## Publishing

On local change:
1. Create + sign transaction
2. Append to changeLog
3. Rebuild manifest
4. Upload to IPFS, update IPNS, unpin old

NOT on import (avoid cascade).

## Republishing

Store imported txs with original signature. Include in own changeLog for faster propagation.

C can get A's changes via B without waiting for A.

## Malformed Content

If verification fails: stop pulling from device, show UI warning with device/owner name, handle socially.

## Full Resync (fallback)

If changeLog sync fails: fetch full database, merge or overwrite (user choice).
