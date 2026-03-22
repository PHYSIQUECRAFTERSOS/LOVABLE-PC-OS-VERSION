

# Fix: StoreKit Plugin Not Found in TestFlight

## Problem
The `Subscribe` page, `SubscriptionCard`, and `useSubscription` hook all access the StoreKit plugin via:
```typescript
(window as any).Capacitor?.Plugins?.StoreKit
```
This is a **legacy Capacitor 2 pattern**. In Capacitor 4+, custom native plugins must be registered using `registerPlugin()` from `@capacitor/core`. The plugin exists in your Xcode project but the JS side cannot find it, so the code falls back to `window.open("https://physiquecrafters.com")`.

## Fix

### Step 1: Create a StoreKit plugin bridge file
**New file: `src/plugins/StoreKitPlugin.ts`**

Use `registerPlugin` from `@capacitor/core` to create a typed JS bridge for the native StoreKit plugin:
```typescript
import { registerPlugin } from '@capacitor/core';

export interface StoreKitPlugin {
  showPaywall(): Promise<void>;
  checkSubscription(): Promise<{ hasSubscription: boolean; productIDs?: string[] }>;
  restorePurchases(): Promise<{ hasSubscription: boolean; productIDs?: string[] }>;
}

const StoreKit = registerPlugin<StoreKitPlugin>('StoreKit');
export default StoreKit;
```

### Step 2: Update `useSubscription.tsx`
Replace the `getStoreKit()` function that uses `window.Capacitor?.Plugins?.StoreKit` with an import of the registered plugin, and use `Capacitor.isNativePlatform()` to gate native-only calls.

### Step 3: Update `Subscribe.tsx`
Same change — import the registered plugin and use `Capacitor.isNativePlatform()` instead of checking if `getStoreKit()` returns null.

### Step 4: Update `SubscriptionCard.tsx`
Replace the inline `window.Capacitor?.Plugins?.Store