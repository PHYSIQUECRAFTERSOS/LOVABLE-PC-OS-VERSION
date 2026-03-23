

# Plan: Fix Apple Health "HealthKitPlugin failed to load" Error

## Root Cause

The issue is a **dynamic import failure** in production. Here's why:

Your Capacitor app loads its web content from a remote URL (`https://app.physiquecrafters.com`). The `useHealthSync.ts` hook uses a **dynamic import** (`await import("@/plugins/HealthKitPlugin")`) to load the HealthKit module. Vite code-splits this into a separate network-fetched chunk.

Compare this to StoreKit — which **works perfectly** — because it's imported **statically** (`import StoreKit from "@/plugins/StoreKitPlugin"`) in `useSubscription.tsx` and `Subscribe.tsx`. The StoreKit module is bundled into the main app code and always available.

The HealthKit module, on the other hand, is in a separate chunk that must be fetched over the network at runtime. If there's any caching mismatch, stale service worker interference, or the chunk hash changed between deployments, the fetch fails or hangs — triggering the 5-second timeout and showing "HealthKitPlugin failed to load."

Additionally, `useHealthKit.ts` (which does a static import of HealthKitPlugin) is **dead code** — it's not imported anywhere in the app. So the HealthKitPlugin module is exclusively loaded via dynamic import, making it vulnerable to chunk-loading failures.

Your Xcode setup is correct — the Swift plugin is properly compiled and registered. This is purely a web-side module loading issue.

## The Fix

### File: `src/hooks/useHealthSync.ts`

**1. Replace dynamic import with static import**
Change from lazy-loading the HealthKit plugin to importing it at the top of the file, just like StoreKit does. The module is tiny (just a `registerPlugin` call that creates a proxy object) — there's zero benefit to code-splitting it.

```typescript
// BEFORE (broken):
const getHealthKitPlugin = async () => {
  const mod = await import("@/plugins/HealthKitPlugin");
  return mod.default;
};
// ... later: await pluginTimeout(getHealthKitPlugin(), 5000, ...)

// AFTER (fixed):
import HealthKit from "@/plugins/HealthKitPlugin";
// ... later: just use HealthKit directly
```

**2. Remove the unnecessary