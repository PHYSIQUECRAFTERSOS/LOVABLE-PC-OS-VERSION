import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, Dumbbell, UtensilsCrossed, CheckCircle2 } from "lucide-react";
import { format, startOfWeek, addDays, isToday, isSameDay } from "date-fns";

const CalendarTab = ({ clientId }: { clientId: string }) => {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

  useEffect(() => {
    loadWeek();
  }, [clientId, weekStart]);

  const loadWeek = async () => {
    setLoading(true);
    const start = format(weekStart, "yyyy-MM-dd");
    const end = format(addDays(weekStart, 6), "yyyy-MM-dd");

    const [eventsRes, sessionsRes] = await Promise.all([
      supabase
        .from("calendar_events")
        .select("id, title, event_date, event_type, is_completed, color")
        .eq("user_id", clientId)
        .gte("event_date", start)
        .lte("event_date", end)
        .order("event_date"),
      supabase
        .from("workout_sessions")
        .select("id, created_at, completed_at, workouts(name)")
        .eq("client_id", clientId)
        .gte("created_at", `${start}T00:00:00`)
        .lte("created_at", `${end}T23:59:59`),
    ]);

    setEvents(eventsRes.data || []);
    setSessions(sessionsRes.data || []);
    setLoading(false);
  };

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  if (loading) {
    return (
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Week Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setWeekStart(addDays(weekStart, -7))}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Prev
        </button>
        <h3 className="text-sm font-medium">
          {format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d, yyyy")}
        </h3>
        <button
          onClick={() => setWeekStart(addDays(weekStart, 7))}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Next →
        </button>
      </div>

      {/* Week Grid */}
      <div className="grid grid-cols-7 gap-2">
        {days.map(day => {
          const dateStr = format(day, "yyyy-MM-dd");
          const dayEvents = events.filter(e => e.event_date === dateStr);
          const daySessions = sessions.filter(s =>
            format(new Date(s.created_at), "yyyy-MM-dd") === dateStr
          );
          const today = isToday(day);

          return (
            <div
              key={dateStr}
              className={`border rounded-lg p-2 min-h-[100px] ${
                today ? "ring-1 ring-primary border-primary/50" : "border-border"
              }`}
            >
              <p className={`text-[10px] font-medium mb-1 ${today ? "text-primary" : "text-muted-foreground"}`}>
                {format(day, "EEE d")}
              </p>
              <div className="space-y-1">
                {daySessions.map((s: any) => (
                  <div key={s.id} className="flex items-center gap-1">
                    <Dumbbell className="h-2.5 w-2.5 text-primary shrink-0" />
                    <span className="text-[9px] truncate">{(s.workouts as any)?.name || "Workout"}</span>
                    {s.completed_at && <CheckCircle2 className="h-2.5 w-2.5 text-green-500 shrink-0" />}
                  </div>
                ))}
                {dayEvents.map((e: any) => (
                  <div key={e.id} className="flex items-center gap-1">
                    <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: e.color || "hsl(var(--primary))" }} />
                    <span className="text-[9px] truncate">{e.title}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CalendarTab;
