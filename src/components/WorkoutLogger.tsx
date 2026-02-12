import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Play, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface ExerciseLogForm {
  id: string;
  name: string;
  sets: number;
  reps: string;
  tempo: string;
  restSeconds: number;
  rir?: number;
  notes: string;
  logs: {
    setNumber: number;
    weight?: number;
    reps?: number;
    tempo?: string;
    rir?: number;
    notes?: string;
  }[];
}

interface WorkoutLoggerProps {
  workoutId: string;
  workoutName: string;
  exercises: ExerciseLogForm[];
  onComplete?: () => void;
}

const WorkoutLogger = ({ workoutId, workoutName, exercises: initialExercises, onComplete }: WorkoutLoggerProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [currentExerciseIdx, setCurrentExerciseIdx] = useState(0);
  const [exercises, setExercises] = useState(initialExercises);
  const [showRestTimer, setShowRestTimer] = useState(false);

  const currentExercise = exercises[currentExerciseIdx];

  const updateLog = (setIdx: number, field: string, value: any) => {
    const newEx = [...exercises];
    newEx[currentExerciseIdx].logs[setIdx] = {
      ...newEx[currentExerciseIdx].logs[setIdx],
      [field]: value,
    };
    setExercises(newEx);
  };

  const completeWorkout = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const { data: session, error: sessionError } = await supabase
        .from("workout_sessions")
        .insert({
          client_id: user.id,
          workout_id: workoutId,
          completed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      const logsToInsert = exercises.flatMap((ex, exIdx) =>
        ex.logs.map((log) => ({
          session_id: session.id,
          exercise_id: ex.id,
          set_number: log.setNumber,
          weight: log.weight || null,
          reps: log.reps || null,
          tempo: log.tempo || null,
          rir: log.rir || null,
          notes: log.notes || null,
        }))
      );

      const { error: logsError } = await supabase.from("exercise_logs").insert(logsToInsert);
      if (logsError) throw logsError;

      toast({ title: "Workout logged successfully!" });
      onComplete?.();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold">{workoutName}</h2>
          <p className="text-sm text-muted-foreground">
            Exercise {currentExerciseIdx + 1} of {exercises.length}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{currentExercise.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentExercise.notes && (
            <div className="p-3 rounded bg-secondary/50 text-sm text-muted-foreground">
              <strong>Notes:</strong> {currentExercise.notes}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Sets:</span> {currentExercise.sets}
            </div>
            <div>
              <span className="text-muted-foreground">Reps:</span> {currentExercise.reps}
            </div>
            <div>
              <span className="text-muted-foreground">Tempo:</span> {currentExercise.tempo}
            </div>
            <div>
              <span className="text-muted-foreground">Rest:</span> {currentExercise.restSeconds}s
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t">
            {currentExercise.logs.map((log, setIdx) => (
              <div key={setIdx} className="border rounded-lg p-3 space-y-2 bg-card/50">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm">Set {log.setNumber}</h4>
                  {log.reps && log.weight && <Check className="h-4 w-4 text-primary" />}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Weight (lbs)</Label>
                    <Input
                      type="number"
                      value={log.weight || ""}
                      onChange={(e) => updateLog(setIdx, "weight", e.target.value ? parseFloat(e.target.value) : null)}
                      placeholder="0"
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Reps</Label>
                    <Input
                      type="number"
                      value={log.reps || ""}
                      onChange={(e) => updateLog(setIdx, "reps", e.target.value ? parseInt(e.target.value) : null)}
                      placeholder="0"
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tempo</Label>
                    <Input
                      value={log.tempo || ""}
                      onChange={(e) => updateLog(setIdx, "tempo", e.target.value)}
                      placeholder="3-1-1"
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">RIR</Label>
                    <Input
                      type="number"
                      value={log.rir || ""}
                      onChange={(e) => updateLog(setIdx, "rir", e.target.value ? parseInt(e.target.value) : null)}
                      placeholder="2"
                      className="text-sm"
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowRestTimer(!showRestTimer)}
                  className="w-full"
                >
                  <Play className="h-3 w-3 mr-1" />
                  Start Rest Timer ({currentExercise.restSeconds}s)
                </Button>
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setCurrentExerciseIdx(Math.max(0, currentExerciseIdx - 1))}
              disabled={currentExerciseIdx === 0}
            >
              Previous
            </Button>
            {currentExerciseIdx < exercises.length - 1 ? (
              <Button onClick={() => setCurrentExerciseIdx(currentExerciseIdx + 1)} className="flex-1">
                Next Exercise
              </Button>
            ) : (
              <Button onClick={completeWorkout} disabled={loading} className="flex-1 bg-primary">
                {loading && <Loader2 className="animate-spin" />}
                Complete Workout
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default WorkoutLogger;
