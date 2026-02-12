import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dumbbell, Clock } from "lucide-react";
import { format } from "date-fns";

interface TodayWorkoutData {
  id: string;
  name: string;
  exercises: { name: string; sets: number; reps?: string }[];
  phase?: string;
}

const TodayWorkout = () => {
  const { user } = useAuth();
  const [workout, setWorkout] = useState<TodayWorkoutData | null>(null);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data: sessions } = await supabase
        .from("workout_sessions")
        .select("id, workout_id, completed_at, workouts:workout_id(id, name, phase)")
        .eq("client_id", user.id)
        .gte("created_at", today)
        .lte("created_at", `${today}T23:59:59`)
        .single();

      if (sessions) {
        setCompleted(!!sessions.completed_at);
        const workoutId = (sessions.workouts as any)?.id || sessions.workout_id;

        const { data: exercises } = await supabase
          .from("workout_exercises")
          .select("exercise_id, sets, reps, exercises:exercise_id(name)")
          .eq("workout_id", workoutId)
          .order("exercise_order", { ascending: true });

        setWorkout({
          id: workoutId,
          name: (sessions.workouts as any)?.name || "Workout",
          phase: (sessions.workouts as any)?.phase,
          exercises: (exercises || []).map((e: any) => ({
            name: e.exercises?.name || "",
            sets: e.sets,
            reps: e.reps,
          })),
        });
      }
    };
    fetch();
  }, [user]);

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
    <Card className={completed ? "border-primary/30" : ""}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Dumbbell className="h-5 w-5" /> {workout.name}
          </span>
          {completed && <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">✓ Done</span>}
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
