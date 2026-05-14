import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import WeightHistoryScreen from "@/components/dashboard/WeightHistoryScreen";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import EventDetailModal from "@/components/calendar/EventDetailModal";
import { CalendarEvent } from "@/components/calendar/CalendarGrid";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CalendarDays, Dumbbell, Heart, Camera, FileText, Bell,
  ChevronLeft, ChevronRight, Check, Plus, ClipboardList,
  Activity, MessageSquare, Repeat, Trash2, UtensilsCrossed,
  TrendingUp, TrendingDown, Scale
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameDay, isSameMonth, isToday, addMonths, subMonths,
  addDays, addWeeks
} from "date-fns";
import { withDisplayPositions } from "@/utils/displayPosition";
import { formatWorkoutDayLabel } from "@/utils/workoutLabel";
import { usePhaseBoundaries } from "@/hooks/usePhaseBoundaries";
import { Flag } from "lucide-react";

const EVENT_TYPES = [
  { value: "workout", label: "Workout", icon: Dumbbell, color: "bg-blue-500" },
  { value: "cardio", label: "Cardio", icon: Activity, color: "bg-green-500" },
  { value: "checkin", label: "Check-in Form", icon: ClipboardList, color: "bg-purple-500" },
  { value: "reminder", label: "Appointment", icon: Bell, color: "bg-yellow-500" },
  { value: "custom", label: "Body Stats", icon: FileText, color: "bg-teal-500" },
  { value: "rest", label: "Photos", icon: Camera, color: "bg-pink-500" },
  { value: "auto_message", label: "Auto Messages", icon: MessageSquare, color: "bg-orange-500" },
  { value: "nutrition", label: "Nutrition", icon: UtensilsCrossed, color: "bg-red-500" },
];

const EVENT_DOT: Record<string, string> = {
  workout: "bg-blue-500", cardio: "bg-green-500", checkin: "bg-purple-500",
  reminder: "bg-yellow-500", custom: "bg-teal-500", rest: "bg-pink-500",
  auto_message: "bg-orange-500", nutrition: "bg-red-500",
  body_stats: "bg-purple-500", photos: "bg-orange-500", steps: "bg-blue-500",
};

const COMPLETED_LABELS: Record<string, string> = {
  workout: "Workout", cardio: "Cardio", custom: "Body Stats",
  rest: "Photos", checkin: "Check-in", nutrition: "Nutrition",
  body_stats: "Body Stats", photos: "Photos",
};

