import { useState, useEffect } from "react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { CalendarEvent } from "./CalendarGrid";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Clock, Repeat, Trash2, Play, Dumbbell, X, Flame, Timer, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

const TYPE_LABELS: Record<string, string> = {
  workout: "Workout", cardio: "Cardio", checkin: "Check-in", rest: "Rest Day",
  reminder: "Reminder", custom: "Event", auto_message: "Auto Message",
  photos: "Photos", body_stats: "Body Stats", steps: "Steps", nutrition: "Nutrition",
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
  overall_rpe: number | null;
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
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
};

const getRPELabel = (rpe: number): string => {
  if (rpe <= 5) return "easy";
  if (rpe <= 6) return "moderate";
  if (rpe <= 7) return "challenging";
  if (rpe <= 8) return "hard";
  if (rpe <= 9) return "very hard";
  return "max effort";
};

const EventDetailModal = ({
  event, open, onClose, onComplete, onDelete, isCoach, onStartWorkout, clientId,
}: EventDetailModalProps) => {
  const navigate = useNavigate();
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExercise[]>([]);
  const [loadingExercises, setLoadingExercises] = useState(false);
  const [sessionData, setSessionData] = useState<SessionSummary | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !event) {
      setWorkoutExercises([]);
      setSessionData(null);
      setEstimatedMinutes(null);
      return;
    }

    if (event.event_type !== "workout" || !event.linked_workout_id) return;

    const loadExercises = async () => {
      setLoadingExercises(true);
      try {
        const { data } = await supabase
          .from("workout_exercises")
          .select("sets, reps, rest_seconds, exercises(name)")
          .eq("workout_id", event.linked_workout_id!)
          .order("exercise_order");

        const exercises = (data || []).map((we: any) => ({
          name: we.exercises?.name || "Unknown",
          sets: we.sets,
          reps: we.reps,
          rest_seconds: we.rest_seconds,
        }));
        setWorkoutExercises(exercises);

        // Estimate duration: ~2 min per set + rest time
        const totalSets = exercises.reduce((sum: number, ex: WorkoutExercise) => sum + (ex.sets || 0), 0);
        const totalRest = exercises.reduce((sum: number, ex: WorkoutExercise) => sum + ((ex.rest_seconds || 0) * Math.max(0, (ex.sets || 1) - 1)), 0);
        const est = Math.round((totalSets * 90 + totalRest) / 60);
        setEstimatedMinutes(est > 0 ? est : null);
      } catch (err) {
        console.error("Failed to load workout exercises:", err);
      }
      setLoadingExercises(false);
    };

    const loadSession = async () => {
      setLoadingSession(true);
      try {
        let query = supabase
          .from("workout_sessions")
          .select("id, duration_seconds, sets_completed, total_volume, completed_at, status, session_date")
          .eq("workout_id", event.linked_workout_id!)
          .eq("status", "completed")
          .order("completed_at", { ascending: false })
          .limit(10);
        if (clientId) query = query.eq("client_id", clientId);
        const { data: sessions } = await query;

        if (!sessions || sessions.length === 0) {
          setLoadingSession(false);
          return;
        }

        const session = sessions.find(s => s.session_date === event.event_date)
          || sessions.find(s => s.completed_at?.startsWith(event.event_date))
          || sessions[0];

        const { data: logs } = await supabase
          .from("exercise_logs")
          .select("exercise_id, set_number, weight, reps, rir, rpe, exercises(name)")
          .eq("session_id", session.id)
          .order("set_number");

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
          overall_rpe: null,
          logs: Array.from(exerciseMap.values()),
        });
      } catch (err) {
        console.error("Failed to load session data:", err);
      }
      setLoadingSession(false);
    };

    loadExercises();
    loadSession();
  }, [open, event, clientId]);

  if (!event) return null;

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
  const isWorkout = event.event_type === "workout" && event.linked_workout_id;
  const hasSession = !!sessionData && sessionData.logs.length > 0;

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

  // Build exercise display: merge prescribed exercises with session logs
  const exerciseDisplay = hasSession
    ? sessionData!.logs.map(log => ({
        name: log.exercise_name,
        exercise_id: log.exercise_id,
        prescribed: workoutExercises.find(we => we.name.toLowerCase() === log.exercise_name.toLowerCase()),
        loggedSets: log.sets,
      }))
    : workoutExercises.map((we, i) => ({
        name: we.name,
        exercise_id: `prescribed-${i}`,
        prescribed: we,
        loggedSets: [] as SessionLog["sets"],
      }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto p-0 gap-0">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border px-5 pt-5 pb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-muted-foreground">
              {format(new Date(event.event_date), "d MMM yyyy")}
            </span>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-secondary transition-colors">
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>

          {/* Title row with status */}
          <div className="flex items-start gap-3">
            {event.is_completed ? (
              <div className="mt-0.5 h-8 w-8 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                <Check className="h-5 w-5 text-white" />
              </div>
            ) : (
              <div className="mt-0.5 h-8 w-8 rounded-full border-2 border-border flex items-center justify-center shrink-0">
                <Dumbbell className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-foreground leading-tight">{event.title}</h2>
              <p className="text-sm text-muted-foreground">
                {event.is_completed ? "Completed" : "Scheduled"}
              </p>
            </div>
          </div>

          {/* Badges */}
          <div className="flex items-center gap-2 flex-wrap mt-3">
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

          {/* Workout meta line */}
          {isWorkout && (
            <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Dumbbell className="h-3 w-3" /> Regular workout
              </span>
              {hasSession && sessionData?.duration_seconds ? (
                <span className="flex items-center gap-1">
                  <Timer className="h-3 w-3" /> {formatDuration(sessionData.duration_seconds)}
                </span>
              ) : estimatedMinutes ? (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> est. {estimatedMinutes} minutes
                </span>
              ) : null}
              {hasSession && sessionData?.overall_rpe != null && (
                <span className="flex items-center gap-1">
                  <Flame className="h-3 w-3 text-orange-400" />
                  RPE {sessionData.overall_rpe}/10 ({getRPELabel(sessionData.overall_rpe)})
                </span>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Date & time */}
          {(event.event_time || !isWorkout) && (
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
          )}

          {event.description && (
            <p className="text-sm text-foreground/80">{event.description}</p>
          )}

          {/* Session summary stats */}
          {hasSession && (
            <div className="grid grid-cols-3 gap-2">
              {sessionData!.duration_seconds != null && (
                <div className="bg-secondary/50 rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Duration</p>
                  <p className="text-sm font-bold tabular-nums">{formatDuration(sessionData!.duration_seconds)}</p>
                </div>
              )}
              {sessionData!.sets_completed != null && (
                <div className="bg-secondary/50 rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Sets</p>
                  <p className="text-sm font-bold tabular-nums">{sessionData!.sets_completed}</p>
                </div>
              )}
              {sessionData!.total_volume != null && (
                <div className="bg-secondary/50 rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Volume</p>
                  <p className="text-sm font-bold tabular-nums">{sessionData!.total_volume.toLocaleString()} lbs</p>
                </div>
              )}
            </div>
          )}

          {/* Exercise list — Trainerize style */}
          {isWorkout && (loadingExercises || loadingSession) && (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-12 w-full rounded-lg" />
                  <Skeleton className="h-6 w-3/4 rounded ml-4" />
                  <Skeleton className="h-6 w-2/3 rounded ml-4" />
                </div>
              ))}
            </div>
          )}

          {isWorkout && !loadingExercises && !loadingSession && exerciseDisplay.length > 0 && (
            <div className="space-y-1">
              {exerciseDisplay.map((ex) => (
                <div key={ex.exercise_id} className="border-t border-border first:border-t-0">
                  {/* Exercise header row — Trainerize style */}
                  <div className="flex items-center gap-3 py-3">
                    <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                      <Dumbbell className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{ex.name}</p>
                    </div>
                    {ex.prescribed && (
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">
                          {ex.prescribed.sets} sets × {ex.prescribed.reps} reps
                        </p>
                      </div>
                    )}
                    {ex.prescribed && ex.prescribed.rest_seconds > 0 && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Flame className="h-3 w-3 text-orange-400" />
                        <span className="text-xs text-muted-foreground">
                          Rest {ex.prescribed.rest_seconds >= 60
                            ? `${Math.floor(ex.prescribed.rest_seconds / 60)} min`
                            : `${ex.prescribed.rest_seconds}s`} between sets
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Logged sets — shown inline like Trainerize */}
                  {ex.loggedSets.length > 0 && (
                    <div className="pl-[52px] pb-3 space-y-1.5">
                      {ex.loggedSets.map((s) => (
                        <div key={s.set_number} className="flex items-center gap-4">
                          <span className="text-xs font-medium text-muted-foreground w-10">Set {s.set_number}</span>
                          <span className="text-sm font-medium tabular-nums text-foreground">
                            {s.reps ?? "—"} × {s.weight === 0 ? "BW" : s.weight != null ? `${s.weight} lbs` : "—"}
                          </span>
                          {s.rpe != null && (
                            <span className="text-xs text-muted-foreground ml-auto">RPE {s.rpe}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* If no logged sets and workout is not completed, show "—" */}
                  {ex.loggedSets.length === 0 && !event.is_completed && (
                    <div className="pl-[52px] pb-3">
                      <p className="text-xs text-muted-foreground italic">Not yet completed</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Empty state for non-workout events or workouts without linked_workout_id */}
          {isWorkout && !loadingExercises && !loadingSession && exerciseDisplay.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No exercise data available</p>
          )}

          {event.notes && (
            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Notes</p>
              <p className="text-sm">{event.notes}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-2 pt-2 pb-2">
            {!event.is_completed && hasActionRoute && (
              <Button onClick={handleOpenAction} className="w-full gap-2" size="lg">
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
      </DialogContent>
    </Dialog>
  );
};

export default EventDetailModal;