# Deduplication

Preventing duplicate records during import.

---

## Automatic Checks on Import

When importing records, check each incoming record against existing data:

### 1. UUID Match

Same `uuid` found in local database.

**UI Prompt:**

- **Merge:** Accept incoming changes (overwrites local)
- **Keep as new:** Generate fresh UUID, save as separate record

### 2. Exact Field Match

No UUID match, but identical:

- `amount`
- `date`
- `paidBy` emails (sorted)
- `paidFor` emails (sorted)

**UI Prompt:**

- **Merge:** Keep one (user picks which)
- **Keep separate:** Save both

### 3. Bank Statement Hash Match

`sourceHash` field matches existing record.

Format: `${filename}:${hash(date + amount + description)}`

**Behavior:**

- Auto-skip with notification: "Skipped 3 duplicate transactions from bank statement"
- Or warn and let user confirm

---

## Import Preview UI

Before applying imports, show:

```
┌─────────────────────────────────────────┐
│ Import Preview                          │
├─────────────────────────────────────────┤
│ ✓ 5 new records                         │
│ ⚠ 2 UUID conflicts                      │
│ ⚠ 1 possible duplicate                  │
│ ⊘ 3 skipped (bank statement duplicates) │
├─────────────────────────────────────────┤
│ [Review Conflicts]  [Import All]        │
└─────────────────────────────────────────┘
```

Conflicts expandable to show side-by-side comparison.

---

## Manual Duplicate Finder

User-triggered tool to find duplicates in existing data.

**Location:** Settings or Tools menu

**Algorithm:**

1. Group records by `amount`
2. Within groups, check for same `date` (±1 day buffer optional)
3. Check participant overlap
4. Score similarity

**UI:**

```
┌─────────────────────────────────────────┐
│ Potential Duplicates Found: 3 pairs     │
├─────────────────────────────────────────┤
│ Pair 1:                                 │
│   "Dinner at Taj" - ₹1200 - Jan 5       │
│   "Taj dinner"    - ₹1200 - Jan 5       │
│   [Merge] [Keep Both] [Ignore]          │
├─────────────────────────────────────────┤
│ Pair 2: ...                             │
└─────────────────────────────────────────┘
```

---

## Hash Function for Bank Statements

```typescript
function generateSourceHash(
  filename: string,
  date: string,
  amount: number,
  description: string
): string {
  const normalized = `${date}|${amount}|${description.toLowerCase().trim()}`;
  const hash = simpleHash(normalized); // or use crypto.subtle
  return `${filename}:${hash}`;
}

// Simple hash (for PoC, can upgrade later)
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}
```

---

## Edge Cases

| Case                                                | Handling                             |
| --------------------------------------------------- | ------------------------------------ |
| Same expense added by two friends (different UUIDs) | Caught by exact field match          |
| Same expense, slightly different amounts            | Not auto-detected; use manual finder |
| Re-importing same file                              | UUID match catches all               |
| Re-uploading overlapping bank statements            | sourceHash catches all               |
