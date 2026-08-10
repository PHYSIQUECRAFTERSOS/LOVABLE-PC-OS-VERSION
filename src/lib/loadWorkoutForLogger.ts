import { supabase } from "@/integrations/supabase/client";
import { fetchWorkoutExerciseDetails } from "@/lib/workoutExerciseQueries";
import { withRetry } from "@/lib/resilientFetch";

export interface LoadedWorkout {
  id: string;
  name: string;
  instructions: string | null;
  exercises: any[];
  resumeSessionId: string | null;
  calendarEventId: string | null;
}

/**
 * Single source of truth for turning a workout id into the payload the
 * WorkoutLogger expects. Network calls are retried so a suspended-webview
 * "Load failed" or a Postgres statement timeout doesn't dead-end the user.
 */
export async function loadWorkoutForLogger(
  workoutId: string,
  opts: { resumeSessionId?: string | null; calendarEventId?: string | null } = {},
): Promise<LoadedWorkout> {
  const [exSettled, workoutSettled] = await Promise.allSettled([
    withRetry(() => fetchWorkoutExerciseDetails(workoutId), { label: "workout-exercises" }),
    withRetry(
      async () => {
        const { data, error } = await supabase
          .from("workouts")
          .select("name, instructions")
          .eq("id", workoutId)
          .maybeSingle();
        if (error) throw error;
        return data;
      },
      { label: "workout-row" },
    ),
  ]);

  if (exSettled.status === "rejected") throw exSettled.reason;
  const details = exSettled.value;
  const workoutRow = workoutSettled.status === "fulfilled" ? workoutSettled.value : null;

  const exercises = details.map((we) => {
    const equipment = we.exercise?.equipment || null;
    const isBodyweight =
      !!equipment && ["bodyweight", "none", "body weight"].includes(equipment.toLowerCase());

    return {
      id: we.exercise?.id || we.exercise_id,
      name: we.exercise?.name || "Exercise",
      sets: we.sets,
      reps: we.reps,
      tempo: we.tempo,
      restSeconds: we.rest_seconds ?? 90,
      rir: we.rir,
      notes: we.notes,
      videoUrl: we.video_override || we.exercise?.youtube_url || we.exercise?.video_url || null,
      equipment,
      groupingType: we.grouping_type,
      groupingId: we.grouping_id,
      progression: {
        progressionType: we.progression_type || "double",
        weightIncrement: we.weight_increment || 5,
        incrementType: we.increment_type || "fixed",
        rpeThreshold: we.rpe_threshold || 8,
        progressionMode: we.progression_mode || "moderate",
      },
      logs: Array.from({ length: we.sets }, (_, idx) => ({
        setNumber: idx + 1,
        weight: isBodyweight ? 0 : undefined,
        reps: undefined,
        tempo: undefined,
        rir: undefined,
        notes: undefined,
      })),
    };
  });

  return {
    id: workoutId,
    name: workoutRow?.name || "Workout",
    instructions: workoutRow?.instructions || null,
    exercises,
    resumeSessionId: opts.resumeSessionId || null,
    calendarEventId: opts.calendarEventId || null,
  };
}
