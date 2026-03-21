

# Fix: TestFlight App Showing Stale/Old UI

## Root Cause

The TestFlight app loads your web code from the Lovable preview URL (correct), but the **Service Worker** (`public/sw.js`) is caching old versions of `index.html` and JS bundles inside WKWebView. Once cached, the SW serves stale assets even though the server has new code. This is why Safari/Chrome show the latest UI (no SW or fresh SW) while the TestFlight build shows the old layout.

## Solution

Two changes to ensure the native Capacitor shell always gets fresh code:

### 1. `public/sw.js` — Skip SW entirely inside Capacitor

Add a check at the top of the `fetch` listener: if running inside Capacitor's native WebView, bypass all caching and go straight to the network. Also bump the cache version so any existing stale cache is purged on next activation.

- Change `CACHE_NAME` from `'physique-crafters-v2'` to `'physique-crafters-v3'` (forces old cache deletion on activate)
- In the `fetch` handler, detect Capacitor via `navigator.userAgent` containing `Capacitor` and skip caching entirely
- This means the native shell always fetches fresh code from the server

### 2. `index.html` — Unregister SW inside Capacitor shell

Add a script block that detects the Capacitor environment and **unregisters** any existing Service Worker. This clears the stale cache immediately on next app launch:

```html
<script>
  if (window.Capacitor || navigator.userAgent.includes('Capacitor')) {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(registrations) {
        registrations.forEach(function(reg) { reg.unregister(); });
      });
      caches.keys().then(function(names) {
        names.forEach(function(name) { caches.delete(name); });
      });
    }
  } else if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }
</script>
```

This replaces the current unconditional SW registration. In the native shell, it actively unregisters and clears caches. In browsers, it registers normally.

### Summary of file changes
- **`public/sw.js`** — Bump cache version to v3; skip caching for Capacitor user agents
- **`index.html`** — Conditionally unregister SW + clear caches when running in Capacitor, otherwise register normally

### After deploying
You will need to:
1. Force-close the TestFlight app completely
2. Reopen it — the first load will clear the old SW/cache and fetch fresh code
3. All future updates from Lovable will appear immediately in the native app

