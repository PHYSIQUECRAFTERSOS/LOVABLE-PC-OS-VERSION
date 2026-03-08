import { useState, useCallback, useMemo } from "react";
import { addWeeks, subWeeks, addMonths, subMonths, format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, addDays, isSameDay } from "date-fns";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, CalendarDays, CalendarRange } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import CalendarGrid, { CalendarEvent } from "@/components/calendar/CalendarGrid";
import EventDetailModal from "@/components/calendar/EventDetailModal";
import ScheduleEventForm from "@/components/calendar/ScheduleEventForm";
import ComplianceStreak from "@/components/calendar/ComplianceStreak";
import { useDataFetch, invalidateCache } from "@/hooks/useDataFetch";
import { CalendarSkeleton, RetryBanner } from "@/components/ui/data-skeleton";
import { withDisplayPositions } from "@/utils/displayPosition";
import { formatWorkoutDayLabel } from "@/utils/workoutLabel";

const Calendar = () => {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [view, setView] = useState<"week" | "month">("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showEventDetail, setShowEventDetail] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const isCoach = role === "coach" || role === "admin";

  const dateRange = useMemo(() => {
    if (view === "week") {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });
      return { start: subDays(start, 1), end: addDays(end, 1) };
    }
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    return { start: subDays(startOfWeek(start, { weekStartsOn: 1 }), 1), end: addDays(endOfWeek(end, { weekStartsOn: 1 }), 1) };
  }, [view, currentDate]);

  const startStr = format(dateRange.start, "yyyy-MM-dd");
  const endStr = format(dateRange.end, "yyyy-MM-dd");
  const cacheKey = `calendar-${user?.id}-${startStr}-${endStr}`;

  const { data: events = [], loading, error, timedOut, refetch } = useDataFetch<CalendarEvent[]>({
    queryKey: cacheKey,
    enabled: !!user,
    staleTime: 2 * 60 * 1000, // 2 min cache
    timeout: 5000,
    fallback: [],
    queryFn: async (signal) => {
      if (!user) return [];

      const normalizeWorkoutName = (name: string) => name.replace(/^day\s*\d+\s*[:\-]\s*/i, "").trim();
      const workoutLabelMap = new Map<string, string>();

      const { data: assignment } = await supabase
        .from("client_program_assignments")
        .select("program_id, current_phase_id")
        .eq("client_id", user.id)
        .in("status", ["active", "subscribed"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (assignment?.program_id) {
        let phaseId = assignment.current_phase_id;
        if (!phaseId) {
          const { data: firstPhase } = await supabase
            .from("program_phases")
            .select("id")
            .eq("program_id", assignment.program_id)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          phaseId = firstPhase?.id ?? null;
        }

        if (phaseId) {
          const { data: pws } = await supabase
            .from("program_workouts")
            .select("workout_id, sort_order, exclude_from_numbering, custom_tag, workouts(name)")
            .eq("phase_id", phaseId)
            .order("sort_order", { ascending: true });

          const positioned = withDisplayPositions(
            (pws || []).map((pw: any) => ({
              id: pw.workout_id,
              sort_order: pw.sort_order,
              exclude_from_numbering: pw.exclude_from_numbering || false,
              custom_tag: pw.custom_tag || null,
              name: (pw.workouts as any)?.name || "Workout",
            }))
          );

          positioned.forEach((w: any) => {
            const cleanName = normalizeWorkoutName(w.name);
            const label = w.exclude_from_numbering && w.custom_tag
              ? `${w.custom_tag}: ${cleanName}`
              : w.displayPosition != null
                ? formatWorkoutDayLabel(w.displayPosition, cleanName)
                : cleanName;
            workoutLabelMap.set(w.id, label);
          });
        }
      }

      const calendarPromise = supabase
        .from("calendar_events")
        .select("*, workouts:linked_workout_id(name), cardio_assignments:linked_cardio_id(title, cardio_type, target_duration_min, description, notes)")
        .gte("event_date", startStr)
        .lte("event_date", endStr)
        .abortSignal(signal);

      const sessionsPromise = role === "client"
        ? supabase
            .from("workout_sessions")
            .select("id, workout_id, created_at, completed_at, workouts:workout_id(id, name)")
            .eq("client_id", user.id)
            .eq("status", "completed")
            .gte("created_at", `${startStr}T00:00:00`)
            .lte("created_at", `${endStr}T23:59:59`)
            .abortSignal(signal)
        : Promise.resolve({ data: null });

      const cardioPromise = role === "client"
        ? supabase
            .from("cardio_logs")
            .select("id, title, cardio_type, logged_at, completed, duration_min, notes")
            .eq("client_id", user.id)
            .gte("logged_at", startStr)
            .lte("logged_at", endStr)
            .abortSignal(signal)
        : Promise.resolve({ data: null });

      const [calRes, sessRes, cardioRes] = await Promise.all([calendarPromise, sessionsPromise, cardioPromise]);

      if (calRes.error) throw calRes.error;

      // Enrich calendar events with linked workout/cardio names
      const allEvents: CalendarEvent[] = (calRes.data || []).map((e: any) => {
        let title = e.title;
        let description = e.description;

        // Canonical workout label source (never use stale stored title/day_label)
        if (e.event_type === "workout" && e.linked_workout_id && workoutLabelMap.has(e.linked_workout_id)) {
          title = workoutLabelMap.get(e.linked_workout_id)!;
        } else if (e.event_type === "workout" && e.workouts?.name) {
          title = normalizeWorkoutName(e.workouts.name);
        }

        // Enrich cardio with full prescription
        if (e.event_type === "cardio" && e.cardio_assignments) {
          const ca = e.cardio_assignments;
          title = ca.title || ca.cardio_type || title;
          const parts: string[] = [];
          if (ca.cardio_type) parts.push(ca.cardio_type);
          if (ca.target_duration_min) parts.push(`${ca.target_duration_min} min`);
          if (ca.description) parts.push(ca.description);
          if (ca.notes) parts.push(ca.notes);
          description = parts.join(" · ") || description;
        }

        return {
          ...e,
          title,
          description,
          workouts: undefined,
          cardio_assignments: undefined,
        } as CalendarEvent;
      });

      // Merge workout sessions — use actual workout name, never generic "Workout"
      sessRes.data?.forEach((s: any) => {
        const eventDate = format(new Date(s.created_at), "yyyy-MM-dd");
        const mappedLabel = workoutLabelMap.get(s.workout_id);
        const workoutName = mappedLabel || normalizeWorkoutName(s.workouts?.name || "Unnamed Workout");
        if (!allEvents.find((e) => e.linked_workout_id === s.workout_id && e.event_date === eventDate)) {
          allEvents.push({
            id: `ws-${s.id}`, title: workoutName, event_type: "workout",
            event_date: eventDate, is_completed: !!s.completed_at, completed_at: s.completed_at,
            is_recurring: false, user_id: user.id, description: null,
            event_time: format(new Date(s.created_at), "HH:mm"), end_time: null, color: null,
            notes: null, target_client_id: null, linked_workout_id: s.workout_id,
            linked_cardio_id: null, linked_checkin_id: null, recurrence_pattern: null,
          });
        }
      });

      // Merge cardio logs
      cardioRes.data?.forEach((c: any) => {
        allEvents.push({
          id: `cl-${c.id}`, title: c.title, event_type: "cardio", event_date: c.logged_at,
          is_completed: c.completed, is_recurring: false, user_id: user.id,
          description: `${c.cardio_type} • ${c.duration_min || "—"} min`, event_time: null,
          end_time: null, color: null, notes: null, target_client_id: null,
          linked_workout_id: null, linked_cardio_id: null, linked_checkin_id: null,
          completed_at: null, recurrence_pattern: null,
        });
      });

      return allEvents;
    },
  });

  const handlePrev = () => setCurrentDate((d) => (view === "week" ? subWeeks(d, 1) : subMonths(d, 1)));
  const handleNext = () => setCurrentDate((d) => (view === "week" ? addWeeks(d, 1) : addMonths(d, 1)));

  const handleEventClick = (event: CalendarEvent) => { setSelectedEvent(event); setShowEventDetail(true); };
  const handleDayClick = (date: Date) => { if (isCoach) { setSelectedDate(date); setShowScheduleForm(true); } };

  const reloadEvents = () => { invalidateCache(cacheKey); refetch(); };

  const handleStartWorkout = (workoutId: string) => {
    // Navigate to training page — the workout logger will handle loading
    navigate("/training", { state: { startWorkoutId: workoutId } });
  };
  const handleComplete = async (event: CalendarEvent) => {
    if (event.id.startsWith("ws-") || event.id.startsWith("cl-")) {
      toast({ title: "Complete this from the Training page" });
      setShowEventDetail(false);
      return;
    }
    try {
      const { error } = await supabase.from("calendar_events").update({ is_completed: true, completed_at: new Date().toISOString() }).eq("id", event.id);
      if (error) throw error;
      toast({ title: "Marked complete!" });
      setShowEventDetail(false);
      reloadEvents();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (event: CalendarEvent) => {
    if (event.id.startsWith("ws-") || event.id.startsWith("cl-")) { toast({ title: "Cannot delete synced events here" }); return; }
    try {
      const { error } = await supabase.from("calendar_events").delete().eq("id", event.id);
      if (error) throw error;
      toast({ title: "Event deleted" });
      setShowEventDetail(false);
      reloadEvents();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-bold text-foreground">Calendar</h1>
          <div className="flex items-center gap-2">
            <Tabs value={view} onValueChange={(v) => setView(v as "week" | "month")}>
              <TabsList>
                <TabsTrigger value="week" className="gap-1.5"><CalendarDays className="h-3.5 w-3.5" />Week</TabsTrigger>
                <TabsTrigger value="month" className="gap-1.5"><CalendarRange className="h-3.5 w-3.5" />Month</TabsTrigger>
              </TabsList>
            </Tabs>
            {isCoach && (
              <Button onClick={() => { setSelectedDate(new Date()); setShowScheduleForm(true); }} size="sm">
                <Plus className="h-4 w-4 mr-1" />Schedule
              </Button>
            )}
          </div>
        </div>

        {(error || timedOut) && !events.length ? (
          <RetryBanner onRetry={reloadEvents} message={timedOut ? "Request timed out. Tap to retry." : undefined} />
        ) : loading && !events.length ? (
          <CalendarSkeleton />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
            <CalendarGrid events={events} view={view} currentDate={currentDate} onDateChange={setCurrentDate} onEventClick={handleEventClick} onDayClick={handleDayClick} onPrev={handlePrev} onNext={handleNext} />
            <div className="space-y-4">
              <ComplianceStreak events={events} />
              <div className="bg-card rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold mb-3">Upcoming</h3>
                <div className="space-y-2">
                  {events
                    .filter((e) => !e.is_completed && new Date(e.event_date) >= new Date(format(new Date(), "yyyy-MM-dd")))
                    .sort((a, b) => a.event_date.localeCompare(b.event_date))
                    .slice(0, 5)
                    .map((e) => (
                      <button key={e.id} onClick={() => handleEventClick(e)} className="w-full text-left flex items-center gap-2 p-2 rounded hover:bg-secondary/50 transition-colors">
                        <div className={`h-2 w-2 rounded-full shrink-0 ${e.event_type === "workout" ? "bg-blue-500" : e.event_type === "cardio" ? "bg-green-500" : e.event_type === "checkin" ? "bg-purple-500" : e.event_type === "rest" ? "bg-muted-foreground" : "bg-primary"}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{e.title}</p>
                          <p className="text-[10px] text-muted-foreground">{format(new Date(e.event_date), "EEE, MMM d")}{e.event_time && ` • ${e.event_time.slice(0, 5)}`}</p>
                        </div>
                      </button>
                    ))}
                  {events.filter((e) => !e.is_completed && new Date(e.event_date) >= new Date(format(new Date(), "yyyy-MM-dd"))).length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">No upcoming events</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <EventDetailModal event={selectedEvent} open={showEventDetail} onClose={() => setShowEventDetail(false)} onComplete={handleComplete} onDelete={handleDelete} isCoach={isCoach} onStartWorkout={handleStartWorkout} />
      <ScheduleEventForm open={showScheduleForm} onClose={() => setShowScheduleForm(false)} onSave={reloadEvents} selectedDate={selectedDate} isCoach={isCoach} />
    </AppLayout>
  );
};

export default Calendar;
