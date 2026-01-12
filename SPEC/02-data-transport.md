# Data Transport

How data moves between users without a server.

---

## URL Parameters

For small payloads (1-5 records typically).

```
<domain>/import?data=<base64-encoded-json>
```

### Constraints

- **Max URL length:** 2000 characters (minimum safe limit across browsers)
- If payload exceeds limit → UI shows error: "Payload too large for URL. Use file export."

### Payload Structure

```typescript
interface UrlPayload {
  version: 1;
  records: Record[];
  users: User[]; // aliases for emails in records
}
```

### Encoding

```typescript
// Export
const payload = { version: 1, records, users };
const json = JSON.stringify(payload);
const encoded = btoa(json); // base64
const url = `${domain}/import?data=${encoded}`;

// Check length
if (url.length > 2000) {
  showError("Use file export instead");
}
```

### Use Case

Quick sharing via text message: "Hey, I paid for dinner, here's the split: [link]"

---

## File Export

For larger payloads.

### File Format

- Extension: `.recordmoney`
- Content: JSON (same structure as URL payload)
- MIME type: `application/json` (or custom `application/x-recordmoney`)

```typescript
interface FilePayload {
  version: 1;
  exportedAt: number; // timestamp
  records: Record[];
  users: User[];
  groups: Group[]; // optional, for group exports
}
```

### Export Flow

1. User selects records/group to export
2. Generate JSON payload
3. Trigger download with `.recordmoney` extension

```typescript
function exportToFile(payload: FilePayload) {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `export-${Date.now()}.recordmoney`;
  a.click();

  URL.revokeObjectURL(url);
}
```

### Import Flow

1. User uploads `.recordmoney` file
2. Parse JSON
3. Validate schema version
4. Run deduplication checks (see [03-deduplication.md](./03-deduplication.md))
5. Show import preview
6. User confirms

---

## Email Sharing

Same as URL sharing. Embed link in email body.

Constraints: Same 2000 char limit applies.

On mobile try using the webshare API:

```ts
const file = new File([json], "expenses.recordmoney");
if (navigator.canShare?.({ files: [file] })) {
  await navigator.share({ files: [file] });
}
```

Native share sheet opens → user picks Mail/Gmail → file auto-attached.
Desktop fallback: Download file + mailto: link (user attaches manually).
Support: iOS Safari 15+, Chrome Android. Desktop browsers don't support file sharing.

---

## iOS AirDrop (Future)

Not in PoC scope. Planned for iOS native app.

Requirements:

- Register `.recordmoney` file type with iOS
- Handle "Open In" intent
- Parse file → show import UI
