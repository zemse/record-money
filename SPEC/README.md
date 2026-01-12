# Record Money - Technical Specification

## Overview

Decentralized expense tracking and splitting app. All data stored client-side (IndexedDB). No server-side data persistence.

**Use cases:**

- Personal expense tracking (solo)
- Group expense splitting (Splitwise-style)

## Platforms

| Platform          | Status            |
| ----------------- | ----------------- |
| Web app (Netlify) | PoC - In Progress |
| iOS app           | Future            |
| Android app       | Future            |

## Tech Stack

| Layer     | Choice                          |
| --------- | ------------------------------- |
| Framework | React + TypeScript              |
| Storage   | IndexedDB (via Dexie.js or idb) |
| Styling   | Tailwind CSS                    |
| PWA       | Workbox (service worker)        |
| Hosting   | Netlify                         |
| AI        | Claude API (user-provided key)  |

## Spec Documents

| Document                                       | Description                             |
| ---------------------------------------------- | --------------------------------------- |
| [01-data-models.md](./01-data-models.md)       | Data structures and storage             |
| [02-data-transport.md](./02-data-transport.md) | Import/export, URL sharing, file format |
| [03-deduplication.md](./03-deduplication.md)   | Duplicate detection and merge logic     |
| [04-ai-integration.md](./04-ai-integration.md) | Claude API, chat UI, vision features    |
| [05-pwa-offline.md](./05-pwa-offline.md)       | Service worker, offline support         |
| [06-currency.md](./06-currency.md)             | Currency handling and conversion        |
| [07-milestones.md](./07-milestones.md)         | Development phases with review gates    |
| [08-future.md](./08-future.md)                 | Post-PoC features and ideas             |

## Security Notes

- **API key exposure:** Claude API key stored in IndexedDB, visible to XSS/extensions/physical access. Warn user. Recommend spending limits on key.
- **No server:** All data local. User responsible for backups via export.
