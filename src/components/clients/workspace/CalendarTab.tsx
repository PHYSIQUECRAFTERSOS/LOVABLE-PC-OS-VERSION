import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarDays, Dumbbell, Heart, Camera, FileText, Bell,
  ChevronLeft, ChevronRight, Check, Plus, ClipboardList,
  Activity, MessageSquare
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameDay, isSameMonth, isToday, addMonths, subMonths
} from "date-fns";

const EVENT_TYPES = [
  { value: "workout", label: "Workout", icon: Dumbbell, color: "bg-blue-500" },
  { value: "cardio", label: "Cardio", icon: Activity, color: "bg-green-500" },
  { value: "checkin", label: "Check-in Form", icon: ClipboardList, color: "bg-purple-500" },
  { value: "reminder", label: "Appointment", icon: Bell, color: "bg-yellow-500" },
  { value: "custom", label: "Body Stats", icon: FileText, color: "bg-teal-500" },
  { value: "rest", label: "Photos", icon: Camera, color: "bg-pink-500" },
  { value: "auto_message", label: "Auto Messages", icon: MessageSquare, color: "bg-orange-500" },
];

const EVENT_DOT: Record<string, string> = {
  workout: "bg-blue-500", cardio: "bg-green-500", checkin: "bg-purple-500",
  reminder: "bg-yellow-500", custom: "bg-teal-500", rest: "bg-pink-500",
  auto_message: "bg-orange-500",
};

const COMPLETED_LABELS: Record<string, string> = {
  workout: "Workout", cardio: "Cardio", custom: "Body Stats",
  rest: "Photos", checkin: "Check-in Form",
};

interface CalEvent {
  id: string; title: string; event_date: string; event_type: string;
  is_completed: boolean; color: string | null; event_time: string | null;
}

