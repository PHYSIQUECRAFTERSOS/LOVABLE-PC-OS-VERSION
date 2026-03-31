

## Diagnosis

### The Core Problem: `npx cap sync` erases custom native files

This is a **known Capacitor behavior**. `npx cap sync ios` copies the `dist/` web build into `ios/App/App/public/` and updates native dependencies. During this process, Capacitor may regenerate parts of the iOS project structure, and **any Swift files you manually dragged into Xcode are only tracked by the `.xcodeproj` file — not by Capacitor**. If the `.xcodeproj` gets regenerated or if the file references break, your plugins disappear from the sidebar.

Your `ios-plugin/` folder in the repo contains the source files, but there is **no automation** that copies them into the Xcode project after sync. You've been doing this manually, and when you forget one (like HealthKitPlugin), that feature silently breaks.

### What I see in your Xcode screenshot

Looking at the left sidebar:
- **Present**: StoreKitPlugin, StoreKitBridge, StoreKitManager, PushNotificationsBridge (marked "A" = added), HealthKitPlugin (marked "A"), AudioMixPlugin (marked "A"), PaywallView (marked "M" = modified), AppDelegate
- The "A" markers mean these files are **untracked by git** — they exist only in the Xcode project folder, not synced from your repo. That's why they vanish.

### Why each bug occurs

| Bug | Root Cause |
|-----|-----------|
| **Steps not syncing** | HealthKitPlugin.swift was missing from the last TestFlight build — the JS calls `HealthKit.querySteps()` but the native plugin isn't registered, so every call rejects |
| **Subscribe not working** | Likely the same class of issue — check that StoreKitManager.swift still references only the 2 active product IDs, and that the PaywallView doesn't reference the removed `training` product |
| **Old version 20% of time** | The service worker cache (`physique-crafters-v8`) serves stale assets. On iOS Capacitor with `server.url` pointing to production, the WebView loads from the remote URL and the SW sometimes serves cached HTML |
| **Overlay still broken** | The overlay CSS fix was deployed to the web (`index.css` with `.overlay-fullscreen`) but if the SW serves a cached older `index.css`, the fix doesn't apply |

---

## Plan

### 1. Create a post-sync script that auto-copies native plugins

**New file: `scripts/post-cap-sync.sh`**

A shell script that copies all files from `ios-plugin/` into `ios/App/App/Plugins/` after every `npx cap sync`. This ensures the Swift files are always physically present on disk.

```bash
#!/bin/bash
PLUGIN_SRC="ios-plugin"
PLUGIN_DST="ios/App/App/Plugins"
mkdir -p "$PLUGIN_DST"
cp -v "$PLUGIN_SRC"/*.swift "$PLUGIN_DST/"
echo "✅ Native plugins synced to Xcode project"
```

**Update `package.json`** — add a convenience script:
```json
"scripts": {
  "cap:sync": "npx cap sync ios && bash scripts/post-cap-sync.sh",
  "cap:build": "npm run build && npm run cap:sync && npx cap open ios"
}
```

This way, running `npm run cap:sync` always restores the plugin files.

**Important caveat**: This puts the `.swift` files on disk, but they also need to be **referenced in the Xcode project file** (`.xcodeproj`). The first time after cloning, you still need to drag them into Xcode once. After that, as long as you don't delete the `ios/` folder, the references persist. The script ensures the actual files are there even if git doesn't track the `ios/` folder.

### 2. Add `ios-plugin/` copy instructions to a pre-build checklist

**Update `ios-plugin/README.md`** — add a "After cap sync" section that documents:
- Always run `bash scripts/post-cap-sync.sh` after `npx cap sync`
- Or use `npm run cap:sync` instead of `npx cap sync ios` directly
- First time only: drag the files from `ios/App/App/Plugins/` into the Xcode sidebar and check "Copy items if needed"

### 3. Fix the stale app / old version problem

The `capacitor.config.ts` has `server.url: 'https://app.physiquecrafters.com'` which means the iOS app loads the **remote** website, not the local `dist/` bundle. Combined with the service worker, this causes:
- 80% of the time: network-first fetch succeeds → fresh version
- 20% of the time: network is slow or flaky → SW serves cached old version

**Fix in `public/sw.js`**: For navigation requests (HTML), **never serve from cache** inside a Capacitor native app. Bump cache to v9 to force purge.

### 4. Bump service worker cache version

**File: `public/sw.js`** — change `CACHE_NAME` from `physique-crafters-v8` to `physique-crafters-v9` and add a check: if the request is a navigation request AND we're in a Capacitor context, always go network-only (no cache fallback for HTML).

### 5. No code changes needed for HealthKit

The HealthKit sync code in `useHealthSync.ts` is correct. The failure was purely because the native `HealthKitPlugin.swift` wasn't compiled into the app binary. Once you rebuild with the plugin file present in Xcode, steps will sync.

### 6. No code changes needed for overlays

The `.overlay-fullscreen` CSS class fix is already in `index.css`. The issue on device is the same stale cache problem — once the SW cache is busted (step 4), the overlay fix will apply.

---

## Summary of file changes

| File | Change |
|------|--------|
| `scripts/post-cap-sync.sh` | **New** — copies `ios-plugin/*.swift` into `ios/App/App/Plugins/` |
| `package.json` | Add `cap:sync` and `cap:build` convenience scripts |
| `public/sw.js` | Bump to v9, never cache-serve navigation requests |
| `ios-plugin/README.md` | Add post-sync instructions |

### Your new build sequence

```bash
git pull origin main
npm install
npm run build
npm run cap:sync        # ← this replaces "npx cap sync ios"
npx cap open ios
# In Xcode: Clean Build (⇧⌘K) → Archive → Upload to TestFlight
```

### What you still need to verify in Xcode (not fixable from Lovable)

1. **StoreKitManager.swift** — confirm the product ID array does NOT contain `com.physiquecrafters.app.training`
2. **PaywallView.swift** — confirm no `case "com.physiquecrafters.app.training"` blocks remain
3. **Signing & Capabilities** — confirm both "HealthKit" and "In-App Purchase" capabilities are enabled
4. **Info.plist** — confirm `NSHealthShareUsageDescription` key exists

