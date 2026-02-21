import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, Plus, Trash2, Copy, GripVertical, ChevronDown, Dumbbell, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ExerciseLibrary from "@/components/training/ExerciseLibrary";

const REST_OPTIONS = [
  { label: "10 seconds", value: 10 },
  { label: "15 seconds", value: 15 },
  { label: "30 seconds", value: 30 },
  { label: "45 seconds", value: 45 },
  { label: "60 seconds", value: 60 },
  { label: "90 seconds", value: 90 },
  { label: "2 minutes", value: 120 },
  { label: "2 minutes 30 seconds", value: 150 },
  { label: "3 minutes", value: 180 },
  { label: "3 minutes 30 seconds", value: 210 },
  { label: "4 minutes", value: 240 },
  { label: "4 minutes 30 seconds", value: 270 },
  { label: "5 minutes", value: 300 },
];

const PROGRESSION_TYPES = [
  { label: "Double Progression", value: "double", desc: "Increase reps first, then weight" },
  { label: "Linear", value: "linear", desc: "Fixed weight increase each session" },
  { label: "RPE-Based", value: "rpe", desc: "Adjust based on RPE feedback" },
  { label: "Percentage", value: "percentage", desc: "Percentage-based increments" },
  { label: "Manual", value: "manual", desc: "Coach controls all changes" },
];

const PROGRESSION_MODES = [
  { label: "Conservative", value: "conservative" },
  { label: "Moderate", value: "moderate" },
  { label: "Aggressive", value: "aggressive" },
];

interface WorkoutExerciseForm {
  exerciseId: string;
  exerciseName: string;
  sets: number;
  reps: string;
  tempo: string;
  restSeconds: number;
  rir?: number;
  notes: string;
  videoOverride: string;
  youtubeUrl?: string;
  youtubeThumbnail?: string;
  progressionType: string;
  weightIncrement: number;
  incrementType: string;
  rpeThreshold: number;
  progressionMode: string;
}

interface WorkoutBuilderProps {
  onSave?: (workoutId: string) => void;
  editWorkoutId?: string;
}

