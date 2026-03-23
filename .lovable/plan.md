

# Plan: Integrate Apple Health (HealthKit) Sync on Native iOS

## Overview

Now that you have Xcode set up, we'll create a real HealthKit Capacitor plugin (similar to your existing StoreKitPlugin pattern), wire it into the JS layer, and update the Settings page so Apple Health shows as a fully functional Connect/Sync/Disconnect integration on native iOS — while still showing "Native App Only" on PWA.

## What Gets Built

### 1. Native Swift Plugin — `ios-plugin/HealthKitPlugin.swift`
A new Capacitor plugin following the same `CAPBridgedPlugin` pattern as your StoreKitPlugin:
- `requestAuthorization()` — requests read access to steps, active energy, walking/running distance, body mass
- `querySteps(startDate, endDate)` — returns daily step counts for a date range
- `queryActiveEnergy(startDate, endDate)` — returns daily active calories
- `queryDistance(startDate, endDate)` — returns daily walking/running distance in km
- `queryWeight()` — returns most recent body mass reading
- `isAvailable()` — checks `HKHealthStore.isHealthDataAvailable()`

Uses HealthKit `HKStatisticsCollectionQuery` for efficient daily aggregation.

### 2. JS Bridge — `src/plugins/HealthKitPlugin.ts`
TypeScript wrapper that calls the native plugin via `Capacitor.registerPlugin("HealthKitPlugin")`, matching the same pattern as your existing `StoreKitPlugin.ts`. Provides typed methods the hooks can call.

### 3. Update `src/hooks/useHealthSync.ts`
- In `connect()`: when `platform === "ios"`, call `HealthKitPlugin.requestAuthorization()` before writing the DB record. If the user denies, abort.
- In `syncNow()`: when `platform === "ios"`, call `HealthKitPlugin.querySteps/queryActiveEnergy/queryDistance` for the last 7 days and upsert real data into `daily_health_metrics`.

### 4. Update `src/components/settings/HealthIntegrations.tsx`
- Detect native iOS via `Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios"`
- When on native iOS: render Apple Health with the same Connect/Sync/Disconnect UI as Fitbit/Google Fit (not the grayed-out "Native App Only" badge)
- When on PWA: keep the existing "Native App Only" display
- The connect button calls `useHealthSync().connect()` which triggers the HealthKit permission prompt
- Update the info banner to conditionally hide the "Apple Health requires native app" message on native

### 5. Xcode Setup Guide — `ios-plugin/HealthKitREADME.md`
Step-by-step instructions (same format as your StoreKit README):
- Add `HealthKitPlugin.swift` to `App/App/Plugins/`
- Enable "HealthKit" capability in Xcode Signing & Capabilities
- Add `NSHealthShareUsageDescription` to `Info.plist`
- `npx cap sync ios` → build and run

## Files to Create
- `ios-plugin/HealthKitPlugin.swift` — native Swift plugin
- `src/plugins/HealthKitPlugin.ts` — JS bridge
- `ios-plugin/HealthKitREADME.md` — Xcode setup guide

## Files to Modify
- `src/hooks/useHealthSync.ts` — call native plugin on iOS
- `src/components/settings/HealthIntegrations.tsx` — show full Apple Health UI on native iOS

## Apple Compliance Notes
- HealthKit usage description is required in `Info.plist` — we'll provide the exact string
- Only request read permissions (no writing to HealthKit) — minimizes review friction
- The capability must be added in Xcode or the app will crash at runtime
- Apple requires HealthKit data to be used for health/fitness purposes only — our coaching use case qualifies

