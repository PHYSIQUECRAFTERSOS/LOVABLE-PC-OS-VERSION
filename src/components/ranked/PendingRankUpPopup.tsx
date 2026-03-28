import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import RankUpOverlay from "./RankUpOverlay";

interface PendingRankEvent {
  type: "division_up" | "tier_up" | "champion_in" | "division_down" | "tier_down";
  tier: string;
  division: number;
  previousTier: string;
  timestamp: string;
}

const PendingRankUpPopup = () => {
  const { user } = useAuth();
  const [queue, setQueue] = useState<PendingRankEvent[]>([]);
  const [currentEvent, setCurrentEvent] = useState<PendingRankEvent | null>(null);
  const hasChecked = useRef(false);

  // On mount, check for pending rank events
  useEffect(() => {
    if (!user?.id || hasChecked.current) return;
    hasChecked.current = true;

    const checkPending = async () => {
      const db = supabase as any;
      const { data: profile } = await db
        .from("ranked_profiles")
        .select("pending_rank_event")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!profile?.pending_rank_event) return;

      // Normalize: could be single object or array
      let events: PendingRankEvent[] = [];
      if (Array.isArray(profile.pending_rank_event)) {
        events = profile.pending_rank_event;
      } else if (typeof profile.pending_rank_event === "object") {
        events = [profile.pending_rank_event];
      }

      if (events.length === 0) return;

      // Clear pending events from DB immediately
      await db
        .from("ranked_profiles")
        .update({ pending_rank_event: null })
        .eq("user_id", user.id);

      // Show the most impactful event (prioritize tier_up/champion_in, then division_up)
      // Sort by priority: champion_in > tier_up > division_up > division_down > tier_down
      const PRIORITY: Record<string, number> = {
        champion_in: 5,
        tier_up: 4,
        division_up: 3,
        division_down: 2,
        tier_down: 1,
      };
      events.sort((a, b) => (PRIORITY[b.type] || 0) - (PRIORITY[a.type] || 0));

      // Queue all events — show them sequentially
      setQueue(events);
      setCurrentEvent(events[0]);
    };

    // Delay slightly to let dashboard render first
    const timer = setTimeout(checkPending, 2000);
    return () => clearTimeout(timer);
  }, [user?.id]);

  const handleDismiss = useCallback(() => {
    setQueue((prev) => {
      const next = prev.slice(1);
      if (next.length > 0) {
        // Show next event after a brief pause
        setTimeout(() => setCurrentEvent(next[0]), 400);
      } else {
        setCurrentEvent(null);
      }
      return next;
    });
  }, []);

  if (!currentEvent) return null;

  return (
    <RankUpOverlay
      key={`${currentEvent.type}-${currentEvent.tier}-${currentEvent.division}-${currentEvent.timestamp}`}
      tier={currentEvent.tier}
      division={currentEvent.division}
      type={currentEvent.type}
      previousTier={currentEvent.previousTier}
      onDismiss={handleDismiss}
    />
  );
};

export default PendingRankUpPopup;
