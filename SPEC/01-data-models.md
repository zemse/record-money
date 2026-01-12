# Data Models

## Storage

**IndexedDB** (not localStorage) for higher storage limits (~50MB+ vs 5-10MB).

Stores: records, users, groups, settings.

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
  email: string; // normalized: lowercase, trimmed
  share: number; // interpretation depends on shareType
}
```

### Share Type Examples

| shareType    | paidFor                                                            | Interpretation |
| ------------ | ------------------------------------------------------------------ | -------------- |
| `equal`      | `[{email: "a@x.com", share: 1}, {email: "b@x.com", share: 1}]`     | Split equally  |
| `percentage` | `[{email: "a@x.com", share: 60}, {email: "b@x.com", share: 40}]`   | 60/40 split    |
| `exact`      | `[{email: "a@x.com", share: 300}, {email: "b@x.com", share: 200}]` | Exact amounts  |
| `shares`     | `[{email: "a@x.com", share: 2}, {email: "b@x.com", share: 1}]`     | 2:1 ratio      |

In cases like `percentage`, need to sanity check if the values add up to 100.

---

## User

```typescript
interface User {
  email: string; // primary identifier, normalized
  alias: string; // display name
}
```

**Email normalization:** lowercase, trim whitespace.

---

## Group

```typescript
interface Group {
  uuid: string;
  name: string;
  members: string[]; // emails
  createdAt: number;
  updatedAt: number;
}
```

- Default group exists for ungrouped expenses
- Each record belongs to one group (or default)

---

## Settings

```typescript
interface Settings {
  claudeApiKey?: string; // stored locally
  autoApplyAiChanges: boolean; // default: false
  lastUsedCurrency: string; // ISO 4217
  defaultDisplayCurrency: string; // ISO 4217, for balance summaries
  theme: "light" | "dark" | "system"; // default: 'system'
  currentUserEmail?: string; // email of "me" for balance calculations
}
```

- `lastUsedCurrency`: When user tries to create a new entry anywhere, by default use the `lastUsedCurrency` which user can switch to something else. If user successfully creates a new entry then we update the `lastUsedCurrency`.
- `defaultDisplayCurrency`: The currency used to display balance summaries on Dashboard. All balances are converted to this currency for the overall "you owe" / "owed to you" totals. User can change this in Settings.
- `theme`: User's preferred color scheme.
- `currentUserEmail`: The user marked as "me" via "Set as Me" button. Used to show personalized balance views ("you owe" vs "owed to you").

---

## IndexedDB Schema

```typescript
// Suggested Dexie.js schema
const db = new Dexie("RecordMoney");

db.version(1).stores({
  records: "uuid, groupId, date, category, sourceHash",
  users: "email",
  groups: "uuid",
  settings: "key", // single row, key = 'main'
});
```