// Resolve effective event type from event_type + title keywords
const resolveEventType = (ev: { event_type: string; title: string }): string => {
  const t = ev.event_type;
  if (t === "body_stats" || t === "photos") return t;
  const titleLower = ev.title.toLowerCase();
  if (titleLower.includes("body stat") || titleLower.includes("bodystats")) return "body_stats";
  if (titleLower.includes("photo") || titleLower.includes("progress pic")) return "photos";
  if (titleLower.includes("check-in") || titleLower.includes("checkin")) return "checkin";
  return t;
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
  description?: string | null; notes?: string | null;
  linked_workout_id?: string | null; linked_cardio_id?: string | null;
  linked_checkin_id?: string | null; is_recurring?: boolean;
  recurrence_pattern?: string | null; target_client_id?: string | null;
  completed_at?: string | null; end_time?: string | null; user_id?: string;
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
  const [clientWorkouts, setClientWorkouts] = useState<{ id: string; label: string }[]>([]);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState("");

  // Cardio config
  const [cardioType, setCardioType] = useState("Running");
  const [cardioTargetType, setCardioTargetType] = useState("none");
  const [cardioTargetValue, setCardioTargetValue] = useState("");
  const [cardioTargetUnit, setCardioTargetUnit] = useState("km");
  const [cardioNotes, setCardioNotes] = useState("");

  const [dragEvent, setDragEvent] = useState<CalEvent | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [weightMap, setWeightMap] = useState<Map<string, { weight: number; body_fat?: number | null }>>(new Map());
  const [weightHistoryOpen, setWeightHistoryOpen] = useState(false);
  const [showEventDetail, setShowEventDetail] = useState(false);
  const [expandedDay, setExpandedDay] = useState<Date | null>(null);

  // Clear calendar dialog
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [clearStartDate, setClearStartDate] = useState("");
  const [clearEndDate, setClearEndDate] = useState("");
  const [clearStatus, setClearStatus] = useState<"all" | "scheduled" | "completed">("all");
  const [clearTypes, setClearTypes] = useState<string[]>([]);
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const toggleClearType = (type: string) => {
    setClearTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  const openClearDialog = () => {
    const start = format(startOfMonth(currentMonth), "yyyy-MM-dd");
    const end = format(endOfMonth(currentMonth), "yyyy-MM-dd");
    setClearStartDate(start);
    setClearEndDate(end);
    setClearStatus("all");
    setClearTypes([]);
    setShowClearDialog(true);
  };

  const handleClearCalendar = async () => {
    if (clearTypes.length === 0) {
      toast({ title: "Select at least one event type", variant: "destructive" });
      return;
    }
    setClearing(true);
    let query = supabase.from("calendar_events").delete()
      .eq("user_id", clientId)
      .gte("event_date", clearStartDate)
      .lte("event_date", clearEndDate)
      .in("event_type", clearTypes);

    if (clearStatus === "scheduled") {
      query = query.eq("is_completed", false);
    } else if (clearStatus === "completed") {
      query = query.eq("is_completed", true);
    }

    const { error } = await query;
    if (error) {
      toast({ title: "Error clearing events", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Calendar cleared", description: "Selected events have been removed." });
      setShowClearDialog(false);
      setShowClearConfirm(false);
      loadMonth();
    }
    setClearing(false);
  };

  const loadMonth = useCallback(async () => {
    setLoading(true);
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const start = format(calStart, "yyyy-MM-dd");
    const end = format(calEnd, "yyyy-MM-dd");

    const workoutLabelMap = new Map<string, string>();

    const { data: assignment } = await supabase
      .from("client_program_assignments")
      .select("program_id, current_phase_id")
      .eq("client_id", clientId)
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

    const [eventsResult, sessionsResult, nutResult, weightResult] = await Promise.allSettled([
      supabase.from("calendar_events")
        .select("id, title, event_date, event_type, is_completed, color, event_time, linked_workout_id, description, notes, linked_cardio_id, linked_checkin_id, is_recurring, recurrence_pattern, target_client_id, completed_at, end_time, user_id")
        .eq("user_id", clientId).gte("event_date", start).lte("event_date", end).order("event_date"),
      supabase.from("workout_sessions")
        .select("id, workout_id, session_date, created_at, completed_at, workouts(name)")
        .eq("client_id", clientId)
        // Fetch by session_date (client-local YYYY-MM-DD) so coach-timezone drift
        // does not exclude or duplicate sessions across day boundaries.
        // Pad ±1 day to catch any legacy rows where session_date may be missing.
        .gte("session_date", start).lte("session_date", end),
      supabase.from("nutrition_logs")
        .select("id, logged_at, meal_type, calories, protein, carbs, fat, custom_name, food_item_id, quantity_display, quantity_unit")
        .eq("client_id", clientId)
        .gte("logged_at", start).lte("logged_at", end),
      supabase.from("weight_logs")
        .select("weight, logged_at")
        .eq("client_id", clientId)
        .gte("logged_at", start).lte("logged_at", end)
        .order("logged_at", { ascending: true }),
    ]);

    const eventsRes = eventsResult.status === "fulfilled" ? eventsResult.value : { data: null };
    const sessionsRes = sessionsResult.status === "fulfilled" ? sessionsResult.value : { data: null };
    const nutRes = nutResult.status === "fulfilled" ? nutResult.value : { data: null };
    const weightRes = weightResult.status === "fulfilled" ? weightResult.value : { data: null };

    // Build weight map keyed by en-CA date string
    const newWeightMap = new Map<string, { weight: number; body_fat?: number | null }>();
    if (weightRes.data) {
      for (const w of weightRes.data) {
        newWeightMap.set(w.logged_at, { weight: Number(w.weight) });
      }
    }
    setWeightMap(newWeightMap);

    const normalizedEvents: CalEvent[] = (eventsRes.data || []).map((e: any) => {
      if (e.event_type === "workout" && e.linked_workout_id && workoutLabelMap.has(e.linked_workout_id)) {
        return { ...e, title: workoutLabelMap.get(e.linked_workout_id) };
      }
      return e;
    });

    // Merge nutrition logs into daily summary events
    const nutData = nutRes.data || [];
    if (nutData.length > 0) {
      const nutByDate: Record<string, { calories: number; protein: number; carbs: number; fat: number; count: number }> = {};
      nutData.forEach((n: any) => {
        const d = n.logged_at;
        if (!nutByDate[d]) nutByDate[d] = { calories: 0, protein: 0, carbs: 0, fat: 0, count: 0 };
        nutByDate[d].calories += n.calories || 0;
        nutByDate[d].protein += n.protein || 0;
        nutByDate[d].carbs += n.carbs || 0;
        nutByDate[d].fat += n.fat || 0;
        nutByDate[d].count += 1;
      });

      Object.entries(nutByDate).forEach(([dateStr, totals]) => {
        normalizedEvents.push({
          id: `nut-${dateStr}`,
          title: `${totals.count} Foods Added`,
          event_type: "nutrition",
          event_date: dateStr,
          is_completed: true,
          completed_at: null,
          is_recurring: false,
          user_id: clientId,
          description: `${Math.round(totals.calories)} Cals, Protein ${Math.round(totals.protein)}g, Carbs ${Math.round(totals.carbs)}g, Fat ${Math.round(totals.fat)}g`,
          event_time: null,
          end_time: null,
          color: null,
          notes: null,
          target_client_id: null,
          linked_workout_id: null,
          linked_cardio_id: null,
          linked_checkin_id: null,
          recurrence_pattern: null,
        } as CalEvent);
      });
    }

    setEvents(normalizedEvents);
    setSessions((sessionsRes.data || []).map((s: any) => ({
      ...s,
      workouts: {
        name: workoutLabelMap.get(s.workout_id) || (s.workouts as any)?.name || "Workout",
      },
    })));
    setLoading(false);
  }, [clientId, currentMonth]);

  useEffect(() => { loadMonth(); }, [loadMonth]);

  function normalizeWorkoutName(name: string) {
    return name.replace(/^day\s*\d+\s*[:\-]\s*/i, "").trim();
  }

  const { resolvePhaseForDate, boundariesByDate, phases: programPhases } = usePhaseBoundaries(clientId);
  const [activePhaseLabel, setActivePhaseLabel] = useState<string | null>(null);

  const loadClientWorkouts = async (forDate?: Date | null) => {
    // Resolve which phase the chosen scheduling date belongs to.
    // Falls back to today's phase, then to the first phase, so the dropdown
    // always reflects the date the coach is actually scheduling for —
    // not the static current_phase_id pointer.
    const ymd = forDate
      ? format(forDate, "yyyy-MM-dd")
      : new Date().toLocaleDateString("en-CA");
    const resolved = resolvePhaseForDate(ymd);
    const phaseId = resolved?.id ?? null;
    setActivePhaseLabel(resolved?.name ?? null);

    if (!phaseId) {
      setClientWorkouts([]);
      return;
    }

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

    // Root cause note:
    // The old code used `program_workouts.day_label` directly, which had stale values (e.g. Day 6/7), causing phantom prefixes.
    // We now derive label from ordered display position + workout name only.
    const mapped = positioned.map((w: any) => {
      const cleanName = normalizeWorkoutName(w.name);
      const label = w.exclude_from_numbering && w.custom_tag
        ? `${w.custom_tag}: ${cleanName}`
        : w.displayPosition != null
          ? formatWorkoutDayLabel(w.displayPosition, cleanName)
          : cleanName;
      return { id: w.id, label };
    });

    setClientWorkouts(mapped);
  };

  // Reload workouts whenever the coach changes the scheduling date — phase
  // membership is date-driven now, so a date change can swap the entire list.
  useEffect(() => {
    if (showSchedule) loadClientWorkouts(scheduleDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleDate, showSchedule, programPhases.length]);


  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const monthEvents = events.filter(e => {
    const d = new Date(e.event_date);
    return d >= monthStart && d <= monthEnd && e.is_completed;
  });
  const monthSessions = sessions.filter(s => {
    // Use session_date (client-local) so coach-timezone drift does not
    // shift sessions into adjacent months in the count.
    const dateStr = s.session_date || format(new Date(s.created_at), "yyyy-MM-dd");
    const d = new Date(dateStr + "T12:00:00");
    return d >= monthStart && d <= monthEnd;
  });

  const completedCounts: Record<string, number> = {
    workout: monthSessions.filter(s => s.completed_at).length,
    cardio: monthEvents.filter(e => e.event_type === "cardio").length,
    custom: monthEvents.filter(e => resolveEventType(e) === "body_stats" && e.event_type === "custom").length,
    rest: monthEvents.filter(e => resolveEventType(e) === "photos" && e.event_type === "rest").length,
    checkin: monthEvents.filter(e => e.event_type === "checkin").length,
    body_stats: monthEvents.filter(e => e.event_type === "body_stats").length,
    photos: monthEvents.filter(e => e.event_type === "photos").length,
  };

  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const getEventsForDay = (day: Date) => {
    const dateStr = format(day, "yyyy-MM-dd");
    const dayEvents = events.filter(e => e.event_date === dateStr);
    // CRITICAL: Bucket sessions by session_date (client-local YYYY-MM-DD)
    // — NEVER by created_at (UTC), which would shift the workout to a different
    // day cell in the coach's timezone and produce duplicate pills (Bug 2).
    const daySessions = sessions.filter(s => {
      const sDate = s.session_date || format(new Date(s.created_at), "yyyy-MM-dd");
      return sDate === dateStr;
    });

    // Merge session completion status into matching calendar events
    const linkedWorkoutIds = new Set<string>();
    const mergedEvents = dayEvents.map(e => {
      if (e.event_type === "workout" && e.linked_workout_id) {
        const matchingSession = daySessions.find(s => s.workout_id === e.linked_workout_id);
        if (matchingSession) {
          linkedWorkoutIds.add(matchingSession.workout_id);
          if (!e.is_completed && matchingSession.completed_at) {
            return { ...e, is_completed: true, completed_at: matchingSession.completed_at };
          }
        }
      }
      return e;
    });

    // Only include sessions that DON'T have a matching calendar event.
    // CRITICAL: Carry linked_workout_id so EventDetailModal can populate
    // the prescribed exercises + logged sets when the orphan pill is clicked (Bug 1).
    const orphanSessions = daySessions
      .filter(s => !linkedWorkoutIds.has(s.workout_id))
      .map(s => ({
        id: s.id,
        title: (s.workouts as any)?.name || "Workout",
        event_type: "workout" as const,
        is_completed: !!s.completed_at,
        completed_at: s.completed_at || null,
        isSession: true,
        event_date: dateStr,
        linked_workout_id: s.workout_id,
        color: null,
        event_time: null,
      }));

    return [...orphanSessions, ...mergedEvents];
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
    const baseDateStr = format(baseDate, "yyyy-MM-dd");
    if (!repeatEnabled) return [baseDateStr];

    const dates: string[] = [];

    if (repeatFrequency === "daily") {
      dates.push(baseDateStr);
      for (let i = 1; i < repeatForWeeks * 7; i++)
        dates.push(format(addDays(baseDate, i), "yyyy-MM-dd"));
    } else if (repeatFrequency === "weekly") {
      // Find Monday of the base date's week
      const jsDay = baseDate.getDay(); // Sun=0, Mon=1 ... Sat=6
      const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
      const baseMonday = addDays(baseDate, mondayOffset);

      // Default to same weekday as base date if no specific days selected
      // Convert JS day values (Mon=1,Tue=2...Sun=0) to Monday-based offsets (Mon=0,Tue=1...Sun=6)
      const toMondayOffset = (jsDayVal: number) => jsDayVal === 0 ? 6 : jsDayVal - 1;

      const daysToRepeat = repeatDays.length > 0
        ? repeatDays.map(toMondayOffset)
        : [toMondayOffset(jsDay)];

      // Start from week 0 to include the first week, iterate for repeatForWeeks total
      for (let week = 0; week < repeatForWeeks; week++) {
        const weekMonday = addWeeks(baseMonday, week * repeatEveryN);
        for (const offset of daysToRepeat) {
          const d = addDays(weekMonday, offset); // offset: 0=Mon, 1=Tue ... 6=Sun
          const dateStr = format(d, "yyyy-MM-dd");
          // Skip dates before the base date to avoid scheduling in the past
          if (dateStr < baseDateStr) continue;
          if (!dates.includes(dateStr)) dates.push(dateStr);
        }
      }

      // If no dates generated, at least include the base date
      if (dates.length === 0) dates.push(baseDateStr);
    } else if (repeatFrequency === "monthly") {
      dates.push(baseDateStr);
      for (let i = 1; i <= repeatForWeeks; i++)
        dates.push(format(addMonths(baseDate, i), "yyyy-MM-dd"));
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
          const w = clientWorkouts.find((cw) => cw.id === selectedWorkoutId);
          title = w?.label || "Workout";
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
          user_id: clientId, 
          target_client_id: clientId,
          title, event_date: dateStr, event_type: type,
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

  const toCalendarEvent = (item: any): CalendarEvent => ({
    id: item.id,
    title: item.title,
    description: item.description || null,
    event_type: item.event_type,
    event_date: item.event_date,
    event_time: item.event_time || null,
    end_time: item.end_time || null,
    color: item.color || null,
    is_completed: item.is_completed,
    completed_at: item.completed_at || null,
    notes: item.notes || null,
    target_client_id: item.target_client_id || clientId,
    linked_workout_id: item.linked_workout_id || null,
    linked_cardio_id: item.linked_cardio_id || null,
    linked_checkin_id: item.linked_checkin_id || null,
    is_recurring: item.is_recurring || false,
    recurrence_pattern: item.recurrence_pattern || null,
    user_id: item.user_id || clientId,
  });

  const handleEventClick = (item: any) => {
    setSelectedEvent(toCalendarEvent(item));
    setShowEventDetail(true);
  };

  const handleEventComplete = async (ev: CalendarEvent) => {
    const { error } = await supabase.from("calendar_events")
      .update({ is_completed: true, completed_at: new Date().toISOString() })
      .eq("id", ev.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Marked complete" });
      setShowEventDetail(false);
      loadMonth();
    }
  };

  const handleEventDelete = async (ev: CalendarEvent) => {
    // Workout sessions merged into the calendar can't be deleted from here
    if ((ev as any).isSession) {
      toast({ title: "Cannot delete workout sessions from calendar", variant: "destructive" });
      return;
    }
    const { error, count } = await supabase.from("calendar_events").delete({ count: "exact" }).eq("id", ev.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else if (count === 0) {
      toast({ title: "Could not delete", description: "Event may have already been removed.", variant: "destructive" });
    } else {
      toast({ title: "Event deleted" });
      setShowEventDetail(false);
      loadMonth();
    }
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
            <CardTitle className="text-xs md:text-sm uppercase tracking-wider text-muted-foreground">
              Completed in {format(currentMonth, "MMMM")}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-2">
            {Object.entries(COMPLETED_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${EVENT_DOT[key]}`} />
                  <span className="text-xs md:text-sm md:font-medium text-muted-foreground">{label}</span>
                </div>
                <span className="text-xs md:text-sm font-semibold">{completedCounts[key] || 0}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-3">
            <CardTitle className="text-xs md:text-sm uppercase tracking-wider text-muted-foreground">Legend</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-1.5">
            {EVENT_TYPES.map(t => (
              <div key={t.value} className="flex items-center gap-2">
                <div className={`h-2.5 w-2.5 rounded-full ${t.color}`} />
                <span className="text-[10px] md:text-xs md:font-medium text-muted-foreground">{t.label}</span>
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
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5 text-destructive hover:text-destructive" onClick={openClearDialog}>
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => handleDayClick(new Date())}>
              <Plus className="h-3.5 w-3.5" /> Schedule
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-px">
          {weekDays.map(d => (
            <div key={d} className="text-center text-xs md:text-sm font-medium md:font-semibold text-muted-foreground py-1.5 md:py-2">{d}</div>
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
                className={`min-h-[90px] md:min-h-[130px] p-1 bg-card cursor-pointer transition-colors hover:bg-muted/30 ${!inMonth ? "opacity-40" : ""} ${today ? "ring-1 ring-inset ring-primary/50 md:border-l-2 md:border-l-primary" : ""}`}>
                <div className={`text-xs md:text-sm font-medium md:font-semibold mb-0.5 w-5 h-5 md:w-6 md:h-6 flex items-center justify-center rounded-full ${today ? "bg-primary text-primary-foreground" : ""}`}>
                  {format(day, "d")}
                </div>
                <div className="space-y-0.5">
                  {dayItems.slice(0, 3).map((item: any, i: number) => {
                    const effectiveType = resolveEventType(item);
                    const isBodyStats = effectiveType === "body_stats";
                    const dotColor = EVENT_DOT[effectiveType] || EVENT_DOT[item.event_type] || "bg-primary";

                    // Build display label for body stats
                    let displayLabel = item.title;
                    let trendArrow: React.ReactNode = null;
                    if (isBodyStats) {
                      const wEntry = weightMap.get(item.event_date);
                      if (wEntry) {
                        displayLabel = `${Math.round(wEntry.weight * 10) / 10} lbs`;
                        // Find previous weight entry
                        const sortedDates = Array.from(weightMap.keys()).sort();
                        const idx = sortedDates.indexOf(item.event_date);
                        if (idx > 0) {
                          const prevWeight = weightMap.get(sortedDates[idx - 1])!.weight;
                          if (wEntry.weight < prevWeight) {
                            trendArrow = <TrendingDown className="h-2.5 w-2.5 md:h-3 md:w-3 text-green-400 shrink-0" />;
                          } else if (wEntry.weight > prevWeight) {
                            trendArrow = <TrendingUp className="h-2.5 w-2.5 md:h-3 md:w-3 text-red-400 shrink-0" />;
                          }
                        }
                      } else {
                        displayLabel = "Body Stats";
                      }
                    }

                    return (
                    <button key={item.id + i} draggable={!item.isSession}
                      onDragStart={e => handleDragStart(e, item)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isBodyStats) {
                          setWeightHistoryOpen(true);
                        } else {
                          handleEventClick(item);
                        }
                      }}
                      className="w-full flex items-center gap-1 cursor-pointer hover:bg-muted/40 rounded px-0.5 text-left">
                      {item.is_completed ? (
                        <div className={`h-2.5 w-2.5 md:h-3 md:w-3 rounded-full flex items-center justify-center shrink-0 ${dotColor}`}>
                          <Check className="h-1.5 w-1.5 md:h-2 md:w-2 text-white" />
                        </div>
                      ) : (
                        <div className={`h-2.5 w-2.5 md:h-3 md:w-3 rounded-full shrink-0 ${dotColor} opacity-40`} />
                      )}
                      <span className="text-[9px] md:text-xs md:font-medium truncate leading-tight">{displayLabel}</span>
                      {trendArrow}
                    </button>
                    );
                  })}
                  {dayItems.length > 3 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setExpandedDay(day); }}
                      className="w-full text-left text-[9px] md:text-xs text-primary font-medium md:font-semibold pl-3 hover:underline"
                    >
                      +{dayItems.length - 3} more
                    </button>
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
                <div className="flex items-baseline justify-between">
                  <Label>Link to Workout</Label>
                  {activePhaseLabel && (
                    <span className="text-[10px] text-muted-foreground">
                      from <span className="text-primary font-medium">{activePhaseLabel}</span>
                    </span>
                  )}
                </div>
                <Select value={selectedWorkoutId} onValueChange={setSelectedWorkoutId}>
                  <SelectTrigger><SelectValue placeholder="Select workout" /></SelectTrigger>
                  <SelectContent>
                    {clientWorkouts.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.label}</SelectItem>
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

      {/* Event Detail Modal */}
      <EventDetailModal
        event={selectedEvent}
        open={showEventDetail}
        onClose={() => setShowEventDetail(false)}
        onComplete={handleEventComplete}
        onDelete={handleEventDelete}
        isCoach={true}
        clientId={clientId}
      />

      {/* Expanded Day Dialog */}
      <Dialog open={!!expandedDay} onOpenChange={(open) => !open && setExpandedDay(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {expandedDay ? format(expandedDay, "EEEE, MMMM d") : "Events"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 pt-1">
            {expandedDay && getEventsForDay(expandedDay).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No events</p>
            ) : (
              expandedDay && getEventsForDay(expandedDay).map((item: any) => {
                const effectiveType = resolveEventType(item);
                const isBodyStats = effectiveType === "body_stats";
                const dotColor = EVENT_DOT[effectiveType] || EVENT_DOT[item.event_type] || "bg-primary";
                let expandedLabel = item.title;
                let expandedArrow: React.ReactNode = null;
                if (isBodyStats) {
                  const wEntry = weightMap.get(item.event_date);
                  if (wEntry) {
                    expandedLabel = `Body Stats — ${Math.round(wEntry.weight * 10) / 10} lbs`;
                    const sortedDates = Array.from(weightMap.keys()).sort();
                    const idx = sortedDates.indexOf(item.event_date);
                    if (idx > 0) {
                      const prevWeight = weightMap.get(sortedDates[idx - 1])!.weight;
                      if (wEntry.weight < prevWeight) expandedArrow = <TrendingDown className="h-3.5 w-3.5 text-green-400 shrink-0" />;
                      else if (wEntry.weight > prevWeight) expandedArrow = <TrendingUp className="h-3.5 w-3.5 text-red-400 shrink-0" />;
                    }
                  }
                }
                return (
                <button
                  key={item.id}
                  onClick={() => {
                    setExpandedDay(null);
                    if (isBodyStats) {
                      setWeightHistoryOpen(true);
                    } else {
                      handleEventClick(item);
                    }
                  }}
                  className="w-full text-left text-sm px-3 py-2.5 rounded-lg border border-border flex items-center gap-2 transition-colors hover:bg-secondary/50"
                >
                  {item.is_completed ? (
                    <div className={`h-3 w-3 rounded-full flex items-center justify-center shrink-0 ${dotColor}`}>
                      <Check className="h-2 w-2 text-white" />
                    </div>
                  ) : (
                    <div className={`h-3 w-3 rounded-full shrink-0 ${dotColor} opacity-40`} />
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="font-medium truncate block">{expandedLabel}</span>
                    {item.event_time && (
                      <span className="text-xs text-muted-foreground">{item.event_time.slice(0, 5)}</span>
                    )}
                  </div>
                  {expandedArrow}
                </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Clear Calendar Dialog */}
      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              Clear Calendar
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Date Range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Start Date</Label>
                <Input type="date" value={clearStartDate} onChange={e => setClearStartDate(e.target.value)} className="h-9" />
              </div>
              <div>
                <Label className="text-xs">End Date</Label>
                <Input type="date" value={clearEndDate} onChange={e => setClearEndDate(e.target.value)} className="h-9" />
              </div>
            </div>

            {/* Status Filter */}
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={clearStatus} onValueChange={(v: "all" | "scheduled" | "completed") => setClearStatus(v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All items</SelectItem>
                  <SelectItem value="scheduled">Scheduled only</SelectItem>
                  <SelectItem value="completed">Completed only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Event Type Checkboxes */}
            <div>
              <Label className="text-xs mb-2 block">Event Types to Clear</Label>
              <div className="grid grid-cols-2 gap-2">
                {EVENT_TYPES.map(t => (
                  <label key={t.value} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${clearTypes.includes(t.value) ? "border-destructive bg-destructive/5" : "border-border hover:bg-muted/30"}`}>
                    <Checkbox checked={clearTypes.includes(t.value)} onCheckedChange={() => toggleClearType(t.value)} />
                    <t.icon className="h-3.5 w-3.5" />
                    <span className="text-xs">{t.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Select All / Deselect All */}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setClearTypes(EVENT_TYPES.map(t => t.value))}>
                Select All
              </Button>
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setClearTypes([])}>
                Deselect All
              </Button>
            </div>

            {/* Clear Button */}
            <Button
              variant="destructive"
              className="w-full"
              disabled={clearing || clearTypes.length === 0 || !clearStartDate || !clearEndDate}
              onClick={() => setShowClearConfirm(true)}
            >
              {clearing ? "Clearing..." : `CLEAR ${clearTypes.length} type${clearTypes.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Clear Confirmation */}
      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {clearStatus === "all" ? "" : clearStatus + " "} 
              {clearTypes.map(t => EVENT_TYPES.find(e => e.value === t)?.label).filter(Boolean).join(", ")} events 
              from {clearStartDate} to {clearEndDate}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearCalendar} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {clearing ? "Clearing..." : "Yes, Clear Events"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Weight History Modal */}
      <WeightHistoryScreen
        open={weightHistoryOpen}
        onClose={() => setWeightHistoryOpen(false)}
        clientId={clientId}
        readOnly={false}
      />
    </div>
  );
};

export default CalendarTab;
