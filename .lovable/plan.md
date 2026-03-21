

# Why TestFlight Shows Old UI — and How to Fix It

## The Problem

Your Capacitor config points the native app to the **live Lovable preview URL** — so in theory, every time the app opens, it loads the latest web code from the server. However, **WKWebView** (the browser engine inside your iOS app) has its own internal HTTP/disk cache that is completely separate from the Service Worker cache. Even though we added SW-busting logic, WKWebView itself is still serving a stale copy of the HTML/JS/CSS from its own cache.

The code changes we made in Lovable (bottom tabs, subscription card, legal links, no hamburger menu) **are live on the server** — but your iOS app's WebView never re-fetched them because of WKWebView's aggressive disk cache.

## The Fix — Two Parts

### Part 1: Lovable-side change (I will make)

Add a **cache-busting query parameter** to the Capacitor server URL so WKWebView treats it as a brand-new resource and cannot serve stale content. Change `capacitor.config.ts`:

```
server.url: "https://418c5cb3-6f92-4243-9691-d28363e319a3.lovableproject.com?forceHideBadge=true&v=6"
```

Every time we push a major UI update, we bump `v=N` to force a fresh load. Additionally, I'll add WKWebView cache-clearing configuration:

```typescript
ios: {
  contentInset: 'automatic',
  allowsLinkPreview: false,
},
server: {
  url: '...',
  cleartext: true,
  // Tell Capacitor to clear WKWebView cache on each app launch
},
```

### Part 2: You rebuild in Xcode (exact steps below)

Since `capacitor.config.ts` is baked into the native binary at build time, **you must rebuild and upload a new TestFlight build** for any config change to take effect. Here are the exact steps:

1. **Pull the latest code from GitHub**
   ```bash
   cd /path/to/your/project
   git pull origin main
   ```

2. **Install dependencies** (in case any changed)
   ```bash
   npm install
   ```

3. **Build the web app**
   ```bash
   npm run build
   ```

4. **Sync Capacitor** (copies config + web assets to the iOS project)
   ```bash
   npx cap sync ios
   ```

5. **Open in Xcode**
   ```bash
   npx cap open ios
   ```

6. **In Xcode:**
   - Bump the **Build Number** (e.g. from 5 → 6) in the target's General tab
   - Select **Any iOS Device (arm64)** as the build target
   - Go to **Product → Archive**
   - Once archived, click **Distribute App → App Store Connect → Upload**
   - Wait ~15 minutes for TestFlight processing

7. **On your phone:**
   - Open TestFlight → tap Update on the new build
   - The app will now load from a fresh WKWebView cache with the latest UI

### Why previous restarts didn't work

Force-closing the app and rebooting your phone does **not** clear WKWebView's disk cache. The only reliable ways to clear it are:
- Delete and reinstall the app (but TestFlight reinstalls from the same binary = same config)
- Change the URL the native shell loads (what we're doing)
- Add native Swift code to programmatically clear WKWebView cache (overkill)

### Summary of changes

| Change | Where | Who |
|---|---|---|
| Bump cache-bust param in `capacitor.config.ts` | Lovable | Me |
| Rebuild + upload new TestFlight build | Xcode | You (steps above) |

After this, every future Lovable change will appear instantly in the TestFlight app without needing another Xcode rebuild — until WKWebView caches aggressively again, at which point we just bump `v=N`.

