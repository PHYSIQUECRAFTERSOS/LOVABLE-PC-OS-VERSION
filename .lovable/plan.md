
## Why steps and sleep aren't syncing for Joe (Android)

After reviewing the code, there are two real problems — not a small bug:

1. **`useHealthSync.ts` only runs the native sync block when `platform === "ios"`.** On Android it never queries any health source, so the dashboard's Steps / Sleep cards stay blank. The hook currently sets `provider = "google_fit"` on Android but then does nothing with it.
2. **The Google Fit REST API used by `google-fit-auth-start` / `sync-wearable-steps` was officially shut down by Google on June 30, 2025.** Even when a user completes the OAuth flow, the token works briefly (or not at all) and the aggregate steps/sleep endpoints return errors. Google's replacement on Android is **Health Connect** — a native API, not a REST/OAuth API. There is no working "Google Fit" web sync to fix.
3. There is no Android native plugin in the repo. `ios-plugin/HealthKitPlugin.swift` exists, but there is no Kotlin/Java counterpart, so Android currently has no way to read step or sleep data at all.

The fix is to add **Android Health Connect** as a first-class sync source, mirroring the iOS HealthKit path, and quietly retire the dead Google Fit OAuth flow.

## Plan

### 1. Add a Capacitor Health Connect plugin (Android)
- Install `capacitor-health-connect` (community plugin that wraps Android's `androidx.health.connect.client`) and register it in `MainActivity`.
- Add Health Connect permissions to `android/app/src/main/AndroidManifest.xml` for: `Steps`, `Distance`, `ActiveCaloriesBurned`, `SleepSession`.
- Add the Health Connect permission-rationale activity declaration required by Google Play's Health Connect policy.
- Update `scripts/post-cap-sync.sh` so the manifest/plugin glue isn't lost on `npx cap sync`.

### 2. Create a JS wrapper mirroring the HealthKit plugin shape
- New file `src/plugins/HealthConnectPlugin.ts` exposing the same surface used by iOS today: `isAvailable()`, `requestAuthorization()`, `querySteps`, `queryDistance`, `queryActiveEnergy`, `querySleep` — each returning `{ date, value }[]` keyed by local YYYY-MM-DD via `getLocalDateString()` (invariant #1).
- Handle the Android-specific "Health Connect app not installed" case by returning `available: false` instead of throwing, so Settings still renders cleanly (invariant #3).

### 3. Wire Android into `useHealthSync.ts`
- Replace the `if (isNative && platform === "ios")` branch with a shared `if (isNative)` branch that picks `HealthKit` on iOS and `HealthConnect` on Android.
- Keep the same `allSettled`-style per-metric error handling, global sync lock, 2-hour interval, foreground-resume sync, and `logSyncEvent` calls (invariants #2, #4, #5).
- Store the connection row with `provider: "google_fit"` (keeps existing `health_connections` rows and dashboard queries working) but write `source: "health_connect"` on `daily_health_metrics` so coaches can tell where data came from.

### 4. Update the Settings UI (`HealthIntegrations.tsx`)
- On Android native, replace the dead OAuth "Google Fit" tile with a **Health Connect** tile that uses the same Connect / Sync / Disconnect handlers already wired up for Apple Health.
- Keep the OAuth Fitbit tile (Fitbit API still works).
- On PWA Android, show a "Requires the Android app" notice and link to the Play Store listing (same pattern already used for iOS).

### 5. Retire the broken Google Fit OAuth path safely
- Leave the existing edge functions in place but make `google-fit-auth-start` return a clear "Google Fit API was retired by Google — please use Health Connect in the Android app" message instead of an OAuth URL, so any old buttons/links don't silently fail.
- Don't drop any tables or existing `wearable_connections` rows.

### 6. Verify
- Typecheck and build.
- Run a Playwright pass on `/profile` (settings) to confirm the Health Connect tile renders for Android UA and the Apple Health tile is unchanged for iOS UA.
- Add a short note in `HEALTH_SYNC_INVARIANTS.md` documenting the Android path so future edits don't regress it.

## Technical notes (for the engineer)

- Health Connect APIs require `compileSdk = 34+` and `minSdk = 26`; check `android/variables.gradle` and bump if needed.
- Sleep is read from `SleepSessionRecord` + `SleepStageRecord`; map stages → `deep/rem/light/awake_minutes` to match the existing `sleep_logs` schema already used by iOS.
- Health Connect uses an explicit permission contract launched from an Activity. The plugin call must happen after Capacitor bridge ready (invariant #2). The user grants permissions in the Health Connect system UI, not an in-app modal.
- For Joe specifically: after this ships, he must (a) update to the new Android build, (b) install/open Health Connect from the Play Store if it isn't already on his device, and (c) tap Connect → Allow on the permission screen. The first sync will backfill the last 7 days.

## Open question

Joe — is he using the **Android app from the Play Store** (the Capacitor build), or just the **website / PWA on Chrome**? Health Connect only works inside the native Android app. If he's on the PWA, the fix is to get him onto the Play Store build; there is no working web-based step/sleep sync on Android anymore. Let me know and I'll tailor the messaging in the Settings UI accordingly.
