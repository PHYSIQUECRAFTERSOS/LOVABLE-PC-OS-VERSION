/**
 * HealthKit JS sync layer.
 *
 * Five invariants — see HEALTH_SYNC_INVARIANTS.md:
 *   1. Start-of-day: day queries use getLocalDateString() (YYYY-MM-DD), not interval windows.
 *   2. Wait-for-bridge: no native calls before bridge is ready (no module-top, no first render).
 *   3. Non-fatal availability: isAvailable() failures degrade gracefully, never block Settings.
 *   4. allSettled: parallel metric queries use allSettled, never all.
 *   5. Native is source of truth: don't "fix" sync by editing Swift first.
 *
 * Every sync attempt is logged via logSyncEvent (see src/lib/syncActivityLog.ts).
 * Tap the app version 5× on Connected Devices to view the hidden log.
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import HealthKit from "@/plugins/HealthKitPlugin";
import HealthConnect from "@/plugins/HealthConnectPlugin";
import { getLocalDateString } from "@/utils/localDate";
import {
  logSyncEvent,
  assertLocalMidnightDateString,
  type SyncTrigger,
} from "@/lib/syncActivityLog";


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
const AUTO_SYNC_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours
const FOREGROUND_SYNC_THROTTLE_MS = 30 * 60 * 1000; // 30 minutes
const INITIAL_SYNC_DELAY_MS = 3000; // 3 seconds after mount

// ── GLOBAL sync lock (shared across all hook instances) ──
// Prevents StepsCard + HealthSyncBootstrap from querying HealthKit simultaneously
let globalSyncing = false;
let globalLastSync = 0;

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

  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();
  // Keep the same `provider` row keys as before so existing DB rows stay valid.
  // Android Health Connect writes to the same row that "google_fit" used.
  const provider = platform === "ios" ? "apple_health" : "google_fit";
  // Which native plugin (if any) provides health data on this platform.
  const nativePlugin = platform === "ios" ? HealthKit : platform === "android" ? HealthConnect : null;
  const nativeLabel = platform === "ios" ? "Apple Health" : "Health Connect";
  // Stored in daily_health_metrics.source so coaches can tell where data came from.
  const metricSource = platform === "ios" ? "apple_health" : "health_connect";

  useEffect(() => {
    connectionRef.current = connection;
    if (connection?.last_sync_at) {
      const lastSyncedAt = new Date(connection.last_sync_at).getTime();
      if (Number.isFinite(lastSyncedAt)) {
        globalLastSync = Math.max(globalLastSync, lastSyncedAt);
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
      {
        const t0 = performance.now();
        try {
          const result = await pluginTimeout(HealthKit.isAvailable(), 5000, "HealthKit.isAvailable");
          available = result.available;
          logSyncEvent({
            trigger: "connect", phase: "isAvailable", status: "success",
            durationMs: Math.round(performance.now() - t0),
            detail: `available=${available}`,
            platform, isNative,
          });
        } catch (err: any) {
          const msg = String(err?.message ?? err);
          logSyncEvent({
            trigger: "connect", phase: "isAvailable",
            status: /timed out|timeout/i.test(msg) ? "timeout" : "failure",
            durationMs: Math.round(performance.now() - t0),
            detail: msg, platform, isNative,
          });
          console.error("[HealthSync] isAvailable failed:", err);
          throw new Error("Could not check HealthKit availability. Make sure HealthKit is enabled in Xcode Capabilities.");
        }
      }

      if (!available) {
        throw new Error("HealthKit is not available on this device.");
      }

      console.log("[HealthSync] Requesting HealthKit authorization…");
      {
        const t0 = performance.now();
        try {
          await pluginTimeout(HealthKit.requestAuthorization(), 30000, "HealthKit.requestAuthorization");
          logSyncEvent({
            trigger: "connect", phase: "requestAuth", status: "success",
            durationMs: Math.round(performance.now() - t0),
            detail: "authorized", platform, isNative,
          });
        } catch (err: any) {
          const msg = String(err?.message ?? err);
          logSyncEvent({
            trigger: "connect", phase: "requestAuth",
            status: /timed out|timeout/i.test(msg) ? "timeout" : "failure",
            durationMs: Math.round(performance.now() - t0),
            detail: msg, platform, isNative,
          });
          console.error("[HealthSync] Authorization failed:", err);
          throw new Error("HealthKit authorization failed or timed out. Please try again and tap 'Allow' on the permission dialog.");
        }
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
   * Uses a GLOBAL lock so multiple hook instances (StepsCard + HealthSyncBootstrap)
   * cannot query HealthKit concurrently — concurrent native bridge calls cause failures.
   */
  const syncNow = useCallback(async (
    connectionOverride?: HealthConnection,
    trigger: SyncTrigger = "manual",
  ) => {
    const conn = connectionOverride ?? connectionRef.current;
    if (!user || !conn?.is_connected) {
      logSyncEvent({
        trigger, phase: "overall", status: "skipped", durationMs: 0,
        detail: "no connected health connection", platform, isNative,
      });
      console.warn("[HealthSync] syncNow skipped — no connected health connection");
      return;
    }

    // GLOBAL lock — prevents concurrent HealthKit queries from any hook instance
    if (globalSyncing) {
      logSyncEvent({
        trigger, phase: "overall", status: "skipped", durationMs: 0,
        detail: "global sync lock active", platform, isNative,
      });
      console.log("[HealthSync] syncNow skipped — another sync is already in progress (global lock)");
      return;
    }
    globalSyncing = true;
    setSyncing(true);
    const overallT0 = performance.now();

    try {
      await supabase
        .from("health_connections")
        .update({ sync_status: "syncing" })
        .eq("id", conn.id);

      const today = getLocalDateString();
      const weekAgo = new Date(Date.now() - 7 * 86400000).toLocaleDateString("en-CA");

      // Invariant #1: day-bucketed queries must use start-of-local-day YYYY-MM-DD.
      assertLocalMidnightDateString(today, "syncNow.today");
      assertLocalMidnightDateString(weekAgo, "syncNow.weekAgo");

      if (isNative && platform === "ios") {
        // ── Query each metric independently for resilience ──
        let stepsValues: { date: string; value: number }[] = [];
        let energyValues: { date: string; value: number }[] = [];
        let distanceValues: { date: string; value: number }[] = [];
        let anySuccess = false;
        const failedQueries: string[] = [];

        {
          const t0 = performance.now();
          try {
            const result = await pluginTimeout(
              HealthKit.querySteps({ startDate: weekAgo, endDate: today }),
              15000, "querySteps"
            );
            stepsValues = result.values;
            anySuccess = true;
            logSyncEvent({
              trigger, phase: "querySteps", status: "success",
              durationMs: Math.round(performance.now() - t0),
              detail: `days=${stepsValues.length}`, platform, isNative,
            });
            console.log(`[HealthSync] Steps query OK: ${stepsValues.length} days`);
          } catch (err: any) {
            const msg = String(err?.message ?? err);
            logSyncEvent({
              trigger, phase: "querySteps",
              status: /timed out|timeout/i.test(msg) ? "timeout" : "failure",
              durationMs: Math.round(performance.now() - t0),
              detail: msg, platform, isNative,
            });
            console.warn("[HealthSync] Steps query failed (continuing):", err);
            failedQueries.push(`steps: ${String(err)}`);
          }
        }

        {
          const t0 = performance.now();
          try {
            const result = await pluginTimeout(
              HealthKit.queryActiveEnergy({ startDate: weekAgo, endDate: today }),
              15000, "queryActiveEnergy"
            );
            energyValues = result.values;
            anySuccess = true;
            logSyncEvent({
              trigger, phase: "queryActiveEnergy", status: "success",
              durationMs: Math.round(performance.now() - t0),
              detail: `days=${energyValues.length}`, platform, isNative,
            });
            console.log(`[HealthSync] Energy query OK: ${energyValues.length} days`);
          } catch (err: any) {
            const msg = String(err?.message ?? err);
            logSyncEvent({
              trigger, phase: "queryActiveEnergy",
              status: /timed out|timeout/i.test(msg) ? "timeout" : "failure",
              durationMs: Math.round(performance.now() - t0),
              detail: msg, platform, isNative,
            });
            console.warn("[HealthSync] Energy query failed (continuing):", err);
            failedQueries.push(`energy: ${String(err)}`);
          }
        }

        {
          const t0 = performance.now();
          try {
            const result = await pluginTimeout(
              HealthKit.queryDistance({ startDate: weekAgo, endDate: today }),
              15000, "queryDistance"
            );
            distanceValues = result.values;
            anySuccess = true;
            logSyncEvent({
              trigger, phase: "queryDistance", status: "success",
              durationMs: Math.round(performance.now() - t0),
              detail: `days=${distanceValues.length}`, platform, isNative,
            });
            console.log(`[HealthSync] Distance query OK: ${distanceValues.length} days`);
          } catch (err: any) {
            const msg = String(err?.message ?? err);
            logSyncEvent({
              trigger, phase: "queryDistance",
              status: /timed out|timeout/i.test(msg) ? "timeout" : "failure",
              durationMs: Math.round(performance.now() - t0),
              detail: msg, platform, isNative,
            });
            console.warn("[HealthSync] Distance query failed (continuing):", err);
            failedQueries.push(`distance: ${String(err)}`);
          }
        }


        // Sleep — best-effort, failure does not block other metrics
        {
          const t0 = performance.now();
          try {
            const sleepRes = await pluginTimeout(
              HealthKit.querySleep({ startDate: weekAgo, endDate: today }),
              15000, "querySleep"
            );
            const sleepRows = (sleepRes.values || [])
              .filter((s) => s.totalMinutes > 0)
              .map((s) => ({
                client_id: user.id,
                sleep_date: s.date,
                total_minutes: s.totalMinutes,
                in_bed_minutes: s.inBedMinutes,
                asleep_minutes: s.asleepMinutes,
                deep_minutes: s.deepMinutes,
                rem_minutes: s.remMinutes,
                light_minutes: s.lightMinutes,
                awake_minutes: s.awakeMinutes,
                bedtime_at: s.bedtimeAt,
                wake_at: s.wakeAt,
                source: "apple_health",
                source_priority: 100,
                synced_at: new Date().toISOString(),
              }));
            if (sleepRows.length > 0) {
              const { error: sleepErr } = await supabase
                .from("sleep_logs" as any)
                .upsert(sleepRows, { onConflict: "client_id,sleep_date" });
              if (sleepErr) console.warn("[HealthSync] Sleep upsert error:", sleepErr);
              else console.log(`[HealthSync] Sleep synced: ${sleepRows.length} nights`);
            }
            anySuccess = true;
            logSyncEvent({
              trigger, phase: "querySleep", status: "success",
              durationMs: Math.round(performance.now() - t0),
              detail: `nights=${sleepRows.length}`, platform, isNative,
            });
          } catch (err: any) {
            const msg = String(err?.message ?? err);
            logSyncEvent({
              trigger, phase: "querySleep",
              status: /timed out|timeout/i.test(msg) ? "timeout" : "failure",
              durationMs: Math.round(performance.now() - t0),
              detail: msg, platform, isNative,
            });
            console.warn("[HealthSync] Sleep query failed (continuing):", err);
            failedQueries.push(`sleep: ${String(err)}`);
          }
        }


        if (!anySuccess) {
          // Include the actual errors in the log for debugging
          const detail = failedQueries.join("; ");
          console.error("[HealthSync] All queries failed. Details:", detail);

          // Differentiate between timeout errors and permission/availability errors
          const allTimedOut = failedQueries.every(q => q.includes("timed out"));
          const hasPermErr = failedQueries.some(q =>
            q.includes("authorization") || q.includes("not authorized") || q.includes("permission")
          );

          if (hasPermErr) {
            throw new Error("HealthKit access not authorized. Open Settings → Health → Physique Crafters and enable all permissions.");
          } else if (allTimedOut) {
            throw new Error("HealthKit queries timed out. This can happen if the app was recently installed. Please try again.");
          } else {
            throw new Error("Health sync temporarily failed. Please try again in a moment.");
          }
        }

        // Build a map of date → metrics
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

        // Build upsert rows
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

      globalLastSync = Date.now();
      await Promise.all([fetchConnection(), fetchMetrics()]);
      logSyncEvent({
        trigger, phase: "overall", status: "success",
        durationMs: Math.round(performance.now() - overallT0),
        detail: "sync complete", platform, isNative,
      });
    } catch (err: any) {
      console.error("[HealthSync] Sync error:", err);

      const errMsg = String(err?.message ?? err);
      let userMessage = errMsg;
      if (errMsg.includes("Authorization not determined") || errMsg.includes("not authorized")) {
        userMessage = "HealthKit access not authorized. Please open Settings → Health → Physique Crafters and enable all permissions.";
      }

      logSyncEvent({
        trigger, phase: "overall",
        status: /timed out|timeout/i.test(errMsg) ? "timeout" : "failure",
        durationMs: Math.round(performance.now() - overallT0),
        detail: errMsg, platform, isNative,
      });

      await supabase
        .from("health_connections")
        .update({
          sync_status: "error",
          sync_error: userMessage,
        })
        .eq("id", conn.id);
      throw new Error(userMessage);
    } finally {
      globalSyncing = false;
      setSyncing(false);
    }

  }, [user, isNative, platform, fetchConnection, fetchMetrics]);

  // ── Auto-sync: 30-min interval + foreground resume ──
  useEffect(() => {
    if (!enableAutoSync || !user || !isNative || platform !== "ios") return;

    console.log("[HealthSync] Setting up auto-sync (2-hour interval + foreground trigger)");

    // Initial sync after short delay — with one auto-retry if bridge is not ready
    const initialTimer = setTimeout(() => {
      const conn = connectionRef.current;
      if (!conn?.is_connected) return;
      const timeSinceLastSync = Date.now() - globalLastSync;
      if (timeSinceLastSync > FOREGROUND_SYNC_THROTTLE_MS) {
        console.log("[HealthSync] Running initial auto-sync…");
        syncNow(undefined, "startup").catch((err) => {
          console.warn("[HealthSync] Initial auto-sync failed, retrying in 5s:", err);
          setTimeout(() => {
            const retryConn = connectionRef.current;
            if (retryConn?.is_connected && !globalSyncing) {
              syncNow(undefined, "startup").catch((retryErr) =>
                console.warn("[HealthSync] Auto-sync retry also failed:", retryErr)
              );
            }
          }, 5000);
        });
      }
    }, INITIAL_SYNC_DELAY_MS);

    // 2-hour interval
    const intervalId = setInterval(() => {
      const conn = connectionRef.current;
      if (!conn?.is_connected) return;
      if (globalSyncing) {
        console.log("[HealthSync] Scheduled sync skipped — global lock active");
        return;
      }
      console.log("[HealthSync] Running scheduled 2-hour auto-sync…");
      syncNow(undefined, "interval").catch((err) => console.warn("[HealthSync] Scheduled auto-sync failed:", err));
    }, AUTO_SYNC_INTERVAL_MS);

    // Foreground resume listener (throttled to 5 min)
    let listenerHandle: { remove: () => void } | null = null;
    App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        const conn = connectionRef.current;
        if (!conn?.is_connected) return;
        const timeSinceLastSync = Date.now() - globalLastSync;
        if (timeSinceLastSync > FOREGROUND_SYNC_THROTTLE_MS && !globalSyncing) {
          console.log("[HealthSync] App resumed — running foreground auto-sync…");
          syncNow(undefined, "resume").catch((err) => console.warn("[HealthSync] Foreground auto-sync failed:", err));

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
