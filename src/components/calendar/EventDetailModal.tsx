import { useState, useEffect } from "react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { CalendarEvent } from "./CalendarGrid";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Clock, Repeat, Trash2, Play, Dumbbell, Trophy, TrendingUp, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

const TYPE_LABELS: Record<string, string> = {
  workout: "Workout", cardio: "Cardio", checkin: "Check-in", rest: "Rest Day",
  reminder: "Reminder", custom: "Event", auto_message: "Auto Message",
  photos: "Photos", body_stats: "Body Stats", steps: "Steps",
};

const TYPE_BADGE_COLORS: Record<string, string> = {
  workout: "bg-amber-500/20 text-amber-400", cardio: "bg-green-500/20 text-green-400",
  checkin: "bg-purple-500/20 text-purple-400", rest: "bg-muted text-muted-foreground",
  reminder: "bg-yellow-500/20 text-yellow-400", custom: "bg-primary/20 text-primary",
  auto_message: "bg-orange-500/20 text-orange-400", photos: "bg-purple-500/20 text-purple-400",
  body_stats: "bg-orange-500/20 text-orange-400",
};

const EVENT_ROUTES: Record<string, string> = {
  cardio: "/training", checkin: "/progress?tab=checkin",
  steps: "/progress?tab=steps", nutrition: "/nutrition",
};

interface WorkoutExercise {
  name: string;
  sets: number;
  reps: string;
  rest_seconds: number;
}

interface SessionLog {
  exercise_name: string;
  exercise_id: string;
  sets: {
    set_number: number;
    weight: number | null;
    reps: number | null;
    rpe: number | null;
    rir: number | null;
  }[];
}

interface SessionSummary {
  id: string;
  duration_seconds: number | null;
  sets_completed: number | null;
  total_volume: number | null;
  completed_at: string | null;
  logs: SessionLog[];
}

interface EventDetailModalProps {
  event: CalendarEvent | null;
  open: boolean;
  onClose: () => void;
  onComplete: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
  isCoach: boolean;
  onStartWorkout?: (workoutId: string) => void;
  clientId?: string;
}

