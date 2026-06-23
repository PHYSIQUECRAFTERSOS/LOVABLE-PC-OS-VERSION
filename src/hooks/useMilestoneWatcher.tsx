import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const db = supabase as any;

export interface MilestoneUnlock {
  id: string;
  badge_id: string;
  category: string;
  threshold: number;
  unlocked_at: string;
  badge: {
    name: string;
    description: string | null;
    icon: string;
    tier: string | null;
    lucide_icon: string | null;
  };
}

/**
 * Mounts inside AppLayout for clients. Recomputes milestones on app open,
 * on tab focus, when window events fire `milestone:check`, and on a 60s poll.
 * Yields any unlocks whose celebrated_at is null, then marks them celebrated.
 */
export function useMilestoneWatcher() {
  const { user, role } = useAuth();
  const [queue, setQueue] = useState<MilestoneUnlock[]>([]);
  const inFlightRef = useRef(false);

  const fetchPendingCelebrations = useCallback(async () => {
    if (!user) return;
    const { data, error } = await db
      .from("client_milestone_unlocks")
      .select(
        "id, badge_id, category, threshold, unlocked_at, badge:badges!inner(name, description, icon, tier, lucide_icon)"
      )
      .eq("client_id", user.id)
      .is("celebrated_at", null)
      .order("unlocked_at", { ascending: true });
    if (error) {
      console.error("[milestone] fetch pending failed", error);
      return;
    }
    if (data && data.length > 0) {
      setQueue((prev) => {
        const seen = new Set(prev.map((u) => u.id));
        const merged = [...prev];
        for (const u of data as MilestoneUnlock[]) {
          if (!seen.has(u.id)) merged.push(u);
        }
        return merged;
      });
    }
  }, [user]);

  const recompute = useCallback(async () => {
    if (!user || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      await db.rpc("recompute_milestones", {
        p_user_id: user.id,
        p_silent: false,
      });
      await fetchPendingCelebrations();
    } catch (e) {
      console.error("[milestone] recompute failed", e);
    } finally {
      inFlightRef.current = false;
    }
  }, [user, fetchPendingCelebrations]);

  // Only run for clients. Coaches/admins viewing their own data don't get popups.
  useEffect(() => {
    if (!user || role !== "client") return;

    // On mount
    fetchPendingCelebrations();
    recompute();

    const onCheck = () => recompute();
    const onVisibility = () => {
      if (document.visibilityState === "visible") recompute();
    };

    window.addEventListener("milestone:check", onCheck);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onCheck);

    const interval = setInterval(recompute, 60_000);

    return () => {
      window.removeEventListener("milestone:check", onCheck);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onCheck);
      clearInterval(interval);
    };
  }, [user, role, fetchPendingCelebrations, recompute]);

  const dismissCurrent = useCallback(async () => {
    const head = queue[0];
    if (!head) return;
    setQueue((prev) => prev.slice(1));
    try {
      await db
        .from("client_milestone_unlocks")
        .update({ celebrated_at: new Date().toISOString() })
        .eq("id", head.id);
    } catch (e) {
      console.error("[milestone] mark celebrated failed", e);
    }
  }, [queue]);

  return { current: queue[0] ?? null, dismissCurrent, queueLength: queue.length };
}

/** Fire from any save site to trigger an immediate milestone check. */
export function triggerMilestoneCheck() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("milestone:check"));
  }
}
