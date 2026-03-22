import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import XPCelebrationOverlay from "./XPCelebrationOverlay";
import { toLocalDateString } from "@/utils/localDate";
import { subDays } from "date-fns";

interface BreakdownItem {
  label: string;
  xp: number;
}

const REWARD_LABELS: Record<string, string> = {
  calories_on_target: "Calories on target",
  protein_on_target: "Protein on target",
  carbs_on_target: "Carbs on target",
  fats_on_target: "Fats on target",
  missed_workout: "Missed workout",
  missed_cardio: "Missed cardio",
  no_nutrition: "No nutrition logged",
  calories_off_300: "Calories off by 300+",
  missed_checkin: "Missed check-in",
  decay_per_day: "Inactivity penalty",
  streak_bonus_7: "7-day streak bonus",
};

const DailyRewardsPopup = () => {
  const { user } = useAuth();
  const [showOverlay, setShowOverlay] = useState(false);
  const [breakdown, setBreakdown] = useState<BreakdownItem[]>([]);
  const [totalXP, setTotalXP] = useState(0);

  useEffect(() => {
    if (!user?.id) return;

    const checkDailyRewards = async () => {
      const yesterday = getLocalDateString(subDays(new Date(), 1));
      const storageKey = `xp_rewards_seen_${user.id}`;
      const lastSeen = localStorage.getItem(storageKey);
      if (lastSeen === yesterday) return;

      // Query daily eval transactions from yesterday
      const db = supabase as any;
      const { data, error } = await db
        .from("xp_transactions")
        .select("transaction_type, xp_amount, description")
        .eq("user_id", user.id)
        .eq("transaction_type", "daily_eval")
        .gte("created_at", `${yesterday}T00:00:00`)
        .lte("created_at", `${yesterday}T23:59:59`);

      if (error || !data || data.length === 0) return;

      // Build breakdown from descriptions
      const items: BreakdownItem[] = [];
      let total = 0;

      for (const tx of data) {
        const desc: string = tx.description || "";
        const xp: number = tx.xp_amount || 0;
        total += xp;

        // Try to extract a meaningful label from description
        let label = desc;
        for (const [key, friendlyLabel] of Object.entries(REWARD_LABELS)) {
          if (desc.toLowerCase().includes(key.replace(/_/g, " ")) || desc.toLowerCase().includes(key)) {
            label = friendlyLabel;
            break;
          }
        }

        items.push({ label, xp });
      }

      if (items.length > 0) {
        setBreakdown(items);
        setTotalXP(total);
        setShowOverlay(true);
        localStorage.setItem(storageKey, yesterday);
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
    />
  );
};

export default DailyRewardsPopup;
