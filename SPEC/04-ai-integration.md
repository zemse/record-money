# AI Integration

Claude API integration for natural language expense entry and document parsing.

---

## Setup

### First-Time Flow

1. User clicks AI chat icon (floating button, bottom-right)
2. Prompt: "Enter your Claude API key to enable AI features"
3. Show security warning:
   > ⚠️ Your API key is stored locally in your browser. It's visible to browser extensions and anyone with device access. We recommend using a key with spending limits set in your Anthropic console.
4. Save key to IndexedDB (settings store)
5. Open chat panel

### API Key Management

- Stored in IndexedDB under settings
- User can view/update/delete in Settings page
- Key tested on save (simple API ping)

---

## Chat Interface

### UI Components

```
┌─────────────────────────────────────────┐
│ AI Assistant                        [×] │
├─────────────────────────────────────────┤
│                                         │
│ User: Add lunch at Cafe Coffee Day,     │
│       ₹450, split with Rahul            │
│                                         │
│ AI: I'll create this expense:           │
│     ┌─────────────────────────────┐     │
│     │ 🍽️ Lunch at Cafe Coffee Day │     │
│     │ ₹450 · Today · Equal split  │     │
│     │ Paid by: You                │     │
│     │ Split with: Rahul           │     │
│     └─────────────────────────────┘     │
│     [Confirm] [Edit] [Cancel]           │
│                                         │
├─────────────────────────────────────────┤
│ [Type a message...]           [📎] [➤] │
└─────────────────────────────────────────┘

[☑️ Auto-apply changes]
```

### Features

- Floating action button (bottom-right corner)
- Expandable chat panel
- Message history within session
- File attachment button (📎) for receipts/statements

---

## CRUD Operations

### Natural Language → Actions

| User Input | Action |
|------------|--------|
| "Add coffee ₹150" | Create record |
| "Delete the dinner entry from yesterday" | Delete record |
| "Change the amount of last entry to ₹500" | Update record |
| "Show my expenses this week" | Query (display in chat) |
| "How much do I owe Rahul?" | Query balances |

### Confirmation Flow

1. AI proposes changes
2. Show summary card:
   ```
   Changes: Add 1 record
   [▶ View Details]
   [Confirm] [Edit] [Cancel]
   ```
3. Expandable details show full record
4. User confirms, edits, or cancels

### Auto-Apply Toggle

- Checkbox: "Auto-apply changes"
- Default: OFF
- When ON: Skip confirmation, apply immediately
- User can toggle anytime
- Stored in settings

---

## Iterative Correction

If AI gets it wrong:

```
User: Add dinner ₹1200 with Priya and Amit

AI: Creating expense...
    🍽️ Dinner · ₹1200 · Split 3 ways
    [Confirm] [Edit] [Cancel]

User: No, I paid for Amit's share, Priya paid her own

AI: Updated:
    🍽️ Dinner · ₹1200
    You paid: ₹800 (your share + Amit's)
    Priya paid: ₹400 (her share)
    [Confirm] [Edit] [Cancel]
```

---

## Receipt Parsing

### Flow

1. User clicks 📎 or "Scan Receipt"
2. Upload image or capture via camera
3. Send to Claude Vision API
4. AI extracts:
   - Title (merchant name)
   - Amount
   - Date
   - Category (inferred)
   - Line items (stored in comments)
5. Show extracted record for confirmation
6. User edits if needed, confirms

### API Call

```typescript
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  messages: [{
    role: "user",
    content: [
      {
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: base64Image }
      },
      {
        type: "text",
        text: `Extract expense details from this receipt. Return JSON:
          { title, amount, currency, date, category, lineItems: string[] }
          If unclear, make reasonable inferences.`
      }
    ]
  }]
});
```

### Storage

- Image NOT stored (to save space)
- Extracted line items stored in `comments` field for reference

---

## Bank Statement Parsing

### Flow

1. User uploads PDF
2. Convert PDF pages to images (or extract text if possible)
3. Send to Claude Vision API
4. AI extracts list of transactions
5. Each transaction gets `sourceHash` for dedup
6. Show bulk import preview
7. User reviews, can deselect entries
8. Confirm import

### Deduplication

```typescript
// For each extracted transaction
const sourceHash = `${filename}:${hash(date + amount + description)}`;

// Check if exists
const existing = await db.records.where('sourceHash').equals(sourceHash).first();
if (existing) {
  // Mark as duplicate, exclude from import
}
```

### UI

```
┌─────────────────────────────────────────┐
│ Bank Statement Import                   │
│ HDFC_Statement_Jan2025.pdf              │
├─────────────────────────────────────────┤
│ Found 23 transactions                   │
│ ⊘ 5 already imported (skipped)          │
│ ✓ 18 new transactions                   │
├─────────────────────────────────────────┤
│ [☑] Jan 5  - Swiggy         -₹450      │
│ [☑] Jan 5  - Amazon         -₹1,299    │
│ [☑] Jan 6  - Salary         +₹50,000   │
│ [ ] Jan 7  - ATM Withdrawal -₹5,000    │ ← user unchecked
│ ...                                     │
├─────────────────────────────────────────┤
│ [Import Selected (17)]  [Cancel]        │
└─────────────────────────────────────────┘
```

---

## Error Handling

| Error | Handling |
|-------|----------|
| Invalid API key | Prompt to re-enter |
| Rate limited | Show message, suggest waiting |
| Network error | "AI features require internet" |
| Parse failure | "Couldn't understand. Try rephrasing." |
| Vision unclear | "Receipt unclear. Please enter manually." |

---

## Offline Behavior

AI features require network. When offline:

- Chat button shows disabled state or badge
- On click: "AI features require internet connection"
- All other app features work normally
