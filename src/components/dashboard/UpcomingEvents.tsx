import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, Dumbbell, Heart, Camera, Activity, ClipboardCheck, Bell } from "lucide-react";
import { format, addDays } from "date-fns";
import { useDataFetch } from "@/hooks/useDataFetch";
import { cn } from "@/lib/utils";

interface UpcomingEvent {
  id: string;
  title: string;
  type: string;
  date: string;
  time?: string | null;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  workout: <Dumbbell className="h-3.5 w-3.5 text-blue-400" />,
  cardio: <Heart className="h-3.5 w-3.5 text-green-400" />,
  photos: <Camera className="h-3.5 w-3.5 text-purple-400" />,
  body_stats: <Activity className="h-3.5 w-3.5 text-orange-400" />,
  checkin: <ClipboardCheck className="h-3.5 w-3.5 text-purple-400" />,
  reminder: <Bell className="h-3.5 w-3.5 text-yellow-400" />,
};

const UpcomingEvents = () => {
  const { user } = useAuth();
  const today = format(new Date(), "yyyy-MM-dd");
  const nextWeek = format(addDays(new Date(), 7), "yyyy-MM-dd");

  const { data: events = [], loading } = useDataFetch<UpcomingEvent[]>({
    queryKey: `upcoming-events-${user?.id}-${today}`,
    enabled: !!user,
    staleTime: 3 * 60 * 1000,
    timeout: 5000,
    fallback: [],
    queryFn: async (signal) => {
      if (!user) return [];

      const { data } = await supabase
        .from("calendar_events")
        .select("id, title, event_type, event_date, event_time")
        .eq("user_id", user.id)
        .gt("event_date", today)
        .lte("event_date", nextWeek)
        .eq("is_completed", false)
        .order("event_date", { ascending: true })
        .order("event_time", { ascending: true })
        .limit(8)
        .abortSignal(signal);

      return (data || []).map((e) => ({
        id: e.id,
        title: e.title,
        type: e.event_type,
        date: e.event_date,
        time: e.event_time,
      }));
    },
  });

  if (loading || events.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          Upcoming
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {events.map((event) => (
          <div
            key={event.id}
            className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-secondary/50 transition-colors"
          >
            <span className="shrink-0">{TYPE_ICONS[event.type] || TYPE_ICONS.reminder}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground truncate">{event.title}</p>
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0">
              {format(new Date(event.date), "EEE")}
              {event.time && ` ${event.time.slice(0, 5)}`}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default UpcomingEvents;
