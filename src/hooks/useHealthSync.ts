import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import HealthKit from "@/plugins/HealthKitPlugin";
import { getLocalDateString } from "@/utils/localDate";

export interface HealthConnection {
  id: string;
  provider: "apple_health" | "google_fit";
  is_connected: boolean;
  permissions_granted: string[];
  last_sync_at: string | null;
  sync_status: string;
}

export interface DailyMetrics {
  metric_date: string;
  steps: number | null;
  walking_running_distance_km: number | null;
  active_energy_kcal: number | null;
  step_goal: number;
  source: string;
}

// ── Timeout wrapper for native plugin calls ──
function pluginTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms / 1000}s. Make sure HealthKit is enabled in Xcode.`));
    }, ms);

    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

// ── Auto-sync constants ──
const AUTO_SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const FOREGROUND_SYNC_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes
const INITIAL_SYNC_DELAY_MS = 3000; // 3 seconds after mount

interface UseHealthSyncOptions {
  enableAutoSync?: boolean;
}

export function useHealthSync(options: UseHealthSyncOptions = {}) {
  const { enableAutoSync = false } = options;
  const { user } = useAuth();
  const [connection, setConnection] = useState<HealthConnection | null>(null);
  const [todayMetrics, setTodayMetrics] = useState<DailyMetrics | null>(null);
  const [weekMetrics, setWeekMetrics] = useState<DailyMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const connectionRef = useRef<HealthConnection | null>(null);
  const lastSyncRef = useRef<number>(0);
  const syncingRef = useRef(false);

  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();
  const provider = platform === "ios" ? "apple_health" : "google_fit";

  useEffect(() => {
    connectionRef.current = connection;
    if (connection?.last_sync_at) {
      const lastSyncedAt = new Date(connection.last_sync_at).getTime();
      if (Number.isFinite(lastSyncedAt)) {
        lastSyncRef.current = Math.max(lastSyncRef.current, lastSyncedAt);
      }
    }
  }, [connection]);

  const fetchConnection = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("health_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", provider)
      .maybeSingle();

    const conn = data as HealthConnection | null;
    setConnection(conn);
    connectionRef.current = conn;
  }, [user, provider]);

  const fetchMetrics = useCallback(async () => {
    if (!user) return;
    const today = getLocalDateString();
    const weekAgo = new Date(Date.now() - 7 * 86400000).toLocaleDateString("en-CA");

    const [todayRes, weekRes] = await Promise.all([
      supabase
        .from("daily_health_metrics")
        .select("*")
        .eq("user_id", user.id)
        .eq("metric_date", today)
        .maybeSingle(),
      supabase
        .from("daily_health_metrics")
        .select("*")
        .eq("user_id", user.id)
        .gte("metric_date", weekAgo)
        .order("metric_date", { ascending: true }),
    ]);

    setTodayMetrics(todayRes.data as DailyMetrics | null);
    setWeekMetrics((weekRes.data as DailyMetrics[]) || []);
  }, [user]);

  useEffect(() => {
    if (user) {
      Promise.all([fetchConnection(), fetchMetrics()]).finally(() =>
        setLoading(false)
      );
    }
  }, [user, fetchConnection, fetchMetrics]);

  // Realtime subscription for metric updates
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("health-metrics")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "daily_health_metrics",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchMetrics();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchMetrics]);

  /**
   * Connect to Apple Health (or Google Fit placeholder).
   * This is the ONLY place where requestAuthorization() is called.
   */
  const connect = useCallback(async (): Promise<HealthConnection> => {
    if (!user) throw new Error("Not authenticated");

    if (isNative && platform === "ios") {
      console.log("[HealthSync] Starting Apple Health connect flow…");

      let available = false;
      try {
        const result = await pluginTimeout(HealthKit.isAvailable(), 5000, "HealthKit.isAvailable");
        available = result.available;
      } catch (err) {
        console.error("[HealthSync] isAvailable failed:", err);
        throw new Error("Could not check HealthKit availability. Make sure HealthKit is enabled in Xcode Capabilities.");
      }

      if (!available) {
        throw new Error("HealthKit is not available on this device.");
      }

      console.log("[HealthSync] Requesting HealthKit authorization…");
      try {
        await pluginTimeout(HealthKit.requestAuthorization(), 30000, "HealthKit.requestAuthorization");
      } catch (err) {
        console.error("[HealthSync] Authorization failed:", err);
        throw new Error("HealthKit authorization failed or timed out. Please try again and tap 'Allow' on the permission dialog.");
      }
    }

    const { data, error } = await supabase
      .from("health_connections")
      .upsert(
        {
          user_id: user.id,
          provider,
          is_connected: true,
          connected_at: new Date().toISOString(),
          permissions_granted: ["steps", "distance", "active_energy"],
          sync_status: "idle",
          sync_error: null,
          disconnected_at: null,
        },
        { onConflict: "user_id,provider" }
      )
      .select()
      .single();

    if (error) {
      console.error("[HealthSync] DB upsert failed:", error);
      throw new Error("Failed to save connection. Please try again.");
    }

    const conn = data as HealthConnection;
    setConnection(conn);
    connectionRef.current = conn;
    console.log("[HealthSync] Connection saved successfully:", conn.id);

    return conn;
  }, [user, isNative, platform, provider]);

  const disconnect = useCallback(async () => {
    if (!user || !connection) return;

    await supabase
      .from("health_connections")
      .update({
        is_connected: false,
        disconnected_at: new Date().toISOString(),
        sync_status: "idle",
      })
      .eq("id", connection.id);

    setConnection((prev) =>
      prev ? { ...prev, is_connected: false } : null
    );
    connectionRef.current = null;
  }, [user, connection]);

  /**
   * Sync health data now.
   * DOES NOT re-request authorization — that only happens during connect().
   * Queries steps, distance, and energy INDEPENDENTLY so partial success is possible.
   */
  const syncNow = useCallback(async (connectionOverride?: HealthConnection) => {
    const conn = connectionOverride ?? connectionRef.current;
    if (!user || !conn?.is_connected) {
      console.warn("[HealthSync] syncNow skipped — no connected health connection");
      return;
    }

    // Prevent concurrent syncs
    if (syncingRef.current) {
      console.log("[HealthSync] syncNow skipped — already syncing");
      return;
    }
    syncingRef.current = true;
    setSyncing(true);

    try {
      await supabase
        .from("health_connections")
        .update({ sync_status: "syncing" })
        .eq("id", conn.id);

      const today = getLocalDateString();
      const weekAgo = new Date(Date.now() - 7 * 86400000).toLocaleDateString("en-CA");

      if (isNative && platform === "ios") {
        // ── Query each metric independently for resilience ──
        // If one fails, the others can still succeed.
        let stepsValues: { date: string; value: number }[] = [];
        let energyValues: { date: string; value: number }[] = [];
        let distanceValues: { date: string; value: number }[] = [];
        let anySuccess = false;

        try {
          const result = await pluginTimeout(
            HealthKit.querySteps({ startDate: weekAgo, endDate: today }),
            15000, "querySteps"
          );
          stepsValues = result.values;
          anySuccess = true;
          console.log(`[HealthSync] Steps query OK: ${stepsValues.length} days`);
        } catch (err) {
          console.warn("[HealthSync] Steps query failed (continuing):", err);
        }

        try {
          const result = await pluginTimeout(
            HealthKit.queryActiveEnergy({ startDate: weekAgo, endDate: today }),
            15000, "queryActiveEnergy"
          );
          energyValues = result.values;
          anySuccess = true;
          console.log(`[HealthSync] Energy query OK: ${energyValues.length} days`);
        } catch (err) {
          console.warn("[HealthSync] Energy query failed (continuing):", err);
        }

        try {
          const result = await pluginTimeout(
            HealthKit.queryDistance({ startDate: weekAgo, endDate: today }),
            15000, "queryDistance"
          );
          distanceValues = result.values;
          anySuccess = true;
          console.log(`[HealthSync] Distance query OK: ${distanceValues.length} days`);
        } catch (err) {
          console.warn("[HealthSync] Distance query failed (continuing):", err);
        }

        if (!anySuccess) {
          throw new Error("All HealthKit queries failed. Please check Health permissions in Settings → Health → Physique Crafters.");
        }

        // Build a map of date → metrics, only including non-zero values
        const metricsMap = new Map<string, {
          steps?: number;
          active_energy_kcal?: number;
          walking_running_distance_km?: number;
        }>();

        for (const entry of stepsValues) {
          const existing = metricsMap.get(entry.date) || {};
          existing.steps = Math.round(entry.value);
          metricsMap.set(entry.date, existing);
        }
        for (const entry of energyValues) {
          const existing = metricsMap.get(entry.date) || {};
          existing.active_energy_kcal = Math.round(entry.value);
          metricsMap.set(entry.date, existing);
        }
        for (const entry of distanceValues) {
          const existing = metricsMap.get(entry.date) || {};
          existing.walking_running_distance_km = Math.round(entry.value * 100) / 100;
          metricsMap.set(entry.date, existing);
        }

        // Build upsert rows — only include fields that had successful queries
        const metricRows = Array.from(metricsMap.entries()).map(([date, metrics]) => ({
          user_id: user.id,
          metric_date: date,
          source: "apple_health",
          synced_at: new Date().toISOString(),
          ...(metrics.steps !== undefined ? { steps: metrics.steps } : {}),
          ...(metrics.active_energy_kcal !== undefined ? { active_energy_kcal: metrics.active_energy_kcal } : {}),
          ...(metrics.walking_running_distance_km !== undefined ? { walking_running_distance_km: metrics.walking_running_distance_km } : {}),
        }));

        if (metricRows.length > 0) {
          const { error: metricsError } = await supabase
            .from("daily_health_metrics")
            .upsert(metricRows, { onConflict: "user_id,metric_date" });

          if (metricsError) {
            throw metricsError;
          }
        }

        console.log(`[HealthSync] Synced ${metricsMap.size} days from HealthKit`);
      } else {
        // Non-native or Android: placeholder upsert
        const { error: placeholderError } = await supabase
          .from("daily_health_metrics")
          .upsert(
            {
              user_id: user.id,
              metric_date: today,
              source: "health_api",
              synced_at: new Date().toISOString(),
            },
            { onConflict: "user_id,metric_date" }
          );

        if (placeholderError) {
          throw placeholderError;
        }
      }

      // Success — clear any previous error and update last_sync_at
      await supabase
        .from("health_connections")
        .update({
          sync_status: "idle",
          sync_error: null,
          last_sync_at: new Date().toISOString(),
        })
        .eq("id", conn.id);

      lastSyncRef.current = Date.now();
      await Promise.all([fetchConnection(), fetchMetrics()]);
    } catch (err) {
      console.error("[HealthSync] Sync error:", err);

      const errMsg = String(err);
      let userMessage = errMsg;
      if (errMsg.includes("Authorization not determined") || errMsg.includes("not authorized")) {
        userMessage = "HealthKit access not authorized. Please open Settings → Health → Physique Crafters and enable all permissions.";
      }

      await supabase
        .from("health_connections")
        .update({
          sync_status: "error",
          sync_error: userMessage,
        })
        .eq("id", conn.id);
      throw new Error(userMessage);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [user, isNative, platform, fetchConnection, fetchMetrics]);

  // ── Auto-sync: 30-min interval + foreground resume ──
  useEffect(() => {
    if (!enableAutoSync || !user || !isNative || platform !== "ios") return;

    // Don't require connection state for setup — we'll check at sync time
    console.log("[HealthSync] Setting up auto-sync (30-min interval + foreground trigger)");

    // Initial sync after short delay
    const initialTimer = setTimeout(() => {
      const conn = connectionRef.current;
      if (!conn?.is_connected) return;
      const timeSinceLastSync = Date.now() - lastSyncRef.current;
      if (timeSinceLastSync > FOREGROUND_SYNC_THROTTLE_MS) {
        console.log("[HealthSync] Running initial auto-sync…");
        syncNow().catch((err) => console.warn("[HealthSync] Initial auto-sync failed:", err));
      }
    }, INITIAL_SYNC_DELAY_MS);

    // 30-minute interval
    const intervalId = setInterval(() => {
      const conn = connectionRef.current;
      if (!conn?.is_connected) return;
      console.log("[HealthSync] Running scheduled 30-min auto-sync…");
      syncNow().catch((err) => console.warn("[HealthSync] Scheduled auto-sync failed:", err));
    }, AUTO_SYNC_INTERVAL_MS);

    // Foreground resume listener (throttled to 5 min)
    let listenerHandle: { remove: () => void } | null = null;
    App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        const conn = connectionRef.current;
        if (!conn?.is_connected) return;
        const timeSinceLastSync = Date.now() - lastSyncRef.current;
        if (timeSinceLastSync > FOREGROUND_SYNC_THROTTLE_MS && !syncingRef.current) {
          console.log("[HealthSync] App resumed — running foreground auto-sync…");
          syncNow().catch((err) => console.warn("[HealthSync] Foreground auto-sync failed:", err));
        } else {
          console.log("[HealthSync] App resumed — skipping sync (last sync was", Math.round(timeSinceLastSync / 60000), "min ago)");
        }
      }
    }).then((handle) => {
      listenerHandle = handle;
    });

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalId);
      listenerHandle?.remove();
    };
  }, [enableAutoSync, user, isNative, platform, syncNow]);

  const updateStepGoal = useCallback(
    async (goal: number) => {
      if (!user) return;
      const today = getLocalDateString();
      await supabase
        .from("daily_health_metrics")
        .upsert(
          {
            user_id: user.id,
            metric_date: today,
            step_goal: goal,
            source: todayMetrics?.source || "manual",
          },
          { onConflict: "user_id,metric_date" }
        );
      fetchMetrics();
    },
    [user, todayMetrics, fetchMetrics]
  );

  return {
    connection,
    todayMetrics,
    weekMetrics,
    loading,
    syncing,
    isNative,
    platform,
    provider,
    connect,
    disconnect,
    syncNow,
    updateStepGoal,
  };
}
