import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getLocalDateString } from "@/utils/localDate";

export function useWorkoutStreak() {
  const { user } = useAuth();
  const [streak, setStreak] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const fetchStreak = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.rpc(
        "get_workout_streak" as any,
        { p_user_id: user.id, p_today: getLocalDateString() }
      );
      if (!error && data !== null) {
        setStreak(data as unknown as number);
      }
    } catch {
      // Function may not exist yet
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchStreak();
  }, [fetchStreak]);

  return { streak, loading, refresh: fetchStreak };
}
