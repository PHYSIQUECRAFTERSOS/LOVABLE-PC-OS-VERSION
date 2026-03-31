import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Play, Dumbbell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ExerciseDetail {
  id: string;
  name: string;
  sets: number;
  reps: string | null;
  rest_seconds: number | null;
  tempo: string | null;
  rir: number | null;
  rpe_target: number | null;
  notes: string | null;
  youtube_thumbnail: string | null;
  youtube_url: string | null;
  video_url: string | null;
  equipment: string | null;
  primary_muscle: string | null;
  grouping_type: string | null;
  grouping_id: string | null;
}

interface WorkoutPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workoutId: string | null;
  workoutName: string;
  onStartWorkout: (workoutId: string) => void;
  /** Override the bottom button label (default: "Start Workout") */
  actionLabel?: string;
  /** Override the bottom button icon (default: Play) */
  actionIcon?: React.ReactNode;
}

const WorkoutPreviewModal = ({
  open,
  onOpenChange,
  workoutId,
  workoutName,
  onStartWorkout,
  actionLabel = "Start Workout",
  actionIcon,
}: WorkoutPreviewModalProps) => {
  const [exercises, setExercises] = useState<ExerciseDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [instructions, setInstructions] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !workoutId) return;
    setLoading(true);
    const load = async () => {
      const [weRes, wRes] = await Promise.all([
        supabase
          .from("workout_exercises")
          .select(
            "id, sets, reps, rest_seconds, tempo, rir, rpe_target, notes, grouping_type, grouping_id, exercise_order, exercises(id, name, youtube_thumbnail, youtube_url, video_url, equipment, primary_muscle)"
          )
          .eq("workout_id", workoutId)
          .order("exercise_order"),
        supabase
          .from("workouts")
          .select("instructions")
          .eq("id", workoutId)
          .maybeSingle(),
      ]);

      setInstructions(wRes.data?.instructions || null);

      const mapped: ExerciseDetail[] = (weRes.data || []).map((we: any) => ({
        id: we.id,
        name: we.exercises?.name || "Exercise",
        sets: we.sets,
        reps: we.reps,
        rest_seconds: we.rest_seconds,
        tempo: we.tempo,
        rir: we.rir,
        rpe_target: we.rpe_target,
        notes: we.notes,
        youtube_thumbnail: we.exercises?.youtube_thumbnail || null,
        youtube_url: we.exercises?.youtube_url || null,
        video_url: we.exercises?.video_url || null,
        equipment: we.exercises?.equipment || null,
        primary_muscle: we.exercises?.primary_muscle || null,
        grouping_type: we.grouping_type,
        grouping_id: we.grouping_id,
      }));

      setExercises(mapped);
      setLoading(false);
    };
    load();
  }, [open, workoutId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2 border-b border-border">
          <DialogTitle className="text-lg">{workoutName}</DialogTitle>
          {exercises.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {exercises.length} exercise{exercises.length !== 1 ? "s" : ""}
            </p>
          )}
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[60vh]">
          <div className="p-4 space-y-3">
            {/* Workout instructions */}
            {instructions && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 mb-4">
                <p className="text-xs font-medium text-primary mb-1">Workout Instructions</p>
                <p className="text-xs text-muted-foreground whitespace-pre-line">{instructions}</p>
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : exercises.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No exercises in this workout yet.
              </p>
            ) : (
              exercises.map((ex, idx) => {
                const isGrouped = ex.grouping_type && ex.grouping_id;
                const isFirstInGroup =
                  isGrouped &&
                  (idx === 0 || exercises[idx - 1]?.grouping_id !== ex.grouping_id);

                return (
                  <div key={ex.id}>
                    {isFirstInGroup && (
                      <Badge
                        variant="outline"
                        className="text-[9px] mb-1.5 border-primary/30 text-primary"
                      >
                        {ex.grouping_type === "superset"
                          ? "Superset"
                          : ex.grouping_type === "circuit"
                          ? "Circuit"
                          : ex.grouping_type}
                      </Badge>
                    )}
                    <div
                      className={`flex gap-3 rounded-lg border border-border bg-card/50 p-3 ${
                        isGrouped ? "ml-2 border-l-2 border-l-primary/30" : ""
                      }`}
                    >
                      {/* Thumbnail or fallback */}
                      <div className="h-16 w-16 rounded-lg overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center">
                        {ex.youtube_thumbnail ? (
                          <img
                            src={ex.youtube_thumbnail}
                            alt={ex.name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <Dumbbell className="h-6 w-6 text-muted-foreground/50" />
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {ex.name}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <span className="text-[11px] text-muted-foreground">
                            {ex.sets} sets
                            {ex.reps ? ` × ${ex.reps}` : ""}
                          </span>
                          {ex.tempo && (
                            <span className="text-[11px] text-muted-foreground">
                              • {ex.tempo}
                            </span>
                          )}
                          {ex.rest_seconds != null && ex.rest_seconds > 0 && (
                            <span className="text-[11px] text-muted-foreground">
                              • {ex.rest_seconds}s rest
                            </span>
                          )}
                          {ex.rpe_target != null && (
                            <span className="text-[11px] text-muted-foreground">
                              • RPE {ex.rpe_target}
                            </span>
                          )}
                          {ex.rir != null && (
                            <span className="text-[11px] text-muted-foreground">
                              • {ex.rir} RIR
                            </span>
                          )}
                        </div>
                        {ex.primary_muscle && (
                          <Badge variant="secondary" className="text-[9px] h-4">
                            {ex.primary_muscle}
                          </Badge>
                        )}
                        {ex.notes && (
                          <p className="text-[11px] text-muted-foreground/80 italic line-clamp-2 mt-0.5">
                            {ex.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        {/* Start button */}
        <div className="p-4 pt-2 border-t border-border">
          <Button
            className="w-full"
            size="lg"
            onClick={() => {
              if (workoutId) {
                onOpenChange(false);
                onStartWorkout(workoutId);
              }
            }}
          >
            <Play className="h-4 w-4 mr-2" /> Start Workout
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WorkoutPreviewModal;
