import { useState, useEffect, useCallback, useRef } from "react";
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

  // Track session IDs that have been completed in this browser session
  // so we never show the banner for them even if a stale DB query returns them
  const completedSessionIds = useRef<Set<string>>(new Set());

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

        if (fallback && !completedSessionIds.current.has(fallback.id)) {
          setActiveSession({
            id: fallback.id,
            workout_id: fallback.workout_id,
            workout_name: (fallback as any).workouts?.name || "Your Workout",
            started_at: fallback.started_at,
          });
        } else {
          setActiveSession(null);
        }
      } else if (data && !completedSessionIds.current.has(data.id)) {
        setActiveSession({
          id: data.id,
          workout_id: data.workout_id,
          workout_name: (data as any).workouts?.name || "Your Workout",
          started_at: data.started_at || data.last_heartbeat,
        });
      } else {
        setActiveSession(null);
      }
    } catch (e) {
      console.error("[useActiveSession] check error:", e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { checkForSession(); }, [checkForSession]);

  // When a workout session ends, immediately clear the banner.
  useEffect(() => {
    const handler = () => {
      setActiveSession(null);
    };
    window.addEventListener("workout-session-ended", handler);
    return () => window.removeEventListener("workout-session-ended", handler);
  }, []);

  // When a session is explicitly completed, record its ID so we never show it again
  // even if a stale DB query returns it as in_progress
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.sessionId) {
        completedSessionIds.current.add(detail.sessionId);
      }
      setActiveSession(null);
    };
    window.addEventListener("workout-session-completed", handler);
    return () => window.removeEventListener("workout-session-completed", handler);
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
