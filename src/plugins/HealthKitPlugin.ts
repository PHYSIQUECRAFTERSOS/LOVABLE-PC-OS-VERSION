import { registerPlugin } from '@capacitor/core';

export interface DailyValue {
  date: string;   // YYYY-MM-DD
  value: number;
}

export interface DailySleepValue {
  date: string;            // YYYY-MM-DD (wake date, local)
  totalMinutes: number;
  inBedMinutes: number;
  asleepMinutes: number;
  deepMinutes: number;
  remMinutes: number;
  lightMinutes: number;
  awakeMinutes: number;
  bedtimeAt: string | null; // ISO 8601
  wakeAt: string | null;    // ISO 8601
}

export interface HealthKitPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  requestAuthorization(): Promise<{ granted: boolean }>;
  querySteps(options: { startDate: string; endDate: string }): Promise<{ values: DailyValue[] }>;
  queryActiveEnergy(options: { startDate: string; endDate: string }): Promise<{ values: DailyValue[] }>;
  queryDistance(options: { startDate: string; endDate: string }): Promise<{ values: DailyValue[] }>;
  queryWeight(): Promise<{ value_kg: number | null; value_lbs: number | null; date: string | null }>;
  /** Aggregated sleep per night (keyed to wake date, local TZ). */
  querySleep(options: { startDate: string; endDate: string }): Promise<{ values: DailySleepValue[] }>;
}

const HealthKit = registerPlugin<HealthKitPlugin>('HealthKitPlugin');
export default HealthKit;
