# Post-PoC / Future Features

Features deferred from PoC. To be prioritized after initial release.

---

## Payment info

We can add a CTA for owers to quickly make a payment to people they owe money, if payment metadata is present.

- Crypto
- UPI address for India
- Venmo
- Paypal

## AI Query Optimization

**Problem:** Large datasets (years of expenses) = high token costs when sending all data to Claude.

**Solution:** Let Claude emit structured queries instead of receiving all data.

### Concept

```
User: "How much did I spend on food in December?"

Claude emits:
{
  "action": "query",
  "filter": {
    "category": "food",
    "dateRange": { "start": "2024-12-01", "end": "2024-12-31" }
  },
  "aggregate": "sum"
}

Client executes query locally, returns:
{ "result": 12450, "count": 34 }

Claude responds:
"You spent ₹12,450 on food in December across 34 transactions."
```

### Requirements

- Define query schema
- Build client-side query executor
- Two-phase conversation flow
- Fallback to full data for small datasets

### Complexity

High. Defer until token costs become a real user issue.

---

## Self-Hosted Relay Sync

**Problem:** Same user, multiple devices = manual export/import currently.

**Solution:** Optional self-hosted relay server for sync.

### Concept

- User runs their own sync server (Docker container, Cloudflare Worker, etc.)
- App connects to user-provided relay URL
- All data encrypted client-side before transmission
- Relay only stores encrypted blobs

### Requirements

- Relay server implementation
- Client-side encryption (e.g., AES-GCM with user password)
- Conflict resolution for concurrent edits
- Optional: E2E encryption between devices

### Complexity

High. Consider existing solutions (CouchDB, Yjs) before building custom.

---

## iOS Native App

**Scope:** Full native iOS app with platform-specific features.

### Features

- AirDrop sharing
  - Register `.recordmoney` file type
  - Handle incoming files via Share Sheet
  - Send to contacts via AirDrop
- Widgets (Expenses today, Balance summary)
- Notifications (Reminders to log expenses)
- iCloud backup (optional)
- Face ID/Touch ID for app lock

### Tech Options

- Swift (native)
- React Native (shared logic with web)
- Capacitor (wrap existing web app)

### Recommendation

React Native or Capacitor for code sharing with web.

---

## Android Native App

**Scope:** Full native Android app.

### Features

- Share Intent handling for `.recordmoney` files
- Widgets
- Notifications
- Google Drive backup (optional)
- Biometric lock

### Tech Options

Same as iOS: React Native or Capacitor preferred.

---

## Fuzzy Duplicate Detection

**Problem:** Current dedup requires exact match. Near-duplicates slip through.

**Solution:** Similarity scoring for potential duplicates.

### Scoring Factors

| Factor                      | Weight |
| --------------------------- | ------ |
| Amount within 5%            | 0.3    |
| Same date                   | 0.3    |
| Date ±1 day                 | 0.2    |
| Same participants           | 0.3    |
| Similar title (Levenshtein) | 0.1    |

### UI

Show similarity percentage, let user decide.

### Complexity

Medium. Can implement after basic dedup proves insufficient.

---

## URL Compression

**Problem:** 2000 char limit restricts URL sharing to few records.

**Solution:** Compress JSON before base64 encoding.

### Options

- **lz-string:** Designed for URL-safe compression
- **pako:** zlib compression, needs base64 encoding

### Trade-off

Compressed URLs look "scary" (random characters). May reduce trust in links.

### Recommendation

Implement as optional/advanced feature. Default to uncompressed.

---

## Cloud Backup

**Problem:** Data loss if user clears browser / loses device.

**Solution:** Optional backup to user's own cloud storage.

### Options

| Provider     | API | Notes                               |
| ------------ | --- | ----------------------------------- |
| Google Drive | ✅  | OAuth required                      |
| Dropbox      | ✅  | OAuth required                      |
| iCloud       | ❌  | Apple devices only, limited web API |
| OneDrive     | ✅  | OAuth required                      |

### Flow

1. User connects cloud account (OAuth)
2. Periodic backup (manual or scheduled)
3. Restore from backup option

### Privacy

User controls their data. We never see it.

### Complexity

Medium. OAuth flows can be tricky.

---

## Recurring Expenses

**Problem:** User manually enters same expense weekly/monthly.

**Solution:** Recurring expense templates.

### Features

- Create template (e.g., "Netflix ₹199, monthly")
- Auto-generate records on schedule
- Notification to confirm/skip

### Complexity

Low-medium. Requires background scheduling (service worker or native).

---

## Expense Categories AI

**Problem:** Users must manually categorize expenses.

**Solution:** AI auto-suggests category based on title/merchant.

### Implementation

Local heuristics first (keyword matching), AI fallback for ambiguous.

### Complexity

Low. Can do rule-based initially.

---

## Settlement Tracking

**Problem:** After settling up, hard to track what was settled.

**Solution:** First-class settlement records.

### Features

- "Settle Up" creates settlement record
- Links to records being settled
- Shows settlement history

### Complexity

Low-medium. Data model extension needed.

---

## Priority Matrix

| Feature               | Impact | Effort | Priority |
| --------------------- | ------ | ------ | -------- |
| iOS/Android apps      | High   | High   | P1       |
| Cloud backup          | High   | Medium | P1       |
| Recurring expenses    | Medium | Low    | P2       |
| Settlement tracking   | Medium | Low    | P2       |
| Fuzzy duplicates      | Medium | Medium | P2       |
| URL compression       | Low    | Low    | P3       |
| AI query optimization | Medium | High   | P3       |
| Self-hosted sync      | Medium | High   | P3       |
