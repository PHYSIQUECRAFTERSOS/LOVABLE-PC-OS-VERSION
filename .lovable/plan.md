

## Fix Stale App Versions on iOS Native App

### The Root Cause

Your iOS app uses Capacitor with `server.url` pointing to `https://app.physiquecrafters.com`. WKWebView (the browser engine inside your native app) has its **own HTTP cache** (called `URLCache` and `WKWebsiteDataStore`) that is completely separate from service workers and HTML meta tags. 

All previous fixes (service worker no-cache headers, meta tag cache-control, service worker unregistration) operate at the **web browser API level**, but WKWebView's native cache sits **underneath** those — it caches the HTML, JS, and CSS responses at the iOS networking layer before the web page even loads. This is why clients keep seeing old versions despite App Store updates.

### The Fix — Two-Part Approach

#### Part 1: Native Swift Plugin — Clear WKWebView Cache on Launch

Create a small Capacitor plugin (`CacheBusterPlugin.swift`) that clears WKWebView's entire data store on every app launch:

```swift
// Calls WKWebsiteDataStore.default().removeData(ofTypes:...)
// Clears: disk cache, memory cache, cookies (optional), offline storage
```

This runs **before** the web content loads, guaranteeing a fresh fetch from the server every time the app opens.

#### Part 2: JavaScript Startup Hook

Add a small TypeScript wrapper (`src/plugins/CacheBusterPlugin.ts`) and call it in `main.tsx` on startup when running inside Capacitor. On web, it's a no-op.

```typescript
// In main.tsx, before render:
if (Capacitor.isNativePlatform()) {
  await CacheBuster.clearCache();
}
```

#### Part 3: Capacitor Config — Disable URL Caching

Add `webViewCachePolicy` settings to `capacitor.config.ts` to tell WKWebView to always revalidate:

```typescript
ios: {
  // ... existing settings
  limitsNavigationsToAppBoundDomains: false,
},
server: {
  // ... existing url
  iosScheme: 'https',  // keep https
},
```

### Files to Create/Modify

1. **`ios-plugin/CacheBusterPlugin.swift`** (new) — Native Swift plugin that clears WKWebView cache
2. **`src/plugins/CacheBusterPlugin.ts`** (new) — TypeScript bridge for the plugin
3. **`src/main.tsx`** — Call cache clear on Capacitor startup before rendering
4. **`capacitor.config.ts`** — Add cache-prevention settings for iOS

### What You Need to Do After

After these changes are deployed:
1. **Git pull** the project locally
2. Run `npx cap sync ios`
3. Build and submit a new version to the App Store
4. When users open the updated app, WKWebView's cache will be cleared on every launch, and the latest version from `app.physiquecrafters.com` will always be fetched fresh

### Why This Will Actually Work

Previous attempts targeted the wrong layer:
- `sw.js` no-cache → Service worker is unregistered in Capacitor mode, so it never runs
- HTML meta cache-control → WKWebView ignores `<meta http-equiv="Cache-Control">` for HTTP caching decisions
- Service worker fetch interception → Disabled in Capacitor mode

This fix targets the **native iOS layer** directly — the only place where the cache actually lives.

