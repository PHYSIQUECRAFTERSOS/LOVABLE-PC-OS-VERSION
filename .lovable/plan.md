

# Plan: Fix Apple Health "Connecting..." Hang on Native iOS

## Root Cause Analysis

There are **three bugs** causing the infinite "Connecting..." state:

### Bug 1: No timeout on native plugin calls (PRIMARY CAUSE)
When `connect()` calls `HealthKit.isAvailable()` or `HealthKit.requestAuthorization()`, if the native plugin isn't properly registered in Xcode (or if there's any bridge communication failure), the Capacitor `registerPlugin` proxy **hangs forever** — the promise never resolves or rejects. Since `handleConnectAppleHealth` uses `await healthSync.connect()`, it blocks indefinitely, never reaching the `finally` block that would reset the button state.

### Bug 2: Silent error swallowing in `connect()`
When HealthKit is unavailable or authorization fails, `connect()` silently `return`s (lines 119, 125) instead of throwing an error. The caller in `handleConnectAppleHealth` catches errors, but a silent return means:
- No error toast shown to the user
- The success toast fires incorrectly
- The button resets without feedback

### Bug 3: Race condition in `syncNow()` after `connect()`
`handleConnectAppleHealth` calls `await healthSync.syncNow()` immediately after `connect()`. But `connect()` updates `connection` via `setConnection()` — a React state update that is **asynchronous**. The `syncNow` callback still sees the old `connection` value (null), so its guard `if (!connection?.is_connected)` exits immediately. The initial sync silently does nothing.

## The Fix

### File: `src/hooks/useHealthSync.ts`

**1. Add a timeout wrapper for all native plugin calls**
```typescript
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}
```
Wrap every `HealthKit.*()` call with `withTimeout(HealthKit.isAvailable(), 10000, "HealthKit.isAvailable")`. This ensures the button always unblocks.

**2. Make `connect()` throw errors instead of silently returning**
Change the silent `return` statements to `throw new Error("HealthKit is not available on this device")` and `throw new Error("HealthKit authorization failed")`. This lets the caller show proper error toasts.

**3. Fix the `syncNow` race condition**
Make `connect()` return the connection data. Then in `handleConnectAppleHealth`, pass it directly to `syncNow` or call `syncNow` with an override parameter. Alternatively, make `syncNow` accept an optional connection ID parameter to bypass the stale state check.

**4. Add diagnostic logging**
Add `console.log` breadcrumbs at each step of the connect flow so we can trace failures in TestFlight builds.

### File: `src/components/settings/HealthIntegrations.tsx`

**5. Fix `handleConnectAppleHealth` error handling**
- Catch the new thrown errors and show descriptive toasts
- Remove the premature success toast — only show it after `connect()` actually succeeds
- Handle the `syncNow` call failure gracefully (connection succeeded but initial sync failed)

## Technical Details

### Timeout values
- `isAvailable()`: 5 seconds (should be instant)
- `requestAuthorization()`: 30 seconds (user may interact with the permission dialog)
- `querySteps/queryActiveEnergy/queryDistance`: 15 seconds each

### Files to modify
- `src/hooks/useHealthSync.ts` — timeout wrapper, throw errors, fix race condition, logging
- `src/components/settings/HealthIntegrations.tsx` — fix error handling in connect