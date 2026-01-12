# PWA & Offline Support

App must work fully offline (except AI features).

---

## Progressive Web App Requirements

### Manifest File

`public/manifest.json`:

```json
{
  "name": "Record Money",
  "short_name": "RecordMoney",
  "description": "Decentralized expense tracking",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#4F46E5",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### HTML Head

```html
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#4F46E5">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
```

---

## Service Worker

Using **Workbox** for simplified caching strategies.

### Setup

```bash
npm install workbox-webpack-plugin
# or for Vite:
npm install vite-plugin-pwa
```

### Strategy

| Resource | Strategy | Reason |
|----------|----------|--------|
| HTML, JS, CSS | Cache-first, update in background | Fast loads, always works offline |
| Icons, fonts | Cache-first | Static assets |
| API calls (Claude) | Network-only | Cannot cache, requires live connection |

### Workbox Config (Vite)

```typescript
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa';

export default {
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.anthropic\.com\/.*/i,
            handler: 'NetworkOnly',  // AI calls need network
          }
        ]
      },
      manifest: {
        name: 'Record Money',
        short_name: 'RecordMoney',
        // ... rest of manifest
      }
    })
  ]
};
```

---

## Offline Indicator

Show user when they're offline.

### Implementation

```typescript
// hooks/useOnlineStatus.ts
import { useState, useEffect } from 'react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
```

### UI Component

```tsx
function OfflineBanner() {
  const isOnline = useOnlineStatus();
  
  if (isOnline) return null;
  
  return (
    <div className="bg-yellow-100 text-yellow-800 px-4 py-2 text-center text-sm">
      📡 You're offline. Changes are saved locally.
    </div>
  );
}
```

---

## IndexedDB (Already Offline-Ready)

IndexedDB works fully offline. No additional work needed for data storage.

All CRUD operations on records, users, groups work without network.

---

## What Works Offline

| Feature | Offline? |
|---------|----------|
| View records | ✅ |
| Add/edit/delete records | ✅ |
| Balance calculation | ✅ |
| Groups management | ✅ |
| File import/export | ✅ |
| URL import (if already on page) | ✅ |
| AI chat | ❌ |
| Receipt scanning | ❌ |
| Bank statement parsing | ❌ |
| Currency conversion (live rates) | ❌ |

---

## Add to Home Screen

PWA enables "Add to Home Screen" on mobile browsers.

### iOS Safari
- Share button → Add to Home Screen

### Android Chrome
- Menu → Add to Home Screen
- Or automatic prompt after engagement criteria met

### Testing

Use Lighthouse in Chrome DevTools to audit PWA compliance.

Target score: 100 on PWA audit.

---

## Update Flow

Using `autoUpdate` registration:

1. User opens app
2. Service worker checks for updates in background
3. If update found, downloads new assets
4. On next visit, new version is active

Optional: Show "Update available" toast with refresh button for immediate update.
