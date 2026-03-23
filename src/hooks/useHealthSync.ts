import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Capacitor } from "@capacitor/core";
import HealthKit from "@/plugins/HealthKitPlugin";

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
// Capacitor plugin calls can hang forever if the native bridge isn't
// properly registered. This ensures the UI always unblocks.
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

export function useHealthSync() {
  const { user } = useAuth();
  const [connection, setConnection] = useState<HealthConnection | null>(null);
  const [todayMetrics, setTodayMetrics] = useState<DailyMetrics | null>(null);
  const [weekMetrics, setWeekMetrics] = useState<DailyMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Keep a ref to the latest connection so syncNow never reads stale state
  const connectionRef = useRef<HealthConnection | null>(null);

  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();
  const provider = platform === "ios" ? "apple_health" : "google_fit";

  // Keep ref in sync with state
  useEffect(() => {
    connectionRef.current = connection;
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
    const today = new Date().toISOString().split("T")[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

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
   * Returns the created/updated connection record so the caller
   * can pass it to syncNow without waiting for React state.
   * THROWS on failure — caller must catch.
   */
  const connect = useCallback(async (): Promise<HealthConnection> => {
    if (!user) throw new Error("Not authenticated");

    if (isNative && platform === "ios") {
      console.log("[HealthSync] Starting Apple Health connect flow…");

      // 1. Check availability (5s timeout)
      console.log("[HealthSync] Checking HealthKit availability…");
      let available = false;
      try {
        const result = await pluginTimeout(HealthKit.isAvailable(), 5000, "HealthKit.isAvailable");
        available = result.available;
        console.log("[HealthSync] HealthKit available:", available);
      } catch (err) {
        console.error("[HealthSync] isAvailable failed:", err);
        throw new Error("Could not check HealthKit availability. Make sure HealthKit is enabled in Xcode Capabilities.");
      }

      if (!available) {
        throw new Error("HealthKit is not available on this device.");
      }

      // 2. Request authorization (30s timeout — user interacts with dialog)
      console.log("[HealthSync] Requesting HealthKit authorization…");
      try {
        const authResult = await pluginTimeout(HealthKit.requestAuthorization(), 30000, "HealthKit.requestAuthorization");
        console.log("[HealthSync] Authorization result:", authResult);
      } catch (err) {
        console.error("[HealthSync] Authorization failed:", err);
        throw new Error("HealthKit authorization failed or timed out. Please try again and tap 'Allow' on the permission dialog.");
      }
    } else if (isNative) {
      // Android: placeholder for Google Fit native integration
      console.log(`[HealthSync] Requesting ${provider} permissions on native device (placeholder)…`);
    }

    // 3. Upsert connection record
    console.log("[HealthSync] Saving connection to database…");
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
   * Accepts an optional connectionOverride to bypass the React state
   * race condition when called immediately after connect().
   */
  const syncNow = useCallback(async (connectionOverride?: HealthConnection) => {
    const conn = connectionOverride ?? connectionRef.current;
    if (!user || !conn?.is_connected) {
      console.warn("[HealthSync] syncNow skipped — no connected health connection", {
        hasUser: !!user,
        connId: conn?.id,
        isConnected: conn?.is_connected,
      });
      return;
    }
    setSyncing(true);

    try {
      await supabase
        .from("health_connections")
        .update({ sync_status: "syncing" })
        .eq("id", conn.id);

      const today = new Date().toISOString().split("T")[0];
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

      if (isNative && platform === "ios") {
        // Native iOS: query real HealthKit data
        console.log("[HealthSync] Querying HealthKit data…");
        const HealthKit = await getHealthKitPlugin();

        const [stepsResult, energyResult, distanceResult] = await Promise.all([
          pluginTimeout(HealthKit.querySteps({ startDate: weekAgo, endDate: today }), 15000, "querySteps"),
          pluginTimeout(HealthKit.queryActiveEnergy({ startDate: weekAgo, endDate: today }), 15000, "queryActiveEnergy"),
          pluginTimeout(HealthKit.queryDistance({ startDate: weekAgo, endDate: today }), 15000, "queryDistance"),
        ]);

        // Build a map of date → metrics
        const metricsMap = new Map<string, {
          steps: number;
          active_energy_kcal: number;
          walking_running_distance_km: number;
        }>();

        for (const entry of stepsResult.values) {
          const existing = metricsMap.get(entry.date) || { steps: 0, active_energy_kcal: 0, walking_running_distance_km: 0 };
          existing.steps = Math.round(entry.value);
          metricsMap.set(entry.date, existing);
        }
        for (const entry of energyResult.values) {
          const existing = metricsMap.get(entry.date) || { steps: 0, active_energy_kcal: 0, walking_running_distance_km: 0 };
          existing.active_energy_kcal = Math.round(entry.value);
          metricsMap.set(entry.date, existing);
        }
        for (const entry of distanceResult.values) {
          const existing = metricsMap.get(entry.date) || { steps: 0, active_energy_kcal: 0, walking_running_distance_km: 0 };
          existing.walking_running_distance_km = Math.round(entry.value * 100) / 100;
          metricsMap.set(entry.date, existing);
        }

        // Upsert each day's metrics
        for (const [date, metrics] of metricsMap) {
          await supabase
            .from("daily_health_metrics")
            .upsert(
              {
                user_id: user.id,
                metric_date: date,
                steps: metrics.steps,
                active_energy_kcal: metrics.active_energy_kcal,
                walking_running_distance_km: metrics.walking_running_distance_km,
                source: "apple_health",
                synced_at: new Date().toISOString(),
              },
              { onConflict: "user_id,metric_date" }
            );
        }

        console.log(`[HealthSync] Synced ${metricsMap.size} days from HealthKit`);
      } else {
        // Non-native or Android: placeholder upsert
        await supabase
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
      }

      await supabase
        .from("health_connections")
        .update({
          sync_status: "idle",
          last_sync_at: new Date().toISOString(),
        })
        .eq("id", conn.id);

      await Promise.all([fetchConnection(), fetchMetrics()]);
    } catch (err) {
      console.error("[HealthSync] Sync error:", err);
      await supabase
        .from("health_connections")
        .update({
          sync_status: "error",
          sync_error: String(err),
        })
        .eq("id", conn.id);
      throw err; // Re-throw so caller can show error toast
    } finally {
      setSyncing(false);
    }
  }, [user, isNative, platform, fetchConnection, fetchMetrics]);

  const updateStepGoal = useCallback(
    async (goal: number) => {
      if (!user) return;
      const today = new Date().toISOString().split("T")[0];
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
