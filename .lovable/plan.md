

# Fix Plan: Health Sync, StoreKit Purchases, and Add Food Overlay

## Issue 1: Apple Health Sync — "Health sync temporarily failed"

**Root Cause**: The `StoreError` enum is defined in BOTH `StoreKitPlugin.swift` AND `storekitmanager.swift`. When Xcode compiles both files, this causes a **duplicate symbol conflict** that can crash or destabilize the native bridge at runtime. This means ANY native plugin call (including HealthKit) may fail unpredictably.

Additionally, the `StoreKitPlugin.swift` and `StoreKitManager` are both independently calling `Product.products(for:)` and `Transaction.currentEntitlements`, which can create race conditions on the StoreKit 2 actor.

**The health sync TypeScript code itself is correct** — the 2-hour interval, global lock, and query logic are all sound. The failure is happening at the native bridge level.

**Fix (Native Swift — must be applied in Xcode, not Lovable)**:
1. Remove the `enum StoreError` from `StoreKitPlugin.swift` (lines 14-16) since `StoreKitManager.swift` already defines it
2. Or, rename one of them (e.g., `enum StoreKitPluginError` in StoreKitPlugin.swift)

**Fix to apply in Lovable**: Add more resilient error handling and a retry mechanism in `useHealthSync.ts` so that if the first sync attempt fails on app launch (native bridge not yet ready), it retries after a delay instead of immediately showing the error toast.

**Changes**:
- `src/hooks/useHealthSync.ts`: Add a single automatic retry with a 5-second delay when the initial auto-sync fails, before surfacing the error. This handles the case where the native bridge is briefly unstable after launch.

## Issue 2: StoreKit — "Unable to connect to App Store"

**Root Cause**: Duplicate `StoreError` enum between `StoreKitPlugin.swift` and `storekitmanager.swift` causes a compile-time or runtime conflict. The `StoreKitManager` is initialized eagerly in `AppDelegate` (`let _ = StoreKitManager.shared`), which loads products immediately. But `StoreKitPlugin` also tries to load products independently via `getProducts()`. The duplicate enum and parallel product loading create instability.

**Fix (Native Swift — must be applied in Xcode)**:
1. Remove `enum StoreError` from `StoreKitPlugin.swift` — let `storekitmanager.swift` own it
2. In `StoreKitPlugin.swift`, have `getProducts()` delegate to `StoreKitManager.shared` instead of making its own `Product.products(for:)` call, ensuring a single source of truth

**Fix to apply in Lovable**: The `Subscribe.tsx` JS-side code has a subtle bug — when `fetchProducts()` is called inside `handleSubscribe`, the `loadedProductIds` state won't be updated yet (React state is async). The check `!loadedProductIds.has(plan.productId)` on line 114 will still see the OLD empty set even after `fetchProducts` successfully loaded products.

**Changes**:
- `src/pages/Subscribe.tsx`: Make `fetchProducts()` return the set of loaded IDs directly instead of relying on stale React state. Check the returned set inside `handleSubscribe` instead of the state variable.

## Issue 3: Add Food Overlay Shifts Down on iOS

**Root Cause**: The `visualViewport` resize listener pins the overlay height to `vv.height`, but on iOS Safari/WKWebView, when the keyboard dismisses, `visualViewport.height` may momentarily report an incorrect value. Combined with the `overflow: "hidden"` inline style and the `focusout` handler, the overlay can get stuck at a reduced height. After keyboard dismiss, `window.scrollTo(0, 0)` doesn't fully reset the WebView's internal scroll offset in Capacitor's WKWebView (where `scrollEnabled: false` is set in capacitor.config).

The core problem: setting an explicit pixel `height` via JS on the overlay container fights with the CSS `inset: 0` from `.overlay-fullscreen`. When the viewport resizes back, the stale JS height remains.

**Fix**:
- `src/components/nutrition/AddFoodScreen.tsx`: Instead of setting explicit pixel height on the overlay, use `dvh` (dynamic viewport height) units via CSS and remove the JS height-pinning approach. On keyboard open, just ensure `window.scrollTo(0,0)`. On keyboard dismiss (focusout), reset scroll and force repaint — but do NOT set explicit height. The `overlay-fullscreen` class with `fixed inset-0` already handles the correct sizing.

**Changes**:
- `src/components/nutrition/AddFoodScreen.tsx`: Replace the `visualViewport` resize listener (lines 951-996) with a simpler approach that only does `window.scrollTo(0,0)` on viewport resize and focusout, without setting explicit pixel heights. Remove `overflow: "hidden"` from the inline style (line 1126) — let the CSS class handle overflow.

---

## Summary of Lovable File Changes

### 1. `src/hooks/useHealthSync.ts`
- Add retry logic to the initial auto-sync: if the first sync fails, wait 5 seconds and retry once before giving up

### 2. `src/pages/Subscribe.tsx`
- Make `fetchProducts()` return the loaded product ID set directly
- In `handleSubscribe`, use the returned set for validation instead of stale state

### 3. `src/components/nutrition/AddFoodScreen.tsx`
- Remove the `visualViewport` height-pinning logic
- Keep only `window.scrollTo(0,0)` on focusout and a repaint trigger
- Remove inline `overflow: "hidden"` style — let CSS handle it

## Required Native (Xcode) Changes — User Must Apply Manually

1. **Remove duplicate `enum StoreError`** from `StoreKitPlugin.swift` (it's already in `storekitmanager.swift`)
2. Optionally: have `StoreKitPlugin.getProducts()` delegate to `StoreKitManager.shared.products` instead of making independent StoreKit API calls

These Swift changes cannot be made from Lovable and must be applied in Xcode before the next archive/build.

