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

      let candidate: { id: string; workout_id: string; started_at: string; workout_name: string } | null = null;

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
          candidate = {
            id: fallback.id,
            workout_id: fallback.workout_id,
            started_at: fallback.started_at,
            workout_name: (fallback as any).workouts?.name || "Your Workout",
          };
        }
      } else if (data && !completedSessionIds.current.has(data.id)) {
        candidate = {
          id: data.id,
          workout_id: data.workout_id,
          started_at: data.started_at || data.last_heartbeat,
          workout_name: (data as any).workouts?.name || "Your Workout",
        };
      }

      if (!candidate) {
        setActiveSession(null);
        return;
      }

      // Bug 1 defensive double-check: re-read this exact row's current status
      // straight from the server before showing the banner. Prevents banner
      // flash from stale list-query results when the row was just flipped to
      // "completed" but our list query observed an older snapshot, or when an
      // iOS-suspended finish request finally landed between the list query
      // and this read.
      const { data: freshRow } = await supabase
        .from("workout_sessions")
        .select("status, completed_at")
        .eq("id", candidate.id)
        .maybeSingle();

      if (freshRow && (freshRow.status !== "in_progress" || freshRow.completed_at)) {
        completedSessionIds.current.add(candidate.id);
        setActiveSession(null);
        return;
      }

      // Defensive guard: cross-check calendar_events. If this workout already
      // has a completed event for today, the prior finish flow succeeded but
      // the session row was never flipped (background-write race). Self-heal
      // the session row and suppress the banner. Mirrors Training.tsx logic.
      const todayStr = new Date().toLocaleDateString("en-CA");
      const { data: completedToday } = await supabase
        .from("calendar_events")
        .select("id")
        .eq("linked_workout_id", candidate.workout_id)
        .eq("event_type", "workout")
        .eq("event_date", todayStr)
        .eq("is_completed", true)
        .or(`user_id.eq.${userId},target_client_id.eq.${userId}`)
        .limit(1);

      if (completedToday && completedToday.length > 0) {
        completedSessionIds.current.add(candidate.id);
        await supabase
          .from("workout_sessions")
          .update({ status: "completed" } as any)
          .eq("id", candidate.id);
        setActiveSession(null);
        return;
      }

      setActiveSession(candidate);
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