const formatDuration = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const EventDetailModal = ({
  event, open, onClose, onComplete, onDelete, isCoach, onStartWorkout,
}: EventDetailModalProps) => {
  const navigate = useNavigate();
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExercise[]>([]);
  const [loadingExercises, setLoadingExercises] = useState(false);
  const [sessionData, setSessionData] = useState<SessionSummary | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [expandedExercises, setExpandedExercises] = useState<Set<string>>(new Set());

  // Load exercises when opening a workout event
  useEffect(() => {
    if (!open || !event || event.event_type !== "workout" || !event.linked_workout_id) {
      setWorkoutExercises([]);
      setSessionData(null);
      return;
    }

    const load = async () => {
      setLoadingExercises(true);
      const { data } = await supabase
        .from("workout_exercises")
        .select("sets, reps, rest_seconds, exercises(name)")
        .eq("workout_id", event.linked_workout_id!)
        .order("exercise_order");
      setWorkoutExercises(
        (data || []).map((we: any) => ({
          name: we.exercises?.name || "Unknown",
          sets: we.sets,
          reps: we.reps,
          rest_seconds: we.rest_seconds,
        }))
      );
      setLoadingExercises(false);
    };

    load();

    // If completed, also load session details
    if (event.is_completed && event.linked_workout_id) {
      loadSessionData(event.linked_workout_id, event.event_date);
    }
  }, [open, event]);

  const loadSessionData = async (workoutId: string, eventDate: string) => {
    setLoadingSession(true);
    try {
      // Find the session for this workout on this date
      const { data: sessions } = await supabase
        .from("workout_sessions")
        .select("id, duration_seconds, sets_completed, total_volume, completed_at, status")
        .eq("workout_id", workoutId)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(5);

      if (!sessions || sessions.length === 0) {
        setLoadingSession(false);
        return;
      }

      // Find best match by date
      const session = sessions.find(s => s.completed_at?.startsWith(eventDate)) || sessions[0];

      // Load exercise logs for this session
      const { data: logs } = await supabase
        .from("exercise_logs")
        .select("exercise_id, set_number, weight, reps, rir, rpe, exercises(name)")
        .eq("session_id", session.id)
        .order("set_number");

      // Group logs by exercise
      const exerciseMap = new Map<string, SessionLog>();
      (logs || []).forEach((log: any) => {
        const exId = log.exercise_id;
        if (!exerciseMap.has(exId)) {
          exerciseMap.set(exId, {
            exercise_id: exId,
            exercise_name: log.exercises?.name || "Unknown",
            sets: [],
          });
        }
        exerciseMap.get(exId)!.sets.push({
          set_number: log.set_number,
          weight: log.weight,
          reps: log.reps,
          rpe: log.rpe ?? null,
          rir: log.rir,
        });
      });

      setSessionData({
        id: session.id,
        duration_seconds: session.duration_seconds,
        sets_completed: session.sets_completed,
        total_volume: session.total_volume,
        completed_at: session.completed_at,
        logs: Array.from(exerciseMap.values()),
      });

      // Auto-expand all exercises
      setExpandedExercises(new Set(Array.from(exerciseMap.keys())));
    } catch (err) {
      console.error("Failed to load session data:", err);
    }
    setLoadingSession(false);
  };

  const toggleExercise = (exId: string) => {
    setExpandedExercises(prev => {
      const next = new Set(prev);
      if (next.has(exId)) next.delete(exId);
      else next.add(exId);
      return next;
    });
  };

  if (!event) return null;

  // Resolve effective type from event_type + title keywords
  const resolveEventType = (ev: CalendarEvent): string => {
    const t = ev.event_type;
    if (t === "body_stats" || t === "photos") return t;
    const titleLower = ev.title.toLowerCase();
    if (titleLower.includes("body stat") || titleLower.includes("bodystats")) return "body_stats";
    if (titleLower.includes("photo") || titleLower.includes("progress pic")) return "photos";
    if (titleLower.includes("check-in") || titleLower.includes("checkin")) return "checkin";
    return t;
  };

  const effectiveType = resolveEventType(event);

  const handleOpenAction = () => {
    onClose();
    if (event.event_type === "workout") {
      if (event.linked_workout_id && onStartWorkout) {
        onStartWorkout(event.linked_workout_id);
      } else {
        navigate("/training");
      }
    } else if (effectiveType === "body_stats") {
      navigate(`/body-stats?eventId=${event.id}`);
    } else if (effectiveType === "photos") {
      navigate(`/progress?tab=photos&eventId=${event.id}`);
    } else {
      const route = EVENT_ROUTES[event.event_type];
      if (route) navigate(route);
    }
  };

  const hasActionRoute = event.event_type === "workout" || effectiveType === "body_stats" || effectiveType === "photos" || !!EVENT_ROUTES[event.event_type];

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="text-left pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={cn("text-xs", TYPE_BADGE_COLORS[event.event_type] || TYPE_BADGE_COLORS.custom)}>
              {TYPE_LABELS[event.event_type] || event.event_type}
            </Badge>
            {event.is_recurring && (
              <Badge variant="outline" className="text-xs gap-1">
                <Repeat className="h-3 w-3" /> {event.recurrence_pattern}
              </Badge>
            )}
            {event.is_completed && (
              <Badge className="bg-green-500/20 text-green-400 text-xs gap-1">
                <Check className="h-3 w-3" /> Done
              </Badge>
            )}
          </div>
          <SheetTitle className="text-xl">{event.title}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>{format(new Date(event.event_date), "EEEE, MMMM d, yyyy")}</span>
            {event.event_time && (
              <span className="text-foreground font-medium">
                {event.event_time.slice(0, 5)}
                {event.end_time && ` — ${event.end_time.slice(0, 5)}`}
              </span>
            )}
          </div>

          {event.description && (
            <p className="text-sm text-foreground/80">{event.description}</p>
          )}

          {/* Completed workout session details */}
          {event.is_completed && event.event_type === "workout" && sessionData && (
            <div className="space-y-3">
              {/* Session stats */}
              <div className="grid grid-cols-3 gap-2">
                {sessionData.duration_seconds != null && (
                  <div className="bg-secondary/50 rounded-lg p-2.5 text-center">
                    <p className="text-xs text-muted-foreground">Duration</p>
                    <p className="text-sm font-bold tabular-nums">{formatDuration(sessionData.duration_seconds)}</p>
                  </div>
                )}
                {sessionData.sets_completed != null && (
                  <div className="bg-secondary/50 rounded-lg p-2.5 text-center">
                    <p className="text-xs text-muted-foreground">Sets</p>
                    <p className="text-sm font-bold tabular-nums">{sessionData.sets_completed}</p>
                  </div>
                )}
                {sessionData.total_volume != null && (
                  <div className="bg-secondary/50 rounded-lg p-2.5 text-center">
                    <p className="text-xs text-muted-foreground">Volume</p>
                    <p className="text-sm font-bold tabular-nums">{sessionData.total_volume.toLocaleString()} lbs</p>
                  </div>
                )}
              </div>

              {/* Exercise logs */}
              <div className="space-y-2">
                {sessionData.logs.map((ex) => {
                  const isExpanded = expandedExercises.has(ex.exercise_id);
                  const bestSet = ex.sets.reduce((best, s) =>
                    (s.weight ?? 0) * (s.reps ?? 0) > (best.weight ?? 0) * (best.reps ?? 0) ? s : best
                  , ex.sets[0]);

                  return (
                    <div key={ex.exercise_id} className="rounded-lg border border-border overflow-hidden">
                      <button
                        onClick={() => toggleExercise(ex.exercise_id)}
                        className="w-full flex items-center gap-3 p-3 bg-secondary/30 hover:bg-secondary/50 transition-colors"
                      >
                        <Dumbbell className="h-4 w-4 text-primary shrink-0" />
                        <div className="flex-1 text-left min-w-0">
                          <p className="text-sm font-medium truncate">{ex.exercise_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {ex.sets.length} sets · Best: {bestSet.weight ?? 0} lbs × {bestSet.reps ?? 0}
                          </p>
                        </div>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </button>

                      {isExpanded && (
                        <div className="px-3 pb-2 pt-1 space-y-1">
                          {/* Set header */}
                          <div className="grid grid-cols-[2rem_1fr_1fr_1fr] gap-2 px-1">
                            <span className="text-[10px] font-medium text-muted-foreground uppercase">Set</span>
                            <span className="text-[10px] font-medium text-muted-foreground uppercase">lbs</span>
                            <span className="text-[10px] font-medium text-muted-foreground uppercase">Reps</span>
                            <span className="text-[10px] font-medium text-muted-foreground uppercase">RPE</span>
                          </div>
                          {ex.sets.map((s) => (
                            <div key={s.set_number} className="grid grid-cols-[2rem_1fr_1fr_1fr] gap-2 items-center p-1.5 rounded bg-card/50">
                              <span className="text-xs font-medium text-center text-muted-foreground">{s.set_number}</span>
                              <span className="text-sm font-medium tabular-nums">{s.weight === 0 ? "BW" : s.weight ?? "—"}</span>
                              <span className="text-sm font-medium tabular-nums">{s.reps ?? "—"}</span>
                              <span className="text-sm tabular-nums text-muted-foreground">
                                {s.rpe != null ? `@${s.rpe}` : s.rir != null ? `RIR ${s.rir}` : "—"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {loadingSession && (
                <div className="space-y-2">
                  {[1,2].map(i => (
                    <div key={i} className="h-16 bg-secondary/50 rounded-lg animate-pulse" />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Workout exercises preview (not completed) */}
          {event.event_type === "workout" && event.linked_workout_id && !event.is_completed && (
            <div className="space-y-1.5">
              {loadingExercises ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => (
                    <div key={i} className="h-10 bg-secondary/50 rounded animate-pulse" />
                  ))}
                </div>
              ) : workoutExercises.length > 0 ? (
                workoutExercises.map((ex, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/40 border border-border">
                    <Dumbbell className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{ex.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {ex.sets}s × {ex.reps}
                        {ex.rest_seconds > 0 && ` · Rest: ${ex.rest_seconds}s`}
                      </p>
                    </div>
                  </div>
                ))
              ) : null}
            </div>
          )}

          {event.notes && (
            <div className="bg-secondary/50 rounded-md p-3">
              <p className="text-xs text-muted-foreground mb-1">Notes</p>
              <p className="text-sm">{event.notes}</p>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            {/* Primary action */}
            {!event.is_completed && hasActionRoute && (
              <Button onClick={handleOpenAction} className="w-full gap-2 bg-primary hover:bg-primary/90" size="lg">
                <Play className="h-4 w-4" />
                {event.event_type === "workout" ? "Start Workout"
                  : effectiveType === "body_stats" ? "Log Body Stats"
                  : effectiveType === "photos" ? "Upload Photos"
                  : `Open ${TYPE_LABELS[event.event_type] || "Event"}`}
              </Button>
            )}
            {!event.is_completed && event.event_type !== "rest" && (
              <Button variant="outline" onClick={() => onComplete(event)} className="w-full gap-2">
                <Check className="h-4 w-4" />
                {hasActionRoute ? "Done" : "Mark Complete"}
              </Button>
            )}
            {isCoach && (
              <Button variant="destructive" onClick={() => onDelete(event)} className="w-full gap-2">
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default EventDetailModal;
