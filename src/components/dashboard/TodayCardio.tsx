import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart } from "lucide-react";
import { format } from "date-fns";
import { useDataFetch } from "@/hooks/useDataFetch";
import { CardSkeleton } from "@/components/ui/data-skeleton";

interface TodayCardioData {
  id: string;
  title: string;
  type: string;
  duration?: number | null;
  completed: boolean;
  source: "log" | "calendar";
}

const TodayCardio = () => {
  const { user } = useAuth();
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: cardioItems = [], loading } = useDataFetch<TodayCardioData[]>({
    queryKey: `today-cardio-${user?.id}-${today}`,
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    timeout: 5000,
    fallback: [],
    queryFn: async (signal) => {
      if (!user) return [];

      const [logsRes, calRes] = await Promise.all([
        supabase
          .from("cardio_logs")
          .select("id, title, cardio_type, duration_min, completed")
          .eq("client_id", user.id)
          .eq("logged_at", today)
          .abortSignal(signal),
        supabase
          .from("calendar_events")
          .select("id, title, description, is_completed")
          .eq("user_id", user.id)
          .eq("event_date", today)
          .eq("event_type", "cardio")
          .abortSignal(signal),
      ]);

      const items: TodayCardioData[] = [];
      const logIds = new Set<string>();

      (logsRes.data || []).forEach((l) => {
        logIds.add(l.id);
        items.push({
          id: l.id,
          title: l.title,
          type: l.cardio_type,
          duration: l.duration_min,
          completed: l.completed,
          source: "log",
        });
      });

      // Add calendar cardio events not already logged
      (calRes.data || []).forEach((c) => {
        if (!items.some((i) => i.title === c.title && i.source === "log")) {
          items.push({
            id: c.id,
            title: c.title,
            type: "cardio",
            duration: null,
            completed: c.is_completed,
            source: "calendar",
          });
        }
      });

      return items;
    },
  });

  if (loading) return <CardSkeleton lines={2} />;

  if (cardioItems.length === 0) return null; // Don't render if no cardio scheduled

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Heart className="h-5 w-5" /> Today's Cardio
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {cardioItems.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0"
          >
            <div className="flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full shrink-0 ${
                  item.completed ? "bg-green-500" : "bg-muted-foreground"
                }`}
              />
              <span className={`font-medium ${item.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                {item.title}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {item.duration ? `${item.duration} min` : "Scheduled"}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default TodayCardio;
