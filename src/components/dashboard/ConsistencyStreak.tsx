import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataFetch } from "@/hooks/useDataFetch";
import { format, subDays } from "date-fns";

interface StreakData {
  streak: number;
  last30: { date: string; score: number }[];
}

export function useConsistencyStreak() {
  const { user } = useAuth();
  const today = format(new Date(), "yyyy-MM-dd");

  const { data, loading } = useDataFetch<StreakData>({
    queryKey: `consistency-streak-${user?.id}-${today}`,
    enabled: !!user,
    staleTime: 3 * 60 * 1000,
    timeout: 5000,
    fallback: { streak: 0, last30: [] },
    queryFn: async (signal) => {
      if (!user) return { streak: 0, last30: [] };

      const thirtyDaysAgo = format(subDays(new Date(), 29), "yyyy-MM-dd");
      const last30Dates = Array.from({ length: 30 }, (_, i) =>
        format(subDays(new Date(), 29 - i), "yyyy-MM-dd")
      );

      // Fetch calendar events for last 30 days
      const { data: events } = await supabase
        .from("calendar_events")
        .select("event_date, is_completed")
        .eq("user_id", user.id)
        .gte("event_date", thirtyDaysAgo)
        .lte("event_date", today)
        .abortSignal(signal);

      // Also fetch workout sessions
      const { data: sessions } = await supabase
        .from("workout_sessions")
        .select("created_at, completed_at")
        .eq("client_id", user.id)
        .gte("created_at", `${thirtyDaysAgo}T00:00:00`)
        .lte("created_at", `${today}T23:59:59`)
        .abortSignal(signal);

      // Build daily scores
      const dailyScores = last30Dates.map((date) => {
        const dayEvents = (events || []).filter((e) => e.event_date === date);
        const daySessions = (sessions || []).filter(
          (s) => format(new Date(s.created_at), "yyyy-MM-dd") === date
        );

        const totalTasks = dayEvents.length + daySessions.length;
        const completedTasks =
          dayEvents.filter((e) => e.is_completed).length +
          daySessions.filter((s) => s.completed_at).length;

        const score = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : -1; // -1 = no tasks

        return { date, score };
      });

      // Calculate streak (60% threshold)
      let streak = 0;
      for (let i = dailyScores.length - 1; i >= 0; i--) {
        const s = dailyScores[i];
        if (s.score === -1) continue; // skip days with no tasks
        if (s.score >= 60) streak++;
        else break;
      }

      return { streak, last30: dailyScores };
    },
  });

  return { streak: data?.streak ?? 0, last30: data?.last30 ?? [], loading };
}
