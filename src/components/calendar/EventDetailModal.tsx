import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { CalendarEvent } from "./CalendarGrid";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Clock, Repeat, Trash2, Play, Dumbbell, X, Flame, Timer, UtensilsCrossed, MoreVertical } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import WorkoutProgressSheet from "./WorkoutProgressSheet";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { formatWeightForCoach, formatWeightForClient } from "@/utils/weightDisplay";
import { Skeleton } from "@/components/ui/skeleton";
import { formatServingDisplay } from "@/utils/formatServingDisplay";
import NutritionGoalComparison, { getComplianceDot } from "./NutritionGoalComparison";
import BodyStatsEventPanel from "./BodyStatsEventPanel";
import PhotosEventPanel from "./PhotosEventPanel";
import CoachEventNote from "./CoachEventNote";

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
  body_stats: "bg-orange-500/20 text-orange-400", nutrition: "bg-red-500/20 text-red-400",
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
  thumbnail?: string | null;
}

interface SessionLog {
  exercise_name: string;
  exercise_id: string;
  thumbnail?: string | null;
  sets: {
    set_number: number;
    weight: number | null;
    reps: number | null;
    rpe: number | null;
    rir: number | null;
    weight_unit: string;
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

const extractYouTubeId = (url?: string | null): string | null => {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
};

const resolveExerciseThumbnail = (ex: { youtube_thumbnail?: string | null; youtube_url?: string | null; video_url?: string | null } | null | undefined): string | null => {
  if (!ex) return null;
  if (ex.youtube_thumbnail) return ex.youtube_thumbnail;
  const id = extractYouTubeId(ex.youtube_url) || extractYouTubeId(ex.video_url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
};

const SetRow = ({ weight, reps, unit }: { weight: number | null; reps: number | null; unit: string }) => {
  const isBodyweight = weight == null || weight === 0;
  const weightPart = isBodyweight ? "BW" : `${weight} ${unit || "lbs"}`;
  const repsPart = reps == null || reps === 0 ? "--" : `${reps} reps`;
  return (
    <span className="text-sm font-medium tabular-nums text-foreground">
      {weightPart} × {repsPart}
    </span>
  );
};

const EventDetailModal = ({
  event, open, onClose, onComplete, onDelete, isCoach, onStartWorkout, clientId,
}: EventDetailModalProps) => {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExercise[]>([]);
  const [loadingExercises, setLoadingExercises] = useState(false);
  const [sessionData, setSessionData] = useState<SessionSummary | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(null);
  const [nutritionFoods, setNutritionFoods] = useState<any[]>([]);
  const [loadingNutrition, setLoadingNutrition] = useState(false);
  const [showProgress, setShowProgress] = useState(false);

  useEffect(() => {
    if (!open || !event) {
      setWorkoutExercises([]);
      setSessionData(null);
      setEstimatedMinutes(null);
      setNutritionFoods([]);
      return;
    }

    // Load nutrition foods for nutrition events
    if (event.event_type === "nutrition" && event.id.startsWith("nut-")) {
      const dateStr = event.event_date;
      const loadFoods = async () => {
        setLoadingNutrition(true);
        try {
          const uid = clientId || (await supabase.auth.getUser()).data.user?.id;
          if (!uid) return;
          const { data } = await supabase
            .from("nutrition_logs")
            .select("id, meal_type, calories, protein, carbs, fat, custom_name, food_item_id, quantity_display, quantity_unit, servings, food_items(name, brand, serving_size, serving_unit, serving_label)")
            .eq("client_id", uid)
            .eq("logged_at", dateStr)
            .order("meal_type")
            .order("created_at");
          setNutritionFoods(data || []);
        } catch (err) {
          console.error("Failed to load nutrition foods:", err);
        }
        setLoadingNutrition(false);
      };
      loadFoods();
      return;
    }
    if (event.event_type !== "workout" || !event.linked_workout_id) return;

    const loadExercises = async () => {
      setLoadingExercises(true);
      try {
        const { data } = await supabase
          .from("workout_exercises")
          .select("sets, reps, rest_seconds, exercises(name, youtube_url, video_url, youtube_thumbnail)")
          .eq("workout_id", event.linked_workout_id!)
          .order("exercise_order");

        const exercises = (data || []).map((we: any) => ({
          name: we.exercises?.name || "Unknown",
          sets: we.sets,
          reps: we.reps,
          rest_seconds: we.rest_seconds,
          thumbnail: resolveExerciseThumbnail(we.exercises),
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
      // Only load session data for completed events — scheduled/future events show template only
      if (!event.is_completed) {
        setLoadingSession(false);
        return;
      }
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

        // Match session to THIS event's date only — never fall back to unrelated sessions
        const session = sessions.find(s => s.session_date === event.event_date)
          || sessions.find(s => s.completed_at?.startsWith(event.event_date));

        if (!session) {
          setLoadingSession(false);
          return;
        }

        const { data: logs } = await supabase
          .from("exercise_logs")
          .select("exercise_id, set_number, weight, reps, rir, rpe, weight_unit, exercises(name, youtube_url, video_url, youtube_thumbnail)")
          .eq("session_id", session.id)
          .order("set_number");

        const exerciseMap = new Map<string, SessionLog>();
        (logs || []).forEach((log: any) => {
          const exId = log.exercise_id;
          if (!exerciseMap.has(exId)) {
            exerciseMap.set(exId, {
              exercise_id: exId,
              exercise_name: log.exercises?.name || "Unknown",
              thumbnail: resolveExerciseThumbnail(log.exercises),
              sets: [],
            });
          }
          exerciseMap.get(exId)!.sets.push({
            set_number: log.set_number,
            weight: log.weight,
            reps: log.reps,
            rpe: log.rpe ?? null,
            rir: log.rir,
            weight_unit: log.weight_unit || 'lbs',
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

  const isNutritionEvent = event?.event_type === "nutrition";
  const nutritionDate = useMemo(
    () => (event ? new Date(event.event_date + "T12:00:00") : new Date()),
    [event?.event_date]
  );

  const dayTotals = useMemo(() => {
    if (!isNutritionEvent || nutritionFoods.length === 0) return null;
    const t = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    nutritionFoods.forEach((f: any) => {
      t.calories += f.calories || 0;
      t.protein += f.protein || 0;
      t.carbs += f.carbs || 0;
      t.fat += f.fat || 0;
    });
    return t;
  }, [isNutritionEvent, nutritionFoods]);

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

  const exerciseDisplay = hasSession
    ? sessionData!.logs.map(log => {
        const prescribed = workoutExercises.find(we => we.name.toLowerCase() === log.exercise_name.toLowerCase());
        return {
          name: log.exercise_name,
          exercise_id: log.exercise_id,
          prescribed,
          loggedSets: log.sets,
          thumbnail: log.thumbnail || prescribed?.thumbnail || null,
        };
      })
    : workoutExercises.map((we, i) => ({
        name: we.name,
        exercise_id: `prescribed-${i}`,
        prescribed: we,
        loggedSets: [] as SessionLog["sets"],
        thumbnail: we.thumbnail || null,
      }));

  const resolvedClientId = clientId || event.target_client_id || event.user_id;

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn(
        "max-h-[90vh] overflow-y-auto p-0 gap-0",
        isNutritionEvent ? "sm:max-w-3xl" : "sm:max-w-lg"
      )}>
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border px-5 pt-5 pb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-muted-foreground">
              {format(new Date(event.event_date), "d MMM yyyy")}
            </span>
            <div className="flex items-center gap-1">
              {/* Three-dot menu for completed workouts */}
              {isWorkout && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-1 rounded-lg hover:bg-secondary transition-colors">
                      <MoreVertical className="h-5 w-5 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[180px]">
                    <DropdownMenuItem onClick={() => { setShowProgress(true); onClose(); }} className="gap-2 cursor-pointer">
                      {/* Inline bar chart + arrow SVG icon */}
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
                        <rect x="1" y="10" width="3" height="5" rx="0.5" fill="hsl(var(--primary))" opacity="0.5" />
                        <rect x="5.5" y="7" width="3" height="8" rx="0.5" fill="hsl(var(--primary))" opacity="0.7" />
                        <rect x="10" y="4" width="3" height="11" rx="0.5" fill="hsl(var(--primary))" />
                        <path d="M3 8L7 4.5L11 2L13.5 1" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M11.5 1H13.5V3" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="text-sm">Workout Progress</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <button onClick={onClose} className="p-1 rounded-lg hover:bg-secondary transition-colors">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Title row with status */}
          <div className="flex items-start gap-3">
            {event.event_type === "nutrition" ? (
              <div className="mt-0.5 h-8 w-8 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                <UtensilsCrossed className="h-5 w-5 text-red-400" />
              </div>
            ) : event.is_completed ? (
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
                          {(() => {
                            if (isCoach) {
                              const wd = formatWeightForCoach(s.weight, s.weight_unit || 'lbs');
                              return (
                                <span className="text-sm font-medium tabular-nums text-foreground">
                                  {s.reps ?? "—"} × {wd.primary}
                                  {wd.secondary && (
                                    <span className="block text-[10px] text-muted-foreground ml-0">{wd.secondary}</span>
                                  )}
                                </span>
                              );
                            }
                            return (
                              <span className="text-sm font-medium tabular-nums text-foreground">
                                {s.reps ?? "—"} × {formatWeightForClient(s.weight, s.weight_unit || 'lbs')}
                              </span>
                            );
                          })()}
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

          {/* Nutrition: split layout — food list left, goal comparison right */}
          {event.event_type === "nutrition" && (
            <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-4">
              {/* Left: food list */}
              <div className="space-y-4 min-w-0">
                {loadingNutrition && (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-14 w-full rounded-lg" />
                    ))}
                  </div>
                )}

                {!loadingNutrition && nutritionFoods.length > 0 && (() => {
                  // Normalize legacy meal_type keys (breakfast/pre-workout/...) to canonical meal-1..meal-6
                  const LEGACY_TO_NEW: Record<string, string> = {
                    breakfast: "meal-1", "pre-workout": "meal-2", "post-workout": "meal-3",
                    lunch: "meal-4", dinner: "meal-5", snack: "meal-6",
                  };
                  const normalizeKey = (raw: string): string => {
                    if (!raw) return "Other";
                    if (/^meal-[1-6]$/.test(raw)) return raw;
                    if (LEGACY_TO_NEW[raw]) return LEGACY_TO_NEW[raw];
                    const m = raw.match(/meal\s*[-_:]?\s*([1-6])/i);
                    if (m) return `meal-${m[1]}`;
                    return raw;
                  };
                  const mealGroups: Record<string, any[]> = {};
                  nutritionFoods.forEach((f: any) => {
                    const slot = normalizeKey(f.meal_type || "Other");
                    if (!mealGroups[slot]) mealGroups[slot] = [];
                    mealGroups[slot].push(f);
                  });

                  const MEAL_ORDER = ["meal-1", "meal-2", "meal-3", "meal-4", "meal-5", "meal-6"];
                  const MEAL_LABELS: Record<string, string> = {
                    "meal-1": "Meal 1", "meal-2": "Meal 2", "meal-3": "Meal 3",
                    "meal-4": "Meal 4", "meal-5": "Meal 5", "meal-6": "Meal 6",
                  };
                  const sortedMeals = Object.entries(mealGroups).sort(([a], [b]) => {
                    const ai = MEAL_ORDER.indexOf(a);
                    const bi = MEAL_ORDER.indexOf(b);
                    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
                  });

                  return (
                    <>
                      {/* Day totals banner with compliance dots */}
                      {dayTotals && (
                        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                          <div className="grid grid-cols-4 gap-2 text-center">
                            {[
                              { label: "Calories", value: dayTotals.calories, unit: "", key: "calories" },
                              { label: "Protein", value: dayTotals.protein, unit: "g", key: "protein" },
                              { label: "Carbs", value: dayTotals.carbs, unit: "g", key: "carbs" },
                              { label: "Fat", value: dayTotals.fat, unit: "g", key: "fat" },
                            ].map(m => {
                              // Show compliance dot if we have targets
                              const dot = dayTotals ? (() => {
                                // We'll need the targets from the NutritionGoalComparison — for now show inline
                                return null;
                              })() : null;
                              return (
                                <div key={m.label}>
                                  <p className="text-[10px] text-primary/70 uppercase tracking-wider font-medium">{m.label}</p>
                                  <p className="text-base font-bold text-primary tabular-nums">{Math.round(m.value)}{m.unit}</p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {sortedMeals.map(([mealType, foods]) => {
                        const mealCals = foods.reduce((s: number, f: any) => s + (f.calories || 0), 0);
                        const mealP = foods.reduce((s: number, f: any) => s + (f.protein || 0), 0);
                        const mealC = foods.reduce((s: number, f: any) => s + (f.carbs || 0), 0);
                        const mealF = foods.reduce((s: number, f: any) => s + (f.fat || 0), 0);
                        return (
                          <div key={mealType} className="rounded-lg border border-border overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-2.5 border-l-[3px] border-l-primary bg-primary/5">
                              <h4 className="text-sm font-bold text-primary uppercase tracking-wide">
                                {MEAL_LABELS[mealType] || mealType}
                              </h4>
                              <span className="text-xs font-semibold text-primary tabular-nums">
                                {Math.round(mealCals)} cal
                              </span>
                            </div>
                            <div className="px-3 py-1.5 bg-secondary/30 border-b border-border">
                              <p className="text-[11px] text-primary/60 font-medium tabular-nums">
                                P {Math.round(mealP)}g · C {Math.round(mealC)}g · F {Math.round(mealF)}g
                              </p>
                            </div>
                            <div className="divide-y divide-border/40">
                              {foods.map((food: any) => {
                                const name = food.custom_name || (food.food_items as any)?.name || "Unknown food";
                                const brand = (food.food_items as any)?.brand || null;
                                const fi = (food.food_items as any);
                                const si = fi ? { serving_size: fi.serving_size, serving_unit: fi.serving_unit, serving_label: fi.serving_label } : null;
                                const qty = formatServingDisplay(si, food.quantity_display, food.quantity_unit, food.servings || 1);
                                return (
                                  <div key={food.id} className="px-3 py-2.5">
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate">{name}</p>
                                        {(brand || qty) && (
                                          <p className="text-xs text-muted-foreground mt-0.5">
                                            {brand}{brand && qty ? " · " : ""}{qty}
                                          </p>
                                        )}
                                      </div>
                                      <span className="text-xs font-semibold text-foreground tabular-nums shrink-0 ml-2">
                                        {Math.round(food.calories)} cal
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                                      P {Math.round(food.protein)}g · C {Math.round(food.carbs)}g · F {Math.round(food.fat)}g
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
              </div>

              {/* Right: Goal comparison panel */}
              {resolvedClientId && (
                <div className="border-t md:border-t-0 md:border-l border-border pt-4 md:pt-0 md:pl-4">
                  <NutritionGoalComparison
                    clientId={resolvedClientId}
                    date={nutritionDate}
                    logged={dayTotals}
                    isCoach={isCoach}
                  />
                </div>
              )}
            </div>
          )}

          {/* Body Stats data panel */}
          {(effectiveType === "body_stats") && resolvedClientId && (
            <BodyStatsEventPanel clientId={resolvedClientId} eventDate={event.event_date} />
          )}

          {/* Photos data panel */}
          {(effectiveType === "photos") && resolvedClientId && (
            <PhotosEventPanel clientId={resolvedClientId} eventDate={event.event_date} />
          )}

          {/* Completed timestamp */}
          {event.is_completed && event.completed_at && (
            <p className="text-xs text-muted-foreground">
              Marked complete {format(new Date(event.completed_at), "MMM d, yyyy 'at' h:mm a")}
            </p>
          )}

          {event.notes && (
            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Notes</p>
              <p className="text-sm">{event.notes}</p>
            </div>
          )}

          {/* Coach-only note */}
          {isCoach && user?.id && (effectiveType === "body_stats" || effectiveType === "photos") && !event.id.startsWith("nut-") && (
            <CoachEventNote eventId={event.id} coachId={user.id} />
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

    {/* Workout Progress Sheet */}
    {isWorkout && event.linked_workout_id && resolvedClientId && (
      <WorkoutProgressSheet
        open={showProgress}
        onClose={() => setShowProgress(false)}
        workoutId={event.linked_workout_id}
        workoutName={event.title}
        clientId={resolvedClientId}
      />
    )}
    </>
  );
};

export default EventDetailModal;