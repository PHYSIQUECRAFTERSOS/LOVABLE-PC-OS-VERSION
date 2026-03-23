import { useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import HealthKit from "../plugins/HealthKitPlugin";

export interface HealthData {
  weight_kg?: number;
  weight_lbs?: number;
  steps?: number;
  activeEnergy?: number;
  distance?: number;
  lastSynced?: string;
}

export function useHealthKit() {
  const [data, setData] = useState<HealthData>({});
  const [available, setAvailable] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const isNative = Capacitor.isNativePlatform();

  const checkAvailability = useCallback(async () => {
    if (!isNative) {
      setAvailable(false);
      return false;
    }
    try {
      const result = await HealthKit.isAvailable();
      setAvailable(result.available);
      return result.available;
    } catch (err) {
      console.error("[HealthKit] Availability check failed:", err);
      setAvailable(false);
      return false;
    }
  }, [isNative]);

  const requestAuthorization = useCallback(async () => {
    if (!isNative || !available) return false;
    try {
      const result = await HealthKit.requestAuthorization();
      setAuthorized(result.granted);
      return result.granted;
    } catch (err) {
      console.error("[HealthKit] Authorization failed:", err);
      setAuthorized(false);
      return false;
    }
  }, [isNative, available]);

  const connect = useCallback(async () => {
    const isAvailable = await checkAvailability();
    if (!isAvailable) return false;
    const isAuthorized = await requestAuthorization();
    return isAuthorized;
  }, [checkAvailability, requestAuthorization]);

  const getTodayDateRange = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const dateStr = `${yyyy}-${mm}-${dd}`;
    return { startDate: dateStr, endDate: dateStr };
  };

  const syncSteps = useCallback(async (): Promise<number | null> => {
    if (!isNative) return null;
    try {
      const range = getTodayDateRange();
      const result = await HealthKit.querySteps(range);
      if (result.values && result.values.length > 0) {
        return result.values[0].value;
      }
      return 0;
    } catch (err) {
      console.error("[HealthKit] Steps sync error:", err);
      return null;
    }
  }, [isNative]);

  const syncActiveEnergy = useCallback(async (): Promise<number | null> => {
    if (!isNative) return null;
    try {
      const range = getTodayDateRange();
      const result = await HealthKit.queryActiveEnergy(range);
      if (result.values && result.values.length > 0) {
        return result.values[0].value;
      }
      return 0;
    } catch (err) {
      console.error("[HealthKit] Active energy sync error:", err);
      return null;
    }
  }, [isNative]);

  const syncDistance = useCallback(async (): Promise<number | null> => {
    if (!isNative) return null;
    try {
      const range = getTodayDateRange();
      const result = await HealthKit.queryDistance(range);
      if (result.values && result.values.length > 0) {
        return result.values[0].value;
      }
      return 0;
    } catch (err) {
      console.error("[HealthKit] Distance sync error:", err);
      return null;
    }
  }, [isNative]);

  const syncWeight = useCallback(async (): Promise<{ kg: number; lbs: number } | null> => {
    if (!isNative) return null;
    try {
      const result = await HealthKit.queryWeight();
      if (result.value_kg !== null && result.value_kg !== undefined) {
        return { kg: result.value_kg, lbs: result.value_lbs! };
      }
      return null;
    } catch (err) {
      console.error("[HealthKit] Weight sync error:", err);
      return null;
    }
  }, [isNative]);

  const syncAll = useCallback(async () => {
    setSyncing(true);
    try {
      const [steps, activeEnergy, distance, weight] = await Promise.all([
        syncSteps(),
        syncActiveEnergy(),
        syncDistance(),
        syncWeight(),
      ]);

      const newData: HealthData = {
        ...(steps !== null && { steps }),
        ...(activeEnergy !== null && { activeEnergy }),
        ...(distance !== null && { distance }),
        ...(weight !== null && { weight_kg: weight.kg, weight_lbs: weight.lbs }),
        lastSynced: new Date().toISOString(),
      };

      setData((prev) => ({ ...prev, ...newData }));
      return newData;
    } catch (err) {
      console.error("[HealthKit] Sync all failed:", err);
      return {};
    } finally {
      setSyncing(false);
    }
  }, [syncSteps, syncActiveEnergy, syncDistance, syncWeight]);

  return {
    data,
    available,
    authorized,
    isNative,
    syncing,
    checkAvailability,
    requestAuthorization,
    connect,
    syncWeight,
    syncSteps,
    syncActiveEnergy,
    syncDistance,
    syncAll,
  };
}
