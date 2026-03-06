import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const STREAK_MILESTONES = [3, 7, 14, 21, 30, 60, 90, 100];

export function useLoggingStreak() {
  const { user } = useAuth();
  const [streak, setStreak] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const fetchStreak = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.rpc(
        "get_logging_streak" as any,
        { p_user_id: user.id }
      );
      if (!error && data !== null) {
        setStreak(data as unknown as number);
      }
    } catch {
      // Function may not exist yet
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStreak();
  }, [user]);

  return { streak, loading, refresh: fetchStreak };
}

export function getMilestoneMessage(days: number): string | null {
  if (!STREAK_MILESTONES.includes(days)) return null;
  if (days === 3) return "Three days strong. You're building a habit.";
  if (days === 7) return "One full week of logging. Consistency is everything.";
  if (days === 14) return "Two weeks logged. Your coach can see the pattern.";
  if (days === 21) return "21 days — habits are formed. Keep going.";
  if (days === 30) return "30 day streak. That's elite consistency.";
  if (days === 60) return "60 days. You're in the top 1% of trackers.";
  if (days === 90) return "90 days straight. Absolute machine.";
  if (days === 100) return "💯 100 day streak. Legendary.";
  return null;
}

export { STREAK_MILESTONES };
