# Currency Handling

---

## Storage

Records store the original currency as entered.

```typescript
interface Record {
  amount: number; // original amount
  currency: string; // ISO 4217: "INR", "USD", "EUR", etc.
  // ...
}
```

**No automatic conversion on save.** Original values preserved.

---

## Last used Currency

Last used currency always updates in Settings when user creates a new entry.

- Used as pre-selected option when creating new records
- Stored in settings: `lastUsedCurrency: "INR"`

---

## Display

### Record List

Show original currency:

```
☕ Coffee at Starbucks
$4.50 USD · Jan 10
```

### Balance Summary

When group has mixed currencies, show each currency separately:

```
You owe Rahul:
  ₹1,200 INR
  $25 USD
```

---

## On-Demand Conversion

Conversion happens only when user explicitly requests it.

### Flow

1. User opens Reports/Graphs page
2. Sees data in mixed currencies
3. Clicks "Convert all to one currency"
4. Selects target currency (e.g., INR)
5. App fetches live exchange rates
6. Displays converted values
7. Original data unchanged in storage

### UI

```
┌─────────────────────────────────────────┐
│ Monthly Spending                        │
│                                         │
│ [Show in: INR ▼]  [🔄 Refresh rates]   │
│                                         │
│ Total: ₹45,230 (converted)              │
│                                         │
│ 📊 [Chart showing spending by category] │
│                                         │
│ ℹ️ Rates as of Jan 10, 2025 12:30 PM   │
└─────────────────────────────────────────┘
```

---

## Exchange Rate API

### Options (Free Tier)

| Provider             | Free Tier   | Notes                 |
| -------------------- | ----------- | --------------------- |
| exchangerate-api.com | 1500 req/mo | Simple, reliable      |
| open.er-api.com      | Unlimited   | Open Exchange Rates   |
| frankfurter.app      | Unlimited   | ECB rates, no API key |

### Recommended: Frankfurter (no API key needed)

```typescript
async function getExchangeRates(base: string): Promise<Record<string, number>> {
  const response = await fetch(
    `https://api.frankfurter.app/latest?from=${base}`
  );
  const data = await response.json();
  return data.rates;
}

// Usage
const rates = await getExchangeRates("USD");
// { "EUR": 0.92, "INR": 83.12, "GBP": 0.79, ... }
```

### Conversion Function

```typescript
function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number>
): number {
  if (fromCurrency === toCurrency) return amount;

  // rates are relative to base currency
  const rate = rates[toCurrency] / rates[fromCurrency];
  return amount * rate;
}
```

---

## Caching Rates

- Cache rates in memory during session
- Show "Rates as of [timestamp]" in UI
- "Refresh rates" button for manual update
- Rates NOT persisted to IndexedDB (always fetch fresh when needed)

---

## Offline Behavior

When offline:

- Conversion feature disabled
- Show: "Currency conversion requires internet"
- Original currency values always visible

---

## Edge Cases

| Case                         | Handling                                 |
| ---------------------------- | ---------------------------------------- |
| Unknown currency code        | Show as-is, skip in conversion           |
| API error                    | Show error, fall back to original values |
| Very old rates               | Always fetch fresh, no long-term caching |
| User enters invalid currency | Validate against known ISO 4217 codes    |
