import { registerPlugin } from "@capacitor/core";
import type { DailyValue, DailySleepValue } from "./HealthKitPlugin";

/**
 * Android Health Connect plugin — JS bridge.
 *
 * Surface mirrors `HealthKitPlugin.ts` so `useHealthSync.ts` can swap
 * implementations by platform without diverging logic. The native Kotlin
 * implementation lives in `android-plugin/HealthConnectPlugin.kt` and is
 * installed into the Capacitor Android project via `scripts/post-cap-sync.sh`.
 *
 * Invariants (see HEALTH_SYNC_INVARIANTS.md):
 *  - All day-bucketed results MUST be keyed to start-of-local-day YYYY-MM-DD.
 *  - `isAvailable()` must resolve `{ available: false }` instead of throwing
 *    when Health Connect is not installed on the device.
 */
export interface HealthConnectPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  requestAuthorization(): Promise<{ granted: boolean }>;
  querySteps(options: { startDate: string; endDate: string }): Promise<{ values: DailyValue[] }>;
  queryActiveEnergy(options: { startDate: string; endDate: string }): Promise<{ values: DailyValue[] }>;
  queryDistance(options: { startDate: string; endDate: string }): Promise<{ values: DailyValue[] }>;
  querySleep(options: { startDate: string; endDate: string }): Promise<{ values: DailySleepValue[] }>;
}

const HealthConnect = registerPlugin<HealthConnectPlugin>("HealthConnectPlugin");
export default HealthConnect;
