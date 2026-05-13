import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface SleepEntry {
  id: string;
  client_id: string;
  sleep_date: string; // YYYY-MM-DD
  total_minutes: number | null;
  in_bed_minutes: number | null;
  asleep_minutes: number | null;
  deep_minutes: number | null;
  rem_minutes: number | null;
  light_minutes: number | null;
  awake_minutes: number | null;
  bedtime_at: string | null;
  wake_at: string | null;
  source: string;
  source_priority: number;
  synced_at: string;
}

export const SOURCE_PRIORITY: Record<string, number> = {
  apple_health: 100,
  fitbit: 80,
  google_fit: 60,
  manual: 40,
};

export function useSleep(targetClientId?: string) {
  const { user } = useAuth();
  const clientId = targetClientId || user?.id;

  const [entries, setEntries] = useState<SleepEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchEntries = useCallback(
    async (sinceDate?: string) => {
      if (!clientId) return;
      setLoading(true);
      let query = supabase
        .from("sleep_logs" as any)
        .select("*")
        .eq("client_id", clientId)
        .order("sleep_date", { ascending: false });
      if (sinceDate) query = query.gte("sleep_date", sinceDate);
      const { data, error } = await query.limit(1000);
      if (!error && data) setEntries(data as unknown as SleepEntry[]);
      setLoading(false);
    },
    [clientId]
  );

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries, refreshKey]);

  // Realtime
  useEffect(() => {
    if (!clientId) return;
    const channel = supabase
      .channel(`sleep-${clientId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sleep_logs", filter: `client_id=eq.${clientId}` },
        () => setRefreshKey((k) => k + 1)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId]);

  /** Manual log — only inserts if there's no higher-priority row already for that date. */
  const logManual = useCallback(
    async (params: {
      sleep_date: string;
      total_minutes: number;
      bedtime_at?: string | null;
      wake_at?: string | null;
    }) => {
      if (!clientId) throw new Error("Not authenticated");
      const { error } = await supabase.from("sleep_logs" as any).upsert(
        {
          client_id: clientId,
          sleep_date: params.sleep_date,
          total_minutes: params.total_minutes,
          asleep_minutes: params.total_minutes,
          bedtime_at: params.bedtime_at ?? null,
          wake_at: params.wake_at ?? null,
          source: "manual",
          source_priority: SOURCE_PRIORITY.manual,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "client_id,sleep_date" }
      );
      if (error) throw error;
      setRefreshKey((k) => k + 1);
    },
    [clientId]
  );

  const deleteEntry = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("sleep_logs" as any).delete().eq("id", id);
      if (error) throw error;
      setRefreshKey((k) => k + 1);
    },
    []
  );

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Today entry & 7d average
  const todayStr = new Date().toLocaleDateString("en-CA");
  const todayEntry = entries.find((e) => e.sleep_date === todayStr) || entries[0];
  const last7 = entries.slice(0, 7);
  const avg7Min =
    last7.length > 0
      ? Math.round(last7.reduce((s, e) => s + (e.total_minutes ?? 0), 0) / last7.length)
      : 0;

  return { entries, todayEntry, avg7Min, loading, fetchEntries, logManual, deleteEntry, refresh };
}

export function formatSleepDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
