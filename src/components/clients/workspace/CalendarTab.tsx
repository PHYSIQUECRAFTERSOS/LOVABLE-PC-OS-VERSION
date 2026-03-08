import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarDays, Dumbbell, Heart, Camera, FileText, Bell,
  ChevronLeft, ChevronRight, Check, Plus, ClipboardList,
  Activity, MessageSquare, Repeat
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameDay, isSameMonth, isToday, addMonths, subMonths,
  addDays, addWeeks
} from "date-fns";
import { withDisplayPositions } from "@/utils/displayPosition";
import { formatWorkoutDayLabel } from "@/utils/workoutLabel";

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
  rest: "Photos", checkin: "Check-in",
};

const WEEK_DAYS_FULL = [
  { label: "Mon", value: 1 }, { label: "Tue", value: 2 }, { label: "Wed", value: 3 },
  { label: "Thu", value: 4 }, { label: "Fri", value: 5 }, { label: "Sat", value: 6 }, { label: "Sun", value: 0 },
];

const CARDIO_TYPES = [
  "Running", "Walking", "Cycling", "Rowing", "Elliptical",
  "Stair Climbing", "Swimming", "HIIT", "Hiking", "Basketball",
  "Soccer", "Tennis", "Custom",
];

const CARDIO_TARGET_TYPES = [
  { value: "none", label: "None" },
  { value: "distance", label: "Distance" },
  { value: "time", label: "Time" },
  { value: "custom", label: "Add my own target" },
];

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
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [scheduleTitle, setScheduleTitle] = useState("");
  const [saving, setSaving] = useState(false);

  // Repeat config
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatFrequency, setRepeatFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [repeatEveryN, setRepeatEveryN] = useState(1);
  const [repeatForWeeks, setRepeatForWeeks] = useState(4);

  // Client workouts for linking
  const [clientWorkouts, setClientWorkouts] = useState<any[]>([]);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState("");

  // Cardio config
  const [cardioType, setCardioType] = useState("Running");
  const [cardioTargetType, setCardioTargetType] = useState("none");
  const [cardioTargetValue, setCardioTargetValue] = useState("");
  const [cardioTargetUnit, setCardioTargetUnit] = useState("km");
  const [cardioNotes, setCardioNotes] = useState("");

  // Drag state
  const [dragEvent, setDragEvent] = useState<CalEvent | null>(null);

  const loadMonth = useCallback(async () => {
    setLoading(true);
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const start = format(calStart, "yyyy-MM-dd");
    const end = format(calEnd, "yyyy-MM-dd");

    const [eventsRes, sessionsRes] = await Promise.all([
      supabase.from("calendar_events")
        .select("id, title, event_date, event_type, is_completed, color, event_time")
        .eq("user_id", clientId).gte("event_date", start).lte("event_date", end).order("event_date"),
      supabase.from("workout_sessions")
        .select("id, created_at, completed_at, workouts(name)")
        .eq("client_id", clientId)
        .gte("created_at", `${start}T00:00:00`).lte("created_at", `${end}T23:59:59`),
    ]);

    setEvents(eventsRes.data || []);
    setSessions(sessionsRes.data || []);
    setLoading(false);
  }, [clientId, currentMonth]);

  useEffect(() => { loadMonth(); }, [loadMonth]);

  const loadClientWorkouts = async () => {
    const { data: assignData } = await supabase.from("client_program_assignments")
      .select("program_id").eq("client_id", clientId).eq("status", "active").limit(1).maybeSingle();
    if (!assignData) return;
    const { data: phases } = await supabase.from("program_phases").select("id").eq("program_id", assignData.program_id);
    if (!phases?.length) return;
    const { data: pws } = await supabase.from("program_workouts")
      .select("workout_id, day_label, workouts(id, name)").in("phase_id", phases.map(p => p.id));
    setClientWorkouts((pws || []).map((pw: any) => ({
      id: pw.workout_id, name: (pw.workouts as any)?.name || "Workout", day_label: pw.day_label,
    })));
  };

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
        event_date: dateStr,
        color: null,
        event_time: null,
      }));
    return [...daySessions, ...dayEvents];
  };

  const handleDayClick = (day: Date) => {
    setScheduleDate(day);
    setSelectedTypes([]);
    setScheduleTitle("");
    setRepeatEnabled(false);
    setRepeatDays([]);
    setSelectedWorkoutId("");
    setCardioType("Running");
    setCardioTargetType("none");
    setCardioTargetValue("");
    setCardioNotes("");
    loadClientWorkouts();
    setShowSchedule(true);
  };

  const toggleType = (type: string) => {
    setSelectedTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  const generateRepeatDates = (baseDate: Date): string[] => {
    const dates: string[] = [format(baseDate, "yyyy-MM-dd")];
    if (!repeatEnabled) return dates;
    if (repeatFrequency === "daily") {
      for (let i = 1; i < repeatForWeeks * 7; i++) dates.push(format(addDays(baseDate, i), "yyyy-MM-dd"));
    } else if (repeatFrequency === "weekly") {
      for (let week = 0; week < repeatForWeeks; week++) {
        const weekStart = addWeeks(baseDate, week * repeatEveryN);
        for (const dayNum of repeatDays) {
          const diff = (dayNum - weekStart.getDay() + 7) % 7;
          const d = addDays(weekStart, diff === 0 && week === 0 ? 0 : diff || 7);
          const dateStr = format(d, "yyyy-MM-dd");
          if (!dates.includes(dateStr) && d > baseDate) dates.push(dateStr);
        }
      }
    } else if (repeatFrequency === "monthly") {
      for (let i = 1; i <= repeatForWeeks; i++) dates.push(format(addMonths(baseDate, i), "yyyy-MM-dd"));
    }
    return dates;
  };

  const handleSaveEvent = async () => {
    if (!scheduleDate || selectedTypes.length === 0 || !user) return;
    setSaving(true);

    const dates = generateRepeatDates(scheduleDate);
    const eventsToInsert: any[] = [];

    for (const dateStr of dates) {
      for (const type of selectedTypes) {
        // Determine title
        let title = "";
        if (type === "workout" && selectedWorkoutId) {
          const w = clientWorkouts.find(w => w.id === selectedWorkoutId);
          title = w ? `${w.day_label} – ${w.name}` : "Workout";
        } else if (type === "cardio") {
          const targetStr = cardioTargetType !== "none" && cardioTargetValue
            ? ` — ${cardioTargetValue} ${cardioTargetUnit}`
            : "";
          title = `${cardioType}${targetStr}`;
        } else if (selectedTypes.length === 1 && scheduleTitle) {
          title = scheduleTitle;
        } else {
          title = EVENT_TYPES.find(t => t.value === type)?.label || "Event";
        }

        eventsToInsert.push({
          user_id: clientId, title, event_date: dateStr, event_type: type,
          is_completed: false, is_recurring: repeatEnabled,
          recurrence_pattern: repeatEnabled ? `${repeatFrequency}:${repeatEveryN}:${repeatDays.join(",")}` : null,
          linked_workout_id: type === "workout" && selectedWorkoutId ? selectedWorkoutId : null,
          notes: type === "cardio" ? cardioNotes || null : null,
        });
      }
    }

    // Also create cardio_assignments if cardio type is selected
    if (selectedTypes.includes("cardio") && user) {
      for (const dateStr of dates) {
        await supabase.from("cardio_assignments").insert({
          client_id: clientId,
          coach_id: user.id,
          title: cardioType,
          cardio_type: cardioType.toLowerCase().replace(/\s+/g, "_"),
          assigned_date: dateStr,
          target_duration_min: cardioTargetType === "time" && cardioTargetValue ? parseInt(cardioTargetValue) : null,
          target_distance_km: cardioTargetType === "distance" && cardioTargetUnit === "km" && cardioTargetValue ? parseFloat(cardioTargetValue) : null,
          notes: cardioNotes || null,
          description: cardioTargetType === "custom" && cardioTargetValue ? cardioTargetValue : null,
        });
      }
    }

    const { error } = await supabase.from("calendar_events").insert(eventsToInsert);
    if (error) {
      toast({ title: "Error scheduling", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${eventsToInsert.length} event${eventsToInsert.length > 1 ? "s" : ""} scheduled` });
      setShowSchedule(false);
      loadMonth();
    }
    setSaving(false);
  };

  // Drag and drop
  const handleDragStart = (e: React.DragEvent, event: CalEvent) => {
    if ((event as any).isSession) return;
    setDragEvent(event);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = async (e: React.DragEvent, day: Date) => {
    e.preventDefault();
    if (!dragEvent) return;
    const newDate = format(day, "yyyy-MM-dd");
    if (newDate === dragEvent.event_date) { setDragEvent(null); return; }
    await supabase.from("calendar_events").update({ event_date: newDate }).eq("id", dragEvent.id);
    setDragEvent(null);
    loadMonth();
    toast({ title: "Event moved" });
  };

  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  if (loading) return <Skeleton className="h-[500px] rounded-xl" />;

  return (
    <div className="flex gap-4">
      {/* Left sidebar */}
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
            {EVENT_TYPES.map(t => (
              <div key={t.value} className="flex items-center gap-2">
                <div className={`h-2.5 w-2.5 rounded-full ${t.color}`} />
                <span className="text-[10px] text-muted-foreground">{t.label}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight className="h-4 w-4" /></Button>
            <h2 className="font-display text-lg font-bold">{format(currentMonth, "MMMM yyyy")}</h2>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => handleDayClick(new Date())}>
            <Plus className="h-3.5 w-3.5" /> Schedule
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-px">
          {weekDays.map(d => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1.5">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
          {days.map(day => {
            const dayItems = getEventsForDay(day);
            const inMonth = isSameMonth(day, currentMonth);
            const today = isToday(day);

            return (
              <div key={day.toISOString()} onClick={() => handleDayClick(day)}
                onDragOver={e => e.preventDefault()} onDrop={e => handleDrop(e, day)}
                className={`min-h-[90px] md:min-h-[110px] p-1 bg-card cursor-pointer transition-colors hover:bg-muted/30 ${!inMonth ? "opacity-40" : ""} ${today ? "ring-1 ring-inset ring-primary/50" : ""}`}>
                <div className={`text-xs font-medium mb-0.5 w-5 h-5 flex items-center justify-center rounded-full ${today ? "bg-primary text-primary-foreground" : ""}`}>
                  {format(day, "d")}
                </div>
                <div className="space-y-0.5">
                  {dayItems.slice(0, 3).map((item: any, i: number) => (
                    <div key={item.id + i} draggable={!item.isSession}
                      onDragStart={e => handleDragStart(e, item)}
                      className="flex items-center gap-1 cursor-grab active:cursor-grabbing">
                      {item.is_completed ? (
                        <div className={`h-2.5 w-2.5 rounded-full flex items-center justify-center shrink-0 ${EVENT_DOT[item.event_type] || "bg-primary"}`}>
                          <Check className="h-1.5 w-1.5 text-white" />
                        </div>
                      ) : (
                        <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${EVENT_DOT[item.event_type] || "bg-primary"} opacity-40`} />
                      )}
                      <span className="text-[9px] truncate leading-tight">{item.title}</span>
                    </div>
                  ))}
                  {dayItems.length > 3 && (
                    <span className="text-[9px] text-muted-foreground pl-3">+{dayItems.length - 3} more</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Schedule Dialog */}
      <Dialog open={showSchedule} onOpenChange={setShowSchedule}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Schedule Events</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Date</Label>
              <Input type="date" value={scheduleDate ? format(scheduleDate, "yyyy-MM-dd") : ""}
                onChange={e => setScheduleDate(new Date(e.target.value + "T12:00:00"))} />
            </div>

            {/* Multi-select event types */}
            <div>
              <Label className="mb-2 block">Event Types</Label>
              <div className="grid grid-cols-2 gap-2">
                {EVENT_TYPES.map(t => (
                  <label key={t.value} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${selectedTypes.includes(t.value) ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}>
                    <Checkbox checked={selectedTypes.includes(t.value)} onCheckedChange={() => toggleType(t.value)} />
                    <t.icon className="h-3.5 w-3.5" />
                    <span className="text-xs">{t.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Workout picker */}
            {selectedTypes.includes("workout") && clientWorkouts.length > 0 && (
              <div>
                <Label>Link to Workout</Label>
                <Select value={selectedWorkoutId} onValueChange={setSelectedWorkoutId}>
                  <SelectTrigger><SelectValue placeholder="Select workout" /></SelectTrigger>
                  <SelectContent>
                    {clientWorkouts.map(w => (
                      <SelectItem key={w.id} value={w.id}>{w.day_label} – {w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Cardio config */}
            {selectedTypes.includes("cardio") && (
              <div className="space-y-3 p-3 rounded-lg border border-border bg-muted/20">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cardio Details</p>
                <div>
                  <Label className="text-xs">Activity Type</Label>
                  <Select value={cardioType} onValueChange={setCardioType}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CARDIO_TYPES.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Set a Target</Label>
                  <Select value={cardioTargetType} onValueChange={setCardioTargetType}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CARDIO_TARGET_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {cardioTargetType === "distance" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Value</Label>
                      <Input type="number" value={cardioTargetValue} onChange={e => setCardioTargetValue(e.target.value)} className="h-8" placeholder="5" />
                    </div>
                    <div>
                      <Label className="text-xs">Unit</Label>
                      <Select value={cardioTargetUnit} onValueChange={setCardioTargetUnit}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="km">km</SelectItem>
                          <SelectItem value="miles">miles</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
                {cardioTargetType === "time" && (
                  <div>
                    <Label className="text-xs">Duration (minutes)</Label>
                    <Input type="number" value={cardioTargetValue} onChange={e => setCardioTargetValue(e.target.value)} className="h-8" placeholder="30" />
                  </div>
                )}
                {cardioTargetType === "custom" && (
                  <div>
                    <Label className="text-xs">Custom Target</Label>
                    <Input value={cardioTargetValue} onChange={e => setCardioTargetValue(e.target.value)} className="h-8" placeholder="e.g. Burn 300 calories" />
                  </div>
                )}
                <div>
                  <Label className="text-xs">Notes (optional)</Label>
                  <Textarea value={cardioNotes} onChange={e => setCardioNotes(e.target.value)} className="h-16 text-xs" placeholder="Additional instructions..." />
                </div>
              </div>
            )}

            {/* Title for single non-workout/cardio events */}
            {selectedTypes.length === 1 && !selectedTypes.includes("workout") && !selectedTypes.includes("cardio") && (
              <div>
                <Label>Title</Label>
                <Input value={scheduleTitle} onChange={e => setScheduleTitle(e.target.value)} placeholder="Event title (optional)" />
              </div>
            )}

            {/* Repeat config */}
            <div className="border rounded-lg p-3 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={repeatEnabled} onCheckedChange={v => setRepeatEnabled(!!v)} />
                <Repeat className="h-3.5 w-3.5" />
                <span className="text-sm font-medium">Repeat</span>
              </label>
              {repeatEnabled && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {(["daily", "weekly", "monthly"] as const).map(f => (
                      <button key={f} onClick={() => setRepeatFrequency(f)}
                        className={`text-xs px-2 py-1.5 rounded-md border transition-colors ${repeatFrequency === f ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </button>
                    ))}
                  </div>
                  {repeatFrequency === "weekly" && (
                    <div>
                      <Label className="text-xs mb-1.5 block">Repeat on</Label>
                      <div className="flex gap-1.5">
                        {WEEK_DAYS_FULL.map(d => (
                          <button key={d.value} onClick={() => setRepeatDays(prev => prev.includes(d.value) ? prev.filter(v => v !== d.value) : [...prev, d.value])}
                            className={`w-8 h-8 rounded-full text-[10px] font-medium transition-colors ${repeatDays.includes(d.value) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {repeatFrequency === "weekly" && (
                      <div>
                        <Label className="text-xs">Every X weeks</Label>
                        <Input type="number" min={1} max={12} value={repeatEveryN} onChange={e => setRepeatEveryN(parseInt(e.target.value) || 1)} className="h-8" />
                      </div>
                    )}
                    <div>
                      <Label className="text-xs">For how many {repeatFrequency === "monthly" ? "months" : "weeks"}</Label>
                      <Input type="number" min={1} max={52} value={repeatForWeeks} onChange={e => setRepeatForWeeks(parseInt(e.target.value) || 1)} className="h-8" />
                    </div>
                  </div>
                </>
              )}
            </div>

            <Button onClick={handleSaveEvent} disabled={saving || selectedTypes.length === 0} className="w-full">
              {saving ? "Saving..." : `Schedule ${selectedTypes.length} type${selectedTypes.length > 1 ? "s" : ""}${repeatEnabled ? " (recurring)" : ""}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CalendarTab;
