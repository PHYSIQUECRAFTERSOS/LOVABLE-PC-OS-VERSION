import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dumbbell } from "lucide-react";
import { format } from "date-fns";
import { useDataFetch } from "@/hooks/useDataFetch";
import { CardSkeleton } from "@/components/ui/data-skeleton";

interface TodayWorkoutData {
  id: string;
  name: string;
  exercises: { name: string; sets: number; reps?: string }[];
  phase?: string;
  completed: boolean;
  source: "session" | "calendar";
}

const TodayWorkout = () => {
  const { user } = useAuth();
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: workout, loading } = useDataFetch<TodayWorkoutData | null>({
    queryKey: `today-workout-${user?.id}-${today}`,
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    timeout: 5000,
    fallback: null,
    queryFn: async (signal) => {
      if (!user) return null;

      // Calendar is the source of truth — check calendar first, then sessions
      const [calendarRes, sessionsRes] = await Promise.all([
        supabase
          .from("calendar_events")
          .select("id, title, linked_workout_id, is_completed, completed_at")
          .or(`user_id.eq.${user.id},target_client_id.eq.${user.id}`)
          .eq("event_date", today)
          .eq("event_type", "workout")
          .order("event_time", { ascending: true })
          .limit(3)
          .abortSignal(signal),
        supabase
          .from("workout_sessions")
          .select("id, workout_id, completed_at")
          .eq("client_id", user.id)
          .gte("session_date", today)
          .lte("session_date", today)
          .limit(5)
          .abortSignal(signal),
      ]);

      // Priority 1: Scheduled calendar event for today (calendar is source of truth)
      const calEvent = calendarRes.data?.[0];
      if (calEvent) {
        let exercises: { name: string; sets: number; reps?: string }[] = [];
        let workoutName = calEvent.title;
        let phase: string | undefined;
        let completed = calEvent.is_completed;

        if (calEvent.linked_workout_id) {
          // Check if a session exists for this workout (for completion status)
          const matchingSession = sessionsRes.data?.find(
            (s: any) => s.workout_id === calEvent.linked_workout_id
          );
          if (matchingSession?.completed_at) completed = true;

          const [workoutRes, exRes] = await Promise.all([
            supabase
              .from("workouts")
              .select("id, name, phase")
              .eq("id", calEvent.linked_workout_id)
              .single(),
            supabase
              .from("workout_exercises")
              .select("sets, reps, exercises:exercise_id(name)")
              .eq("workout_id", calEvent.linked_workout_id)
              .order("exercise_order", { ascending: true })
              .abortSignal(signal),
          ]);

          if (workoutRes.data) {
            workoutName = workoutRes.data.name || calEvent.title;
            phase = workoutRes.data.phase;
          }
          exercises = (exRes.data || []).map((e: any) => ({
            name: e.exercises?.name || "",
            sets: e.sets,
            reps: e.reps,
          }));
        }

        return {
          id: calEvent.linked_workout_id || calEvent.id,
          name: workoutName,
          phase,
          completed,
          source: "calendar" as const,
          exercises,
        };
      }

      // Priority 2: Scheduled calendar event for today
      const calEvent = calendarRes.data?.[0];
      if (calEvent) {
        let exercises: { name: string; sets: number; reps?: string }[] = [];
        let workoutName = calEvent.title;
        let phase: string | undefined;

        // If linked to a workout, pull the real name & exercises
        if (calEvent.linked_workout_id) {
          const [workoutRes, exRes] = await Promise.all([
            supabase
              .from("workouts")
              .select("id, name, phase")
              .eq("id", calEvent.linked_workout_id)
              .single(),
            supabase
              .from("workout_exercises")
              .select("sets, reps, exercises:exercise_id(name)")
              .eq("workout_id", calEvent.linked_workout_id)
              .order("exercise_order", { ascending: true })
              .abortSignal(signal),
          ]);

          if (workoutRes.data) {
            workoutName = workoutRes.data.name || calEvent.title;
            phase = workoutRes.data.phase;
          }
          exercises = (exRes.data || []).map((e: any) => ({
            name: e.exercises?.name || "",
            sets: e.sets,
            reps: e.reps,
          }));
        }

        return {
          id: calEvent.linked_workout_id || calEvent.id,
          name: workoutName,
          phase,
          completed: calEvent.is_completed,
          source: "calendar" as const,
          exercises,
        };
      }

      return null;
    },
  });

  if (loading) return <CardSkeleton lines={4} />;

  if (!workout) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Dumbbell className="h-5 w-5" /> Today's Workout
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No workout scheduled today</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={workout.completed ? "border-primary/30" : ""}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Dumbbell className="h-5 w-5" /> {workout.name}
          </span>
          {workout.completed && (
            <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">✓ Done</span>
          )}
        </CardTitle>
        {workout.phase && (
          <p className="text-xs text-muted-foreground mt-1 capitalize">{workout.phase} Phase</p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {workout.exercises.length > 0 ? (
          workout.exercises.map((ex, i) => (
            <div key={i} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0">
              <div className="font-medium text-foreground">{ex.name}</div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{ex.sets} sets</span>
                {ex.reps && <span>{ex.reps} reps</span>}
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Tap to start your workout</p>
        )}
      </CardContent>
    </Card>
  );
};

export default TodayWorkout;
