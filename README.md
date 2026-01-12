# Record Money

A decentralized expense tracking and splitting app. Track shared expenses, split bills, and see who owes whom - all without accounts or servers. Your data stays in your browser.

## Why Record Money?

- **No Sign-up Required** - Start tracking immediately, no accounts needed
- **Privacy First** - All data stored locally in your browser (IndexedDB)
- **Works Offline** - No internet required after first load
- **Share via Links** - Export expenses as URLs or files to share with others

## Core Concepts

### Records
Each expense entry tracks: amount, currency, who paid, who it was for, and how to split it.

### Splitting Options
- **Equal** - Split evenly among participants
- **Percentage** - Custom percentage per person
- **Exact** - Specific amounts per person
- **Shares** - Ratio-based (e.g., 2:1)

### Groups
Organize expenses by context - trips, roommates, events. Each group shows its own balance summary.

### Balances
Automatic calculation of who owes whom, with simplification (if A owes B ₹100 and B owes A ₹30, shows A owes B ₹70).

## Development

```bash
npm install
npm run dev
```

See [SPEC/07-milestones.md](SPEC/07-milestones.md) for the development roadmap.

## License

MIT
