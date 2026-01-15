# Data Models

## Storage

**IndexedDB** (not localStorage) for higher storage limits (~50MB+ vs 5-10MB).

Stores: records, persons, groups, settings.

---

## Record

Core expense/transaction entry.

```typescript
interface Record {
  uuid: string; // randomly generated, survives edits
  title: string;
  description: string;
  category: string;
  amount: number;
  currency: string; // ISO 4217 (INR, USD, EUR)
  date: string; // ISO date YYYY-MM-DD
  time: string; // ISO time HH:MM
  icon: string; // emoji
  paidBy: Participant[];
  paidFor: Participant[];
  shareType: "equal" | "percentage" | "exact" | "shares";
  groupId: string | null;
  comments: string; // verbose details, AI extraction notes
  sourceHash?: string; // for bank statement dedup: `${filename}:${hash}`
  createdAt: number; // timestamp ms
  updatedAt: number; // timestamp ms
}

interface Participant {
  personUuid: string; // references Person.uuid
  share: number; // interpretation depends on shareType
}
```

### Share Type Examples

| shareType    | paidFor                                                                        | Interpretation |
| ------------ | ------------------------------------------------------------------------------ | -------------- |
| `equal`      | `[{personUuid: "uuid-a", share: 1}, {personUuid: "uuid-b", share: 1}]`         | Split equally  |
| `percentage` | `[{personUuid: "uuid-a", share: 60}, {personUuid: "uuid-b", share: 40}]`       | 60/40 split    |
| `exact`      | `[{personUuid: "uuid-a", share: 300}, {personUuid: "uuid-b", share: 200}]`     | Exact amounts  |
| `shares`     | `[{personUuid: "uuid-a", share: 2}, {personUuid: "uuid-b", share: 1}]`         | 2:1 ratio      |

In cases like `percentage`, need to sanity check if the values add up to 100.

---

## Person

Every individual (user or contact) is identified by UUID. Persons can be:
- **Self**: The current user (has devices in sync mode)
- **Contact**: Someone added to expenses (may or may not have the app)
- **Placeholder**: Added before they create an account, can be claimed later

```typescript
interface Person {
  uuid: string; // primary identifier, immutable
  name: string; // display name
  email?: string; // optional, can change
  devices?: DeviceInfo[]; // populated in sync mode
  addedAt: number; // timestamp ms
  addedBy?: string; // UUID of person who added them
  isSelf?: boolean; // true if this is the current user
  isPlaceholder?: boolean; // true if not yet claimed an account
}

interface DeviceInfo {
  authPublicKey: Uint8Array; // P-256 signing key
  ipnsPublicKey: Uint8Array; // Ed25519 IPNS key
}
```

**Email normalization:** lowercase, trim whitespace (when present).

### Placeholder Claiming

When a placeholder person creates their own account:

**Option 1: Claim via invite link**
1. Inviter sends invite link that includes placeholder's UUID
2. Recipient opens link, sees they're being invited to claim existing identity
3. On acceptance, recipient adopts the placeholder UUID
4. Placeholder person entry is updated: `isPlaceholder: false`, devices added
5. All existing records referencing that UUID remain valid

**Option 2: Merge accounts later**
1. User creates new account (new UUID) independently
2. Later discovers they have a placeholder in someone's group
3. User initiates merge: "I am this person"
4. Group admin verifies (emoji check or similar)
5. Merge mutation created: updates all references from old UUID to new UUID
6. Old placeholder person entry deleted

**Merge mutation:**
```typescript
{
  targetUuid: "new-person-uuid",
  targetType: "person",
  operation: {
    type: "update",
    changes: [
      { field: "mergedFrom", old: null, new: "old-placeholder-uuid" }
    ]
  }
}
// Separate mutations update all records that referenced old UUID
```

---

## Group

```typescript
interface Group {
  uuid: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}
```

- Default group (Personal Ledger) exists for ungrouped expenses
- Each record belongs to one group (or default)
- **Membership**: Determined by Person entries in `GroupManifest.database.people` (see IPFS transport spec), not stored redundantly in Group

---

## Settings

```typescript
interface Settings {
  claudeApiKey?: string; // stored locally
  autoApplyAiChanges: boolean; // default: false
  lastUsedCurrency: string; // ISO 4217
  defaultDisplayCurrency: string; // ISO 4217, for balance summaries
  theme: "light" | "dark" | "system"; // default: 'system'
  currentPersonUuid?: string; // UUID of "me" for balance calculations
}
```

- `lastUsedCurrency`: When user tries to create a new entry anywhere, by default use the `lastUsedCurrency` which user can switch to something else. If user successfully creates a new entry then we update the `lastUsedCurrency`.
- `defaultDisplayCurrency`: The currency used to display balance summaries on Dashboard. All balances are converted to this currency for the overall "you owe" / "owed to you" totals. User can change this in Settings.
- `theme`: User's preferred color scheme.
- `currentPersonUuid`: The person marked as "me" via "Set as Me" button. Used to show personalized balance views ("you owe" vs "owed to you").

---

## IndexedDB Schema

```typescript
// Suggested Dexie.js schema
const db = new Dexie("RecordMoney");

db.version(1).stores({
  records: "uuid, groupId, date, category, sourceHash",
  persons: "uuid, email", // email indexed for lookups
  groups: "uuid",
  settings: "key", // single row, key = 'main'
});
```