const CalendarTab = ({ clientId }: { clientId: string }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Schedule dialog
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date | null>(null);
  const [scheduleType, setScheduleType] = useState("");
  const [scheduleTitle, setScheduleTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const loadMonth = useCallback(async () => {
    setLoading(true);
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const start = format(calStart, "yyyy-MM-dd");
    const end = format(calEnd, "yyyy-MM-dd");

    const [eventsRes, sessionsRes] = await Promise.all([
      supabase
        .from("calendar_events")
        .select("id, title, event_date, event_type, is_completed, color, event_time")
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
  }, [clientId, currentMonth]);

  useEffect(() => { loadMonth(); }, [loadMonth]);

  // Calculate completed counts for the current month
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const monthEvents = events.filter(e => {
    const d = new Date(e.event_date);
    return d >= monthStart && d <= monthEnd && e.is_completed;
  });
  const monthSessions = sessions.filter(s => {
    const d = new Date(s.created_at);
    return d >= monthStart && d <= monthEnd;
  });

  const completedCounts: Record<string, number> = {
    workout: monthSessions.filter(s => s.completed_at).length,
    cardio: monthEvents.filter(e => e.event_type === "cardio").length,
    custom: monthEvents.filter(e => e.event_type === "custom").length,
    rest: monthEvents.filter(e => e.event_type === "rest").length,
    checkin: monthEvents.filter(e => e.event_type === "checkin").length,
  };

  // Build calendar grid
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const getEventsForDay = (day: Date) => {
    const dateStr = format(day, "yyyy-MM-dd");
    const dayEvents = events.filter(e => e.event_date === dateStr);
    const daySessions = sessions.filter(s => format(new Date(s.created_at), "yyyy-MM-dd") === dateStr)
      .map(s => ({
        id: s.id,
        title: (s.workouts as any)?.name || "Workout",
        event_type: "workout" as const,
        is_completed: !!s.completed_at,
        isSession: true,
      }));
    return [...daySessions, ...dayEvents];
  };

  const handleDayClick = (day: Date) => {
    setScheduleDate(day);
    setScheduleType("");
    setScheduleTitle("");
    setShowSchedule(true);
  };

  const handleScheduleFromDropdown = (type: string) => {
    setScheduleDate(new Date());
    setScheduleType(type);
    setScheduleTitle(EVENT_TYPES.find(t => t.value === type)?.label || "");
    setShowSchedule(true);
  };

  const handleSaveEvent = async () => {
    if (!scheduleDate || !scheduleType || !user) return;
    setSaving(true);
    const { error } = await supabase.from("calendar_events").insert({
      user_id: clientId,
      title: scheduleTitle || EVENT_TYPES.find(t => t.value === scheduleType)?.label || "Event",
      event_date: format(scheduleDate, "yyyy-MM-dd"),
      event_type: scheduleType,
      is_completed: false,
      is_recurring: false,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Event scheduled" });
      setShowSchedule(false);
      loadMonth();
    }
    setSaving(false);
  };

  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  if (loading) {
    return <Skeleton className="h-[500px] rounded-xl" />;
  }

  return (
    <div className="flex gap-4">
      {/* Left sidebar - stats */}
      <div className="hidden md:block w-48 shrink-0 space-y-4">
        <Card>
          <CardHeader className="pb-2 pt-4 px-3">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
              Completed in {format(currentMonth, "MMMM")}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-2">
            {Object.entries(COMPLETED_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${EVENT_DOT[key]}`} />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
                <span className="text-xs font-semibold">{completedCounts[key] || 0}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-3">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Legend</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full border-2 border-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Scheduled</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-green-500 flex items-center justify-center">
                <Check className="h-2 w-2 text-white" />
              </div>
              <span className="text-[10px] text-muted-foreground">Completed</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <h2 className="font-display text-lg font-bold">{format(currentMonth, "MMMM yyyy")}</h2>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Schedule
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {EVENT_TYPES.map(t => (
                <DropdownMenuItem key={t.value} onClick={() => handleScheduleFromDropdown(t.value)} className="gap-2">
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-px">
          {weekDays.map(d => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1.5">{d}</div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
          {days.map(day => {
            const dayItems = getEventsForDay(day);
            const inMonth = isSameMonth(day, currentMonth);
            const today = isToday(day);

            return (
              <div
                key={day.toISOString()}
                onClick={() => handleDayClick(day)}
                className={`min-h-[90px] md:min-h-[110px] p-1 bg-card cursor-pointer transition-colors hover:bg-muted/30 ${
                  !inMonth ? "opacity-40" : ""
                } ${today ? "ring-1 ring-inset ring-primary/50" : ""}`}
              >
                <div className={`text-xs font-medium mb-0.5 w-5 h-5 flex items-center justify-center rounded-full ${
                  today ? "bg-primary text-primary-foreground" : ""
                }`}>
                  {format(day, "d")}
                </div>
                <div className="space-y-0.5">
                  {dayItems.slice(0, 3).map((item: any, i: number) => (
                    <div key={item.id + i} className="flex items-center gap-1">
                      {item.is_completed ? (
                        <div className={`h-2.5 w-2.5 rounded-full flex items-center justify-center shrink-0 ${EVENT_DOT[item.event_type] || "bg-primary"}`}>
                          <Check className="h-1.5 w-1.5 text-white" />
                        </div>
                      ) : (
                        <div className={`h-2.5 w-2.5 rounded-full border shrink-0 ${EVENT_DOT[item.event_type] ? `border-${item.event_type === 'workout' ? 'blue' : item.event_type === 'cardio' ? 'green' : item.event_type === 'checkin' ? 'purple' : 'muted-foreground'}-500` : "border-muted-foreground"}`} />
                      )}
                      <span className="text-[9px] truncate leading-tight">{item.title}</span>
                    </div>
                  ))}
                  {dayItems.length > 3 && (
                    <span className="text-[9px] text-muted-foreground pl-3">+{dayItems.length - 3} More</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Schedule Dialog */}
      <Dialog open={showSchedule} onOpenChange={setShowSchedule}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Schedule Event</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Date</Label>
              <Input type="date" value={scheduleDate ? format(scheduleDate, "yyyy-MM-dd") : ""}
                onChange={e => setScheduleDate(new Date(e.target.value + "T12:00:00"))} />
            </div>
            <div>
              <Label>Event Type</Label>
              <Select value={scheduleType} onValueChange={v => { setScheduleType(v); if (!scheduleTitle) setScheduleTitle(EVENT_TYPES.find(t => t.value === v)?.label || ""); }}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>
                      <span className="flex items-center gap-2"><t.icon className="h-3.5 w-3.5" />{t.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Title</Label>
              <Input value={scheduleTitle} onChange={e => setScheduleTitle(e.target.value)} placeholder="Event title" />
            </div>
            <Button onClick={handleSaveEvent} disabled={saving || !scheduleType} className="w-full">
              {saving ? "Saving..." : "Schedule"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CalendarTab;
