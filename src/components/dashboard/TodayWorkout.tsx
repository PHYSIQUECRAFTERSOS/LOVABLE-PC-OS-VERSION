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
}

const TodayWorkout = () => {
  const { user } = useAuth();

  const { data: workout, loading } = useDataFetch<TodayWorkoutData | null>({
    queryKey: `today-workout-${user?.id}-${format(new Date(), "yyyy-MM-dd")}`,
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    timeout: 5000,
    fallback: null,
    queryFn: async (signal) => {
      if (!user) return null;
      const today = format(new Date(), "yyyy-MM-dd");

      const { data: sessions } = await supabase
        .from("workout_sessions")
        .select("id, workout_id, completed_at, workouts:workout_id(id, name, phase)")
        .eq("client_id", user.id)
        .gte("created_at", today)
        .lte("created_at", `${today}T23:59:59`)
        .limit(1);

      const session = sessions?.[0];

      if (!session) return null;

      const workoutId = (session.workouts as any)?.id || session.workout_id;
      const { data: exercises } = await supabase
        .from("workout_exercises")
        .select("sets, reps, exercises:exercise_id(name)")
        .eq("workout_id", workoutId)
        .order("exercise_order", { ascending: true })
        .abortSignal(signal);

      return {
        id: workoutId,
        name: (session.workouts as any)?.name || "Workout",
        phase: (session.workouts as any)?.phase,
        completed: !!session.completed_at,
        exercises: (exercises || []).map((e: any) => ({ name: e.exercises?.name || "", sets: e.sets, reps: e.reps })),
      };
    },
  });

  if (loading) return <CardSkeleton lines={4} />;

  if (!workout) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Dumbbell className="h-5 w-5" /> Today's Workout</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">No workout scheduled today</p></CardContent>
      </Card>
    );
  }

  return (
    <Card className={workout.completed ? "border-primary/30" : ""}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2"><Dumbbell className="h-5 w-5" /> {workout.name}</span>
          {workout.completed && <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">✓ Done</span>}
        </CardTitle>
        {workout.phase && <p className="text-xs text-muted-foreground mt-1 capitalize">{workout.phase} Phase</p>}
      </CardHeader>
      <CardContent className="space-y-3">
        {workout.exercises.map((ex, i) => (
          <div key={i} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0">
            <div className="font-medium text-foreground">{ex.name}</div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{ex.sets} sets</span>
              {ex.reps && <span>{ex.reps} reps</span>}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default TodayWorkout;
