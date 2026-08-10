import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { loadWorkoutForLogger } from "@/lib/loadWorkoutForLogger";
import { readWorkoutSnapshot, saveWorkoutSnapshot } from "@/lib/workoutSnapshot";
import WorkoutLogger from "@/components/WorkoutLogger";
import { Button } from "@/components/ui/button";

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
 *
 * Resume is snapshot-first: if a local copy of the workout plan exists the
 * tracker opens instantly, then the server copy revalidates in the background.
 */
export function useWorkoutLauncher() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [workout, setWorkout] = useState<WorkoutData | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<null | { workoutId: string; calendarEventId?: string; resumeSessionId?: string }>(null);

  const launch = useCallback(async (
    workoutId: string,
    calendarEventId?: string,
    resumeSessionId?: string,
  ) => {
    if (loading) return;
    setFailed(null);

    // 1. Instant open from local snapshot when available.
    const snap = readWorkoutSnapshot(user?.id, workoutId);
    const openedFromSnapshot = !!snap;
    if (snap) {
      setWorkout({
        id: snap.workoutId,
        name: snap.workoutName,
        instructions: snap.instructions,
        exercises: snap.exercises,
        resumeSessionId: resumeSessionId || snap.resumeSessionId || null,
        calendarEventId: calendarEventId || snap.calendarEventId || null,
      });
    } else {
      setLoading(true);
    }

    // 2. Always revalidate from the server (retried on transient failures).
    try {
      const loaded = await loadWorkoutForLogger(workoutId, { resumeSessionId, calendarEventId });
      saveWorkoutSnapshot(user?.id, {
        workoutId: loaded.id,
        workoutName: loaded.name,
        instructions: loaded.instructions,
        exercises: loaded.exercises,
        resumeSessionId: loaded.resumeSessionId,
        calendarEventId: loaded.calendarEventId,
      });
      // Only swap in fresh data if we hadn't already opened the tracker —
      // replacing exercises mid-session would discard in-progress input.
      if (!openedFromSnapshot) {
        setWorkout({
          id: loaded.id,
          name: loaded.name,
          instructions: loaded.instructions,
          exercises: loaded.exercises,
          resumeSessionId: loaded.resumeSessionId,
          calendarEventId: loaded.calendarEventId,
        });
      }
    } catch (err: any) {
      console.error("[useWorkoutLauncher] error:", err);
      if (!openedFromSnapshot) {
        setFailed({ workoutId, calendarEventId, resumeSessionId });
        toast({
          title: "Couldn't load workout",
          description: "Connection hiccup — tap Retry.",
          variant: "destructive",
          action: (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { void launch(workoutId, calendarEventId, resumeSessionId); }}
            >
              Retry
            </Button>
          ) as any,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [loading, toast, user?.id]);

  const retry = useCallback(() => {
    if (!failed) return;
    void launch(failed.workoutId, failed.calendarEventId, failed.resumeSessionId);
  }, [failed, launch]);

  const close = useCallback(() => {
    setWorkout(null);
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

  return { launch, close, retry, loading, isActive, failed: !!failed, WorkoutOverlay };
}
