import { useState, useEffect } from "react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { CalendarEvent } from "./CalendarGrid";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Clock, Repeat, Trash2, Play, Dumbbell } from "lucide-react";
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
  cardio: "/training", checkin: "/progress", photos: "/progress",
  body_stats: "/progress", steps: "/progress", nutrition: "/nutrition",
};

interface WorkoutExercise {
  name: string;
  sets: number;
  reps: string;
  rest_seconds: number;
}

interface EventDetailModalProps {
  event: CalendarEvent | null;
  open: boolean;
  onClose: () => void;
  onComplete: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
  isCoach: boolean;
  onStartWorkout?: (workoutId: string) => void;
}

const EventDetailModal = ({
  event, open, onClose, onComplete, onDelete, isCoach, onStartWorkout,
}: EventDetailModalProps) => {
  const navigate = useNavigate();
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExercise[]>([]);
  const [loadingExercises, setLoadingExercises] = useState(false);

  // Load exercises when opening a workout event
  useEffect(() => {
    if (!open || !event || event.event_type !== "workout" || !event.linked_workout_id) {
      setWorkoutExercises([]);
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
  }, [open, event]);

  if (!event) return null;

  const handleOpenAction = () => {
    onClose();
    if (event.event_type === "workout") {
      if (event.linked_workout_id && onStartWorkout) {
        onStartWorkout(event.linked_workout_id);
      } else {
        navigate("/training");
      }
    } else {
      const route = EVENT_ROUTES[event.event_type];
      if (route) navigate(route);
    }
  };

  const hasActionRoute = event.event_type === "workout" || !!EVENT_ROUTES[event.event_type];

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

          {/* Workout exercises preview */}
          {event.event_type === "workout" && event.linked_workout_id && (
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
                {event.event_type === "workout" ? "Start Workout" : `Open ${TYPE_LABELS[event.event_type] || "Event"}`}
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
