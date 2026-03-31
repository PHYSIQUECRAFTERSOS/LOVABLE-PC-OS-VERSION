import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import RankUpOverlay from "./RankUpOverlay";

interface PendingRankEvent {
  type: "division_up" | "tier_up" | "champion_in" | "division_down" | "tier_down" | "placement_reveal";
  tier: string;
  division: number;
  previousTier?: string;
  score?: number;
  label?: string;
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
        events = [profile.pending_rank_event as PendingRankEvent];
      }

      if (events.length === 0) return;

      // Clear pending events from DB immediately
      await db
        .from("ranked_profiles")
        .update({ pending_rank_event: null })
        .eq("user_id", user.id);

      // Sort by priority: placement_reveal > champion_in > tier_up > division_up > division_down > tier_down
      const PRIORITY: Record<string, number> = {
        placement_reveal: 6,
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
      placementScore={currentEvent.score}
      placementLabel={currentEvent.label}
      onDismiss={handleDismiss}
    />
  );
};

export default PendingRankUpPopup;
