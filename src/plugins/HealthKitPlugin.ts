import { registerPlugin } from '@capacitor/core';

export interface DailyValue {
  date: string;   // YYYY-MM-DD
  value: number;
}

export interface HealthKitPlugin {
  /** Check if HealthKit is available on this device */
  isAvailable(): Promise<{ available: boolean }>;

  /** Request read-only authorization for steps, active energy, distance, body mass */
  requestAuthorization(): Promise<{ granted: boolean }>;

  /** Query daily step counts for a date range */
  querySteps(options: { startDate: string; endDate: string }): Promise<{ values: DailyValue[] }>;

  /** Query daily active energy burned (kcal) for a date range */
  queryActiveEnergy(options: { startDate: string; endDate: string }): Promise<{ values: DailyValue[] }>;

  /** Query daily walking+running distance (km) for a date range */
  queryDistance(options: { startDate: string; endDate: string }): Promise<{ values: DailyValue[] }>;

  /** Query the most recent body mass reading */
  queryWeight(): Promise<{ value_kg: number | null; value_lbs: number | null; date: string | null }>;
}

const HealthKit = registerPlugin<HealthKitPlugin>('HealthKitPlugin');
export default HealthKit;
