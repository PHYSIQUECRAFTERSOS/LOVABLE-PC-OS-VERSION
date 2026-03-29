import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import XPCelebrationOverlay from "./XPCelebrationOverlay";
import { toLocalDateString, getLocalDateString } from "@/utils/localDate";
import { subDays, format } from "date-fns";

interface BreakdownItem {
  label: string;
  xp: number;
}

const EVAL_TX_TYPES = [
  "calories_on_target",
  "protein_on_target",
  "carbs_on_target",
  "fats_on_target",
  "no_nutrition",
  "calories_off_300",
  "missed_workout",
  "missed_cardio",
  "missed_checkin",
  "decay_per_day",
  "streak_bonus_7",
  "daily_eval", // 0 XP dedup marker — query but filter from display
];

const REWARD_LABELS: Record<string, { emoji: string; label: string }> = {
  calories_on_target: { emoji: "🎯", label: "Calories on target" },
  protein_on_target: { emoji: "🥩", label: "Protein on target" },
  carbs_on_target: { emoji: "🍚", label: "Carbs on target" },
  fats_on_target: { emoji: "🥑", label: "Fats on target" },
  missed_workout: { emoji: "❌", label: "Missed workout" },
  missed_cardio: { emoji: "❌", label: "Missed cardio" },
  no_nutrition: { emoji: "🚫", label: "No nutrition logged" },
  calories_off_300: { emoji: "⚠️", label: "Calories off by 300+" },
  missed_checkin: { emoji: "📋", label: "Missed check-in" },
  decay_per_day: { emoji: "💀", label: "Inactivity penalty" },
  streak_bonus_7: { emoji: "🔥", label: "7-day streak bonus" },
};

const DailyRewardsPopup = () => {
  const { user } = useAuth();
  const [showOverlay, setShowOverlay] = useState(false);
  const [breakdown, setBreakdown] = useState<BreakdownItem[]>([]);
  const [totalXP, setTotalXP] = useState(0);
  const [evalDateLabel, setEvalDateLabel] = useState("");
  const hasChecked = useRef(false);

  useEffect(() => {
    if (!user?.id) return;
    // Prevent duplicate runs within same component lifecycle
    if (hasChecked.current) return;

    const today = getLocalDateString();
    const storageKey = `xp_rewards_seen_${user.id}`;

    // Persistent cross-session guard: already shown today
    const lastSeen = localStorage.getItem(storageKey);
    if (lastSeen === today) return;

    // Mark as checked immediately to prevent race conditions
    hasChecked.current = true;

    const checkDailyRewards = async () => {
      const yesterday = toLocalDateString(subDays(new Date(), 1));

      // Mark as seen FIRST to prevent repeated popups even if query fails
      localStorage.setItem(storageKey, today);

      const db = supabase as any;
      const { data, error } = await db
        .from("xp_transactions")
        .select("transaction_type, xp_amount, description")
        .eq("user_id", user.id)
        .in("transaction_type", EVAL_TX_TYPES)
        .ilike("description", `%${yesterday}%`);

      if (error || !data || data.length === 0) return;

      // Filter out the 0 XP dedup marker from display
      const displayTxs = data.filter(
        (tx: any) => tx.transaction_type !== "daily_eval"
      );
      if (displayTxs.length === 0) return;

      // Build breakdown
      const items: BreakdownItem[] = [];
      let total = 0;

      for (const tx of displayTxs) {
        const txType: string = tx.transaction_type || "";
        const xp: number = tx.xp_amount || 0;
        total += xp;

        const mapping = REWARD_LABELS[txType];
        const label = mapping
          ? `${mapping.emoji} ${mapping.label}`
          : tx.description || txType;

        items.push({ label, xp });
      }

      // Show popup regardless of net XP — user wants visibility into gains AND losses

      if (items.length > 0) {
        setBreakdown(items);
        setTotalXP(total);
        setEvalDateLabel(
          format(new Date(yesterday + "T12:00:00"), "MMM d")
        );
        setShowOverlay(true);
      }
    };

    // Small delay so dashboard renders first
    const timer = setTimeout(checkDailyRewards, 1500);
    return () => clearTimeout(timer);
  }, [user?.id]);

  const handleDismiss = useCallback(() => {
    setShowOverlay(false);
  }, []);

  if (!showOverlay) return null;

  return (
    <XPCelebrationOverlay
      type="nutrition"
      totalXP={totalXP}
      breakdown={breakdown}
      onDismiss={handleDismiss}
      evalDateLabel={evalDateLabel}
    />
  );
};

export default DailyRewardsPopup;