const WorkoutBuilder = ({ onSave, editWorkoutId }: WorkoutBuilderProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [workoutName, setWorkoutName] = useState("");
  const [workoutDescription, setWorkoutDescription] = useState("");
  const [workoutInstructions, setWorkoutInstructions] = useState("");
  const [phase, setPhase] = useState("");
  const [exercises, setExercises] = useState<WorkoutExerciseForm[]>([]);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const addExercise = (exercise: any) => {
    setExercises([
      ...exercises,
      {
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        sets: 3,
        reps: "8–10",
        tempo: "",
        restSeconds: 90,
        notes: "",
        videoOverride: "",
        youtubeUrl: exercise.youtube_url || "",
        youtubeThumbnail: exercise.youtube_thumbnail || "",
        progressionType: "double",
        weightIncrement: 5,
        incrementType: "fixed",
        rpeThreshold: 8,
        progressionMode: "moderate",
      },
    ]);
    setShowExercisePicker(false);
  };

  const removeExercise = (index: number) => {
    setExercises(exercises.filter((_, i) => i !== index));
  };

  const duplicateExercise = (index: number) => {
    const copy = { ...exercises[index] };
    const newList = [...exercises];
    newList.splice(index + 1, 0, copy);
    setExercises(newList);
  };

  const updateExercise = (index: number, field: keyof WorkoutExerciseForm, value: any) => {
    const newEx = [...exercises];
    (newEx[index] as any)[field] = value;
    setExercises(newEx);
  };

  // Drag and drop
  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const newList = [...exercises];
    const [moved] = newList.splice(dragIdx, 1);
    newList.splice(idx, 0, moved);
    setExercises(newList);
    setDragIdx(idx);
  };
  const handleDragEnd = () => setDragIdx(null);

  const formatRestLabel = (seconds: number) => {
    const opt = REST_OPTIONS.find(o => o.value === seconds);
    return opt?.label || `${seconds}s`;
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
          description: workoutDescription || null,
          instructions: workoutInstructions || null,
          phase: phase || null,
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
        tempo: ex.tempo || null,
        rest_seconds: ex.restSeconds,
        rir: ex.rir || null,
        notes: ex.notes || null,
        video_override: ex.videoOverride || null,
        progression_type: ex.progressionType,
        weight_increment: ex.weightIncrement,
        increment_type: ex.incrementType,
        rpe_threshold: ex.rpeThreshold,
        progression_mode: ex.progressionMode,
      }));

      const { error: exError } = await supabase.from("workout_exercises").insert(workoutExercisesData);
      if (exError) throw exError;

      toast({ title: "Workout saved successfully" });
      onSave?.(workout.id);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Workout Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Workout Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Workout Name *</Label>
            <Input value={workoutName} onChange={(e) => setWorkoutName(e.target.value)} placeholder="Push Day A" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={workoutDescription} onChange={(e) => setWorkoutDescription(e.target.value)} placeholder="Optional description" rows={2} />
          </div>
          <div className="space-y-2">
            <Label>Instructions (shown to client at top of workout)</Label>
            <Textarea value={workoutInstructions} onChange={(e) => setWorkoutInstructions(e.target.value)} placeholder="Warm up with 5 minutes of light cardio..." rows={3} />
          </div>
          <div className="space-y-2">
            <Label>Phase</Label>
            <Input value={phase} onChange={(e) => setPhase(e.target.value)} placeholder="Hypertrophy, Strength, etc." />
          </div>
        </CardContent>
      </Card>

      {/* Exercises */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Exercises</CardTitle>
          <Button size="sm" onClick={() => setShowExercisePicker(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Exercise
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {exercises.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No exercises added yet. Click "Add Exercise" to begin.
            </p>
          ) : (
            exercises.map((ex, idx) => (
              <div
                key={idx}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                className={`border rounded-lg p-4 space-y-3 bg-card/50 transition-all ${
                  dragIdx === idx ? "opacity-50 border-primary" : ""
                }`}
              >
                {/* Exercise Header */}
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground/50 cursor-grab flex-shrink-0" />
                  <span className="text-xs text-muted-foreground font-mono w-5">{idx + 1}.</span>
                  {ex.youtubeThumbnail ? (
                    <img src={ex.youtubeThumbnail} alt="" className="w-10 h-7 rounded object-cover" />
                  ) : (
                    <div className="w-10 h-7 rounded bg-secondary flex items-center justify-center">
                      <Dumbbell className="h-3 w-3 text-muted-foreground" />
                    </div>
                  )}
                  <h4 className="font-medium text-sm flex-1 truncate">{ex.exerciseName}</h4>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => duplicateExercise(idx)} title="Duplicate">
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeExercise(idx)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Exercise Settings */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] text-muted-foreground uppercase">Sets</Label>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={1}
                        value={ex.sets}
                        onChange={(e) => updateExercise(idx, "sets", parseInt(e.target.value) || 1)}
                        className="h-8 text-sm w-16"
                      />
                      <span className="text-xs text-muted-foreground">sets</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] text-muted-foreground uppercase">Reps</Label>
                    <Input
                      value={ex.reps}
                      onChange={(e) => updateExercise(idx, "reps", e.target.value)}
                      placeholder="8–10"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] text-muted-foreground uppercase">Tempo</Label>
                    <Input
                      value={ex.tempo}
                      onChange={(e) => updateExercise(idx, "tempo", e.target.value)}
                      placeholder="3-1-1"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] text-muted-foreground uppercase">Rest</Label>
                    <Select
                      value={String(ex.restSeconds)}
                      onValueChange={(v) => updateExercise(idx, "restSeconds", parseInt(v))}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue>{formatRestLabel(ex.restSeconds)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {REST_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={String(opt.value)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* RIR */}
                <div className="w-24">
                  <Label className="text-[10px] text-muted-foreground uppercase">RIR</Label>
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    value={ex.rir ?? ""}
                    onChange={(e) => updateExercise(idx, "rir", e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="2"
                    className="h-8 text-sm"
                  />
                </div>

                {/* Collapsible Notes, Video & Progression */}
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1 h-6 px-2">
                      <ChevronDown className="h-3 w-3" /> Notes, Progression & Video
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-2 pt-2">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-muted-foreground uppercase">Exercise Notes</Label>
                      <Textarea
                        value={ex.notes}
                        onChange={(e) => updateExercise(idx, "notes", e.target.value)}
                        placeholder="Form cues, substitutions, special instructions..."
                        className="text-xs"
                        rows={2}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-muted-foreground uppercase">Video Override URL</Label>
                      <Input
                        value={ex.videoOverride}
                        onChange={(e) => updateExercise(idx, "videoOverride", e.target.value)}
                        placeholder="YouTube or direct video URL"
                        className="text-xs h-8"
                      />
                    </div>

                    {/* Progression Settings */}
                    <div className="border-t border-border pt-3 mt-2 space-y-3">
                      <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide">Auto Progression</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] text-muted-foreground">Progression Type</Label>
                          <Select
                            value={ex.progressionType}
                            onValueChange={(v) => updateExercise(idx, "progressionType", v)}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {PROGRESSION_TYPES.map(p => (
                                <SelectItem key={p.value} value={p.value}>
                                  <span>{p.label}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] text-muted-foreground">Mode</Label>
                          <Select
                            value={ex.progressionMode}
                            onValueChange={(v) => updateExercise(idx, "progressionMode", v)}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {PROGRESSION_MODES.map(m => (
                                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] text-muted-foreground">Increment</Label>
                          <Input
                            type="number"
                            value={ex.weightIncrement}
                            onChange={(e) => updateExercise(idx, "weightIncrement", parseFloat(e.target.value) || 5)}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] text-muted-foreground">Type</Label>
                          <Select
                            value={ex.incrementType}
                            onValueChange={(v) => updateExercise(idx, "incrementType", v)}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="fixed">Fixed (lbs)</SelectItem>
                              <SelectItem value="percentage">Percentage (%)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] text-muted-foreground">RPE Target</Label>
                          <Input
                            type="number"
                            min={5}
                            max={10}
                            value={ex.rpeThreshold}
                            onChange={(e) => updateExercise(idx, "rpeThreshold", parseFloat(e.target.value) || 8)}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Save */}
      <Button
        onClick={saveWorkout}
        disabled={loading || !workoutName || exercises.length === 0}
        className="w-full"
        size="lg"
      >
        {loading && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
        Save Workout Template
      </Button>

      {/* Exercise Picker Dialog */}
      <Dialog open={showExercisePicker} onOpenChange={setShowExercisePicker}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Exercise</DialogTitle>
          </DialogHeader>
          <ExerciseLibrary selectionMode onSelectExercise={addExercise} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WorkoutBuilder;
