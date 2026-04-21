import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchWorkoutExerciseDetails } from "@/lib/workoutExerciseQueries";
import { useToast } from "@/hooks/use-toast";
import { invalidateCache } from "@/hooks/useDataFetch";
import WorkoutLogger from "@/components/WorkoutLogger";

interface WorkoutData {
  id: string;
  name: string;
  instructions: string | null;
  exercises: any[];
  resumeSessionId: string | null;
  calendarEventId: string | null;
}

/**
 * Hook to launch the WorkoutLogger as a fullscreen overlay from any page
 * (dashboard, calendar, etc.) without navigating to the Training tab.
 */
export function useWorkoutLauncher() {
  const { toast } = useToast();
  const [workout, setWorkout] = useState<WorkoutData | null>(null);
  const [loading, setLoading] = useState(false);

  const launch = useCallback(async (
    workoutId: string,
    calendarEventId?: string,
    resumeSessionId?: string,
  ) => {
    if (loading) return;
    setLoading(true);
    try {
      const [exerciseDetails, workoutRes] = await Promise.all([
        fetchWorkoutExerciseDetails(workoutId),
        supabase
          .from("workouts")
          .select("name, instructions")
          .eq("id", workoutId)
          .maybeSingle(),
      ]);

      if (workoutRes.error) throw workoutRes.error;

      const exerciseLogs = exerciseDetails.map((we) => {
        const equipment = we.exercise?.equipment || null;
        const isBodyweight = !!equipment && ["bodyweight", "none", "body weight"].includes(equipment.toLowerCase());
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

      setWorkout({
        id: workoutId,
        name: workoutRes.data?.name || "Workout",
        instructions: workoutRes.data?.instructions || null,
        exercises: exerciseLogs,
        resumeSessionId: resumeSessionId || null,
        calendarEventId: calendarEventId || null,
      });
    } catch (err: any) {
      console.error("[useWorkoutLauncher] error:", err);
      toast({
        title: "Couldn't load workout",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [loading, toast]);

  const close = useCallback(() => {
    setWorkout(null);
    // Invalidate today-actions so completion state refreshes
    // Cache keys are invalidated by the components that own them on re-render
  }, []);

  const isActive = !!workout;

  /**
   * Render the fullscreen WorkoutLogger overlay.
   * Place this at the bottom of your component's JSX.
   */
  const WorkoutOverlay = workout ? (
    <div className="fixed inset-0 z-[55] bg-background overflow-y-auto safe-top pb-24 px-4 md:pb-6 md:px-6 md:safe-top-0">
      <WorkoutLogger
        workoutId={workout.id}
        workoutName={workout.name}
        workoutInstructions={workout.instructions}
        exercises={workout.exercises}
        resumeSessionId={workout.resumeSessionId}
        calendarEventId={workout.calendarEventId}
        onComplete={close}
      />
    </div>
  ) : null;

  return { launch, close, loading, isActive, WorkoutOverlay };
}
