import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface WorkoutExerciseForm {
  exerciseId: string;
  exerciseName: string;
  sets: number;
  reps: string;
  tempo: string;
  restSeconds: number;
  rir?: number;
  notes: string;
}

interface WorkoutBuilderProps {
  onSave?: (workoutId: string) => void;
}

const WorkoutBuilder = ({ onSave }: WorkoutBuilderProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [workoutName, setWorkoutName] = useState("");
  const [workoutDescription, setWorkoutDescription] = useState("");
  const [phase, setPhase] = useState("");
  const [exercises, setExercises] = useState<WorkoutExerciseForm[]>([]);
  const [exerciseList, setExerciseList] = useState<any[]>([]);
  const [searchExercise, setSearchExercise] = useState("");

  const loadExercises = async () => {
    const { data } = await supabase.from("exercises").select("id, name, category").limit(50);
    setExerciseList(data || []);
  };

  const addExercise = (exercise: any) => {
    setExercises([
      ...exercises,
      {
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        sets: 3,
        reps: "8-10",
        tempo: "3-1-1",
        restSeconds: 90,
        notes: "",
      },
    ]);
    setSearchExercise("");
  };

  const removeExercise = (index: number) => {
    setExercises(exercises.filter((_, i) => i !== index));
  };

  const saveWorkout = async () => {
    if (!user || !workoutName || exercises.length === 0) {
      toast({
        title: "Validation Error",
        description: "Workout name and at least one exercise required",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: workout, error: workoutError } = await supabase
        .from("workouts")
        .insert({
          coach_id: user.id,
          name: workoutName,
          description: workoutDescription,
          phase,
          is_template: true,
        })
        .select()
        .single();

      if (workoutError) throw workoutError;

      const workoutExercisesData = exercises.map((ex, idx) => ({
        workout_id: workout.id,
        exercise_id: ex.exerciseId,
        exercise_order: idx,
        sets: ex.sets,
        reps: ex.reps,
        tempo: ex.tempo,
        rest_seconds: ex.restSeconds,
        rir: ex.rir || null,
        notes: ex.notes,
      }));

      const { error: exError } = await supabase.from("workout_exercises").insert(workoutExercisesData);
      if (exError) throw exError;

      toast({ title: "Workout saved successfully" });
      setWorkoutName("");
      setWorkoutDescription("");
      setPhase("");
      setExercises([]);
      onSave?.(workout.id);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Workout Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Workout Name</Label>
            <Input
              id="name"
              value={workoutName}
              onChange={(e) => setWorkoutName(e.target.value)}
              placeholder="Push Day A"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={workoutDescription}
              onChange={(e) => setWorkoutDescription(e.target.value)}
              placeholder="Optional notes about this workout"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phase">Phase</Label>
            <Input
              id="phase"
              value={phase}
              onChange={(e) => setPhase(e.target.value)}
              placeholder="Strength, Hypertrophy, Endurance, etc."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add Exercises</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="search">Search Exercises</Label>
            <Input
              id="search"
              value={searchExercise}
              onChange={(e) => setSearchExercise(e.target.value)}
              onFocus={loadExercises}
              placeholder="Type to search exercises..."
            />
          </div>

          {searchExercise && (
            <div className="border rounded-lg max-h-40 overflow-y-auto space-y-1">
              {exerciseList
                .filter((ex) => ex.name.toLowerCase().includes(searchExercise.toLowerCase()))
                .slice(0, 10)
                .map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => addExercise(ex)}
                    className="w-full text-left px-3 py-2 hover:bg-secondary rounded text-sm"
                  >
                    {ex.name}
                  </button>
                ))}
            </div>
          )}

          <div className="space-y-3">
            {exercises.map((ex, idx) => (
              <div key={idx} className="border rounded-lg p-4 space-y-3 bg-card/50">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">{ex.exerciseName}</h4>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeExercise(idx)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Sets</Label>
                    <Input
                      type="number"
                      value={ex.sets}
                      onChange={(e) => {
                        const newEx = [...exercises];
                        newEx[idx].sets = parseInt(e.target.value) || 0;
                        setExercises(newEx);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Reps</Label>
                    <Input
                      value={ex.reps}
                      onChange={(e) => {
                        const newEx = [...exercises];
                        newEx[idx].reps = e.target.value;
                        setExercises(newEx);
                      }}
                      placeholder="8-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Tempo</Label>
                    <Input
                      value={ex.tempo}
                      onChange={(e) => {
                        const newEx = [...exercises];
                        newEx[idx].tempo = e.target.value;
                        setExercises(newEx);
                      }}
                      placeholder="3-1-1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Rest (sec)</Label>
                    <Input
                      type="number"
                      value={ex.restSeconds}
                      onChange={(e) => {
                        const newEx = [...exercises];
                        newEx[idx].restSeconds = parseInt(e.target.value) || 0;
                        setExercises(newEx);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">RIR</Label>
                    <Input
                      type="number"
                      value={ex.rir || ""}
                      onChange={(e) => {
                        const newEx = [...exercises];
                        newEx[idx].rir = e.target.value ? parseInt(e.target.value) : undefined;
                        setExercises(newEx);
                      }}
                      placeholder="2"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Notes</Label>
                  <Textarea
                    value={ex.notes}
                    onChange={(e) => {
                      const newEx = [...exercises];
                      newEx[idx].notes = e.target.value;
                      setExercises(newEx);
                    }}
                    placeholder="Form cues, substitutions, etc."
                    className="text-xs"
                  />
                </div>
              </div>
            ))}
          </div>

          <Button onClick={saveWorkout} disabled={loading || !workoutName || exercises.length === 0}>
            {loading && <Loader2 className="animate-spin" />}
            Save Workout Template
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default WorkoutBuilder;
