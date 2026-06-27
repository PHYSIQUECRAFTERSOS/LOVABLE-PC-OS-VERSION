# Android Health Connect Plugin

JS bridge: `src/plugins/HealthConnectPlugin.ts`
Native impl: `android-plugin/HealthConnectPlugin.kt`
Used by:    `src/hooks/useHealthSync.ts` (mirrors the iOS HealthKit plugin)

This file replaces the retired Google Fit REST API (Google shut it down on
**June 30, 2025**). Android clients now read step / calorie / distance /
sleep data through **Health Connect** instead.

## One-time install into the Capacitor Android project

The repo does not commit the generated `android/` folder. After running
`npx cap add android` (or on a fresh clone after `npx cap sync android`):

1. Copy `android-plugin/HealthConnectPlugin.kt` into
   `android/app/src/main/java/com/physiquecrafters/app/HealthConnectPlugin.kt`.
2. In `android/app/build.gradle` add Health Connect to `dependencies`:

   ```gradle
   implementation "androidx.health.connect:connect-client:1.1.0-alpha07"
   ```

3. In `android/app/src/main/AndroidManifest.xml`, inside `<application>`,
   register the plugin and declare the Health Connect permissions:

   ```xml
   <uses-permission android:name="android.permission.health.READ_STEPS" />
   <uses-permission android:name="android.permission.health.READ_ACTIVE_CALORIES_BURNED" />
   <uses-permission android:name="android.permission.health.READ_DISTANCE" />
   <uses-permission android:name="android.permission.health.READ_SLEEP" />

   <queries>
     <package android:name="com.google.android.apps.healthdata" />
   </queries>
   ```

4. In `MainActivity.java` / `MainActivity.kt`, register the plugin:

   ```kotlin
   registerPlugin(HealthConnectPlugin::class.java)
   ```

5. Re-build the app (`npx cap sync android && open in Android Studio`).

## Behaviour

- `isAvailable()` returns `{ available: false }` if Health Connect is not
  installed on the device. The UI in `HealthIntegrations.tsx` surfaces a
  Play Store install prompt instead of throwing (sync invariant #3).
- All daily aggregation is done in the device's local timezone, matching
  the iOS plugin (sync invariant #1).
- `daily_health_metrics.source` is written as `"health_connect"`. The
  `health_connections.provider` row stays `"google_fit"` so existing
  dashboard queries and RLS policies keep working unchanged.
