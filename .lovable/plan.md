

## Diagnosis Summary

I've audited your entire setup. Here is what is happening and why none of the three fixes are reaching your TestFlight build:

### Problem 1: StoreKit purchases fail ("Unable to connect to App Store")

**Root cause found**: Your Xcode screenshot shows `StoreKitPlugin.swift` with `pluginMethods` containing only `checkSubscription` and `restorePurchases` -- it is **missing `purchase`, `getProducts`, and `showPaywall`**. This is an **old version** of the file that predates the current repo version. The `post-cap-sync.sh` script copies the correct file to `ios/App/App/Plugins/StoreKitPlugin.swift`, but Xcode may still be compiling the OLD file if it was originally added from a different location (e.g. directly under `App/App/` instead of `App/App/Plugins/`).

The repo's `ios-plugin/StoreKitPlugin.swift` has all 5 methods. Your Xcode only has 2. The native binary therefore has no `purchase` or `getProducts` bridge methods, so `StoreKit.getProducts()` and `StoreKit.purchase()` both silently fail.

**Fix (Xcode-side, not code-side)**:
1. In Xcode, right-click `StoreKitPlugin` in the sidebar and choose "Show in Finder" to find which file Xcode is actually compiling
2. Delete that old file reference from the Xcode project
3. Drag the file from `ios/App/App/Plugins/StoreKitPlugin.swift` (the one the script copies) into the Xcode sidebar under `Plug ins`
4. Check "Copy items if needed" + select the "App" target
5. Verify the `pluginMethods` array now lists all 5 methods: `purchase`, `checkSubscription`, `restorePurchases`, `getProducts`, `showPaywall`

Similarly, check `StoreKitBridge` and `StoreKitManager` visible in your sidebar. These files are **not in the repo** (`ios-plugin/` only has `StoreKitPlugin.swift`). They may be legacy files from an earlier implementation that are interfering. If `StoreKitBridge` contains a second class also named `StoreKitPlugin` or registers a conflicting plugin, it could shadow the correct one.

**Action needed**: Send me a screenshot of what `StoreKitBridge.swift` and `StoreKitManager.swift` contain (first ~30 lines each) so I can confirm whether they conflict.

### Problem 2: HealthKit sync fails

You confirmed HealthKitPlugin.swift IS in Compile Sources now. The sync error ("Health sync temporarily failed") in your screenshot is the improved error message from the latest code, meaning the web code IS reaching the device. The native plugin is compiled. The failure is likely a transient issue or the plugin needs a fresh authorization prompt after reinstall.

**Test**: After rebuilding with the fixed StoreKitPlugin, test the manual sync button again. If it still fails, I will add diagnostic console logging to surface the exact native error.

### Problem 3: Overlay gap on food search

Looking at your screenshot (IMG_4389), there is a visible gap between the iOS status bar and the "Breakfast" header. The `.overlay-fullscreen` CSS class applies `padding-top: env(safe-area-inset-top, 0px)` (which is ~59px on iPhone 15/16 Pro for the Dynamic Island), and then the header has `pt-2` (8px). Total: ~67px. This looks correct for accounting for the notch/Dynamic Island.

However, comparing to IMG_4390 (the main nutrition view under the app shell), the header sits tighter. The difference is that the app shell header uses `pt-[env(safe-area-inset-top,0px)]` as an inline style on the header element itself, while the overlay applies safe area padding on the container and adds header padding on top.

**Fix**: Reduce the overlay's safe area padding approach to match the app shell exactly. Instead of padding the container, apply the safe area inset directly to the header row.

---

## Plan

### Change 1: Fix overlay header alignment (`src/index.css`)

Remove `padding-top` from `.overlay-fullscreen` and let each overlay header handle its own safe-area offset (matching the app shell pattern).

```css
.overlay-fullscreen {
  position: fixed;
  inset: 0;
  background-color: hsl(var(--background));
  display: flex;
  flex-direction: column;
  /* Remove padding-top from here */
  padding-bottom: env(safe-area-inset-bottom, 0px);
  overscroll-behavior-y: contain;
}
```

### Change 2: Add safe-area-inset to overlay headers (7 files)

In each overlay file, change the header div from `pt-2` to include the safe area