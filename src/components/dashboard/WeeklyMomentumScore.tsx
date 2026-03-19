import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy } from "lucide-react";
import { format, subDays } from "date-fns";
import { useDataFetch } from "@/hooks/useDataFetch";
import { cn } from "@/lib/utils";

const WeeklyMomentumScore = () => {
  const { user } = useAuth();
  const today = format(new Date(), "yyyy-MM-dd");
  const weekAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");

  const { data: score, loading } = useDataFetch<number>({
    queryKey: `weekly-score-${user?.id}-${today}`,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    timeout: 5000,
    fallback: 0,
    queryFn: async (signal) => {
      if (!user) return 0;

      const [eventsRes, completedRes] = await Promise.all([
        supabase
          .from("calendar_events")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("event_date", weekAgo)
          .lte("event_date", today)
          .neq("event_type", "rest")
          .abortSignal(signal),
        supabase
          .from("calendar_events")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("event_date", weekAgo)
          .lte("event_date", today)
          .neq("event_type", "rest")
          .eq("is_completed", true)
          .abortSignal(signal),
      ]);

      const total = eventsRes.count || 0;
      const completed = completedRes.count || 0;
      return total > 0 ? Math.round((completed / total) * 100) : 0;
    },
  });

  if (loading) return null;

  const color = (score || 0) >= 80 ? "text-green-500" : (score || 0) >= 50 ? "text-yellow-500" : "text-red-400";

  return (
    <Card className="bg-card overflow-hidden">
      <CardContent className="flex items-center gap-3 py-4 px-4">
        <Trophy className={cn("h-5 w-5 shrink-0", color)} />
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground font-medium">Week Score</p>
          <p className={cn("text-lg font-bold", color)}>{score || 0}%</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default WeeklyMomentumScore;
