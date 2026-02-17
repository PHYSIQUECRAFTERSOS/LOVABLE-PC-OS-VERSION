import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Capacitor } from "@capacitor/core";

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

export function useHealthSync() {
  const { user } = useAuth();
  const [connection, setConnection] = useState<HealthConnection | null>(null);
  const [todayMetrics, setTodayMetrics] = useState<DailyMetrics | null>(null);
  const [weekMetrics, setWeekMetrics] = useState<DailyMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();
  const provider = platform === "ios" ? "apple_health" : "google_fit";

  const fetchConnection = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("health_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", provider)
      .maybeSingle();

    setConnection(data as HealthConnection | null);
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

  const connect = useCallback(async () => {
    if (!user) return;

    if (isNative) {
      // On native: request HealthKit/Google Fit permissions
      // This is where the native plugin integration happens
      // For now, we register the connection in the database
      try {
        console.log(`[HealthSync] Requesting ${provider} permissions on native device...`);
        // Native plugin call would go here:
        // iOS: await HealthKit.requestAuthorization({ ... })
        // Android: await HealthConnect.requestPermissions({ ... })
      } catch (err) {
        console.error("[HealthSync] Permission request failed:", err);
        return;
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
          disconnected_at: null,
        },
        { onConflict: "user_id,provider" }
      )
      .select()
      .single();

    if (!error && data) {
      setConnection(data as HealthConnection);
    }
  }, [user, isNative, provider]);

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
  }, [user, connection]);

  const syncNow = useCallback(async () => {
    if (!user || !connection?.is_connected) return;
    setSyncing(true);

    try {
      await supabase
        .from("health_connections")
        .update({ sync_status: "syncing" })
        .eq("id", connection.id);

      if (isNative) {
        // Native sync: query HealthKit/Google Fit for today's data
        // For iOS: const result = await HealthKit.queryHKQuantityType({ ... })
        // For Android: const result = await HealthConnect.readRecords({ ... })
        console.log("[HealthSync] Would sync from native health API here");
      }

      // Upsert today's metrics (on native, this would use real data)
      const today = new Date().toISOString().split("T")[0];
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

      await supabase
        .from("health_connections")
        .update({
          sync_status: "idle",
          last_sync_at: new Date().toISOString(),
        })
        .eq("id", connection.id);

      await Promise.all([fetchConnection(), fetchMetrics()]);
    } catch (err) {
      console.error("[HealthSync] Sync error:", err);
      await supabase
        .from("health_connections")
        .update({
          sync_status: "error",
          sync_error: String(err),
        })
        .eq("id", connection.id);
    } finally {
      setSyncing(false);
    }
  }, [user, connection, isNative, fetchConnection, fetchMetrics]);

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
