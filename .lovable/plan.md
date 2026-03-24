

# Plan: Fix HealthKit Sync Failures + Add 2-Hour Auto-Sync

## Root Cause

The error **"Query failed: Authorization not determined"** happens because `syncNow()` calls HealthKit query methods (querySteps, queryActiveEnergy, queryDistance) **without first calling `requestAuthorization()`**. On iOS, HealthKit queries fail with this error when the authorization status hasn't been confirmed in the current app session. The `connect()` flow requests auth, but subsequent manual syncs skip it.

Today's steps showing **0** is a downstream effect — the sync fails silently on app resume, so stale data from the morning persists but today's count never updates.

## Changes

### File: `src/hooks/useHealthSync.ts`

**A. Re-request authorization before every HealthKit query in `syncNow()`**

Before the `Promise.all([querySteps, queryActiveEnergy, queryDistance])` block, add a `requestAuthorization()` call. On iOS this is safe to call repeatedly — it's a no-op if already granted, and it ensures the authorization status is "determined" before querying.

**B. Add automatic 2-hour background sync interval**

Add a `useEffect` that, when the user is authenticated and connected on native iOS:
1. Runs an initial sync 5 seconds after mount (to catch data accumulated while app was closed)
2. Sets a `setInterval` every 2 hours (7,200,000ms) that calls `syncNow()`
3. Adds an `App.addListener("appStateChange")` handler from `@capacitor/app` that triggers a sync when the app returns to foreground (if last sync was >30 minutes ago)
4. Cleans up interval and listener on unmount

This ensures all clients with Apple Health connected get their steps/distance updated regularly without manual intervention.

**C. Wrap HealthKit errors with user-friendly messages**

Catch the specific "Authorization not determined" error and re-throw with a clearer message: "Please open Settings > Health > Physique Crafters and enable access."

### File: `src/components/settings/HealthIntegrations.tsx`

**D. Improve error display for sync failures**

The `handleSyncAppleHealth` already shows `err.message` in a toast. No change needed — the improved error messages from the hook will flow through automatically.

## Technical Flow After Fix

```text
App launches / returns to foreground
  → useHealthSync checks: connected? last_sync > 30min ago?
  → YES → requestAuthorization() (ensures "determined" state)
  → querySteps + queryActiveEnergy + queryDistance
  → upsert to daily_health_metrics
  → dashboard shows fresh steps

Every 2 hours while app is open:
  → same flow automatically

User taps manual sync:
  → requestAuthorization() first (prevents "not determined" error)
  → query + upsert → toast "Sync complete"
```

## Files to modify
- `src/hooks/useHealthSync.ts` — add auth before queries, add 2-hour interval + foreground sync

