import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface ActiveSession {
  id: string;
  workout_id: string;
  workout_name: string;
  started_at: string;
}

/**
 * Checks for an in-progress workout session on mount.
 * Returns the session info if one exists (last heartbeat < 2h old).
 * Provides dismiss/finish helpers.
 */
export const useActiveSession = () => {
  const { user } = useAuth();
  const userId = user?.id;
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);

  // Track online status
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const checkForSession = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    try {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from("workout_sessions")
        .select("id, workout_id, started_at, last_heartbeat, workouts(name)")
        .eq("client_id", userId)
        .eq("status", "in_progress")
        .gte("last_heartbeat", twoHoursAgo)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        // If last_heartbeat is null for old rows, also check started_at
        const { data: fallback } = await supabase
          .from("workout_sessions")
          .select("id, workout_id, started_at, workouts(name)")
          .eq("client_id", userId)
          .eq("status", "in_progress")
          .gte("started_at", twoHoursAgo)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (fallback) {
          setActiveSession({
            id: fallback.id,
            workout_id: fallback.workout_id,
            workout_name: (fallback as any).workouts?.name || "Your Workout",
            started_at: fallback.started_at,
          });
        }
      } else if (data) {
        setActiveSession({
          id: data.id,
          workout_id: data.workout_id,
          workout_name: (data as any).workouts?.name || "Your Workout",
          started_at: data.started_at || data.last_heartbeat,
        });
      }
    } catch (e) {
      console.error("[useActiveSession] check error:", e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { checkForSession(); }, [checkForSession]);

  // When a workout session ends, immediately clear the banner.
  // Do NOT re-check — the session is definitively over.
  useEffect(() => {
    const handler = () => {
      setActiveSession(null);
    };
    window.addEventListener("workout-session-ended", handler);
    return () => window.removeEventListener("workout-session-ended", handler);
  }, []);

  // Auto-abandon stale sessions (older than 2h) silently
  useEffect(() => {
    if (!userId) return;
    const cleanup = async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      await supabase
        .from("workout_sessions")
        .update({ status: "abandoned" } as any)
        .eq("client_id", userId)
        .eq("status", "in_progress")
        .lt("started_at", twoHoursAgo);
    };
    cleanup();
  }, [userId]);

  const dismiss = useCallback(() => setActiveSession(null), []);

  return { activeSession, loading, online, dismiss, refetch: checkForSession };
};
