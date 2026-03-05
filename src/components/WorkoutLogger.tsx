import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, RotateCcw, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Trophy } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ExerciseCard from "@/components/workout/ExerciseCard";
import FloatingRestTimer from "@/components/workout/FloatingRestTimer";
import WorkoutSummary from "@/components/workout/WorkoutSummary";
import { ExerciseLibrary } from "@/components/training/ExerciseLibrary";

interface ProgressionSettings {
  progressionType: string;
  weightIncrement: number;
  incrementType: string;
  rpeThreshold: number;
  progressionMode: string;
}

interface ExerciseLogForm {
  id: string;
  name: string;
  sets: number;
  reps: string;
  tempo: string;
  restSeconds: number;
  rir?: number;
  notes: string;
  videoUrl?: string | null;
  progression?: ProgressionSettings;
  logs: {
    setNumber: number;
    weight?: number;
    reps?: number;
    tempo?: string;
    rir?: number;
    rpe?: number;
    notes?: string;
    completed?: boolean;
    isPR?: boolean;
  }[];
}

interface PersonalRecord {
  exercise_id: string;
  weight: number;
  reps: number;
}

interface PRAlert {
  exerciseName: string;
  weight: number;
  reps: number;
  type: "weight" | "rep" | "volume";
}

interface WorkoutLoggerProps {
  workoutId: string;
  workoutName: string;
  workoutInstructions?: string | null;
  exercises: ExerciseLogForm[];
  onComplete?: () => void;
}

const WorkoutLogger = ({ workoutId, workoutName, workoutInstructions, exercises: initialExercises, onComplete }: WorkoutLoggerProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [exercises, setExercises] = useState(initialExercises);
  const [personalRecords, setPersonalRecords] = useState<PersonalRecord[]>([]);
  const [prAlerts, setPrAlerts] = useState<PRAlert[]>([]);
  const [startTime] = useState(Date.now());
  const [elapsed, setElapsed] = useState("0:00");
  const [previousPerformance, setPreviousPerformance] = useState<Record<string, any[]>>({});
  const [showSummary, setShowSummary] = useState(false);
  const [isFirstSession, setIsFirstSession] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showAddExercise, setShowAddExercise] = useState(false);

  // Floating rest timer
  const [restTimer, setRestTimer] = useState<{ seconds: number } | null>(null);

  // Elapsed timer — updates every second
  useEffect(() => {
    const interval = setInterval(() => {
      const totalSec = Math.floor((Date.now() - startTime) / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      setElapsed(h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}` : `${m}:${s.toString().padStart(2, "0")}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  // Load PRs and previous performance
  useEffect(() => {
    if (!user) return;
    const loadData = async () => {
      const exerciseIds = initialExercises.map(e => e.id);
      const { data } = await supabase
        .from("personal_records")
        .select("exercise_id, weight, reps")
        .eq("client_id", user.id)
        .in("exercise_id", exerciseIds);
      setPersonalRecords((data as PersonalRecord[]) || []);

      // Check if first session
      const { count } = await supabase
        .from("workout_sessions")
        .select("id", { count: "exact", head: true })
        .eq("client_id", user.id)
        .eq("status", "completed");
      setIsFirstSession((count || 0) === 0);

      const { data: lastSession } = await supabase
        .from("workout_sessions")
        .select("id")
        .eq("client_id", user.id)
        .eq("workout_id", workoutId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastSession) {
        const { data: logs } = await supabase
          .from("exercise_logs")
          .select("exercise_id, set_number, weight, reps, rir")
          .eq("session_id", lastSession.id)
          .order("set_number");

        if (logs) {
          const grouped: Record<string, any[]> = {};
          logs.forEach(l => {
            if (!grouped[l.exercise_id]) grouped[l.exercise_id] = [];
            grouped[l.exercise_id].push(l);
          });
          setPreviousPerformance(grouped);
        }
      }
    };
    loadData();
  }, [user, initialExercises, workoutId]);

  const totalSets = exercises.reduce((acc, ex) => acc + ex.logs.length, 0);
  const completedSets = exercises.reduce((acc, ex) => acc + ex.logs.filter(l => l.completed).length, 0);
  const progressPercent = totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0;

  const totalVolume = exercises.reduce((acc, ex) => {
    return acc + ex.logs.filter(l => l.completed).reduce((s, l) => s + ((l.weight || 0) * (l.reps || 0)), 0);
  }, 0);

  const updateLog = (exIdx: number, setIdx: number, field: string, value: unknown) => {
    const newEx = [...exercises];
    newEx[exIdx].logs[setIdx] = { ...newEx[exIdx].logs[setIdx], [field]: value };
    setExercises(newEx);
  };

  const checkPR = useCallback((exerciseId: string, exerciseName: string, weight: number, reps: number): boolean => {
    const existingPR = personalRecords.find(pr => pr.exercise_id === exerciseId);
    let isPR = false;

    if (!existingPR || weight > existingPR.weight || (weight === existingPR.weight && reps > existingPR.reps)) {
      const existingAlert = prAlerts.find(a => a.exerciseName === exerciseName);
      if (!existingAlert || weight > existingAlert.weight || (weight === existingAlert.weight && reps > existingAlert.reps)) {
        const type: "weight" | "rep" = !existingPR || weight > (existingPR?.weight || 0) ? "weight" : "rep";
        setPrAlerts(prev => [
          ...prev.filter(a => a.exerciseName !== exerciseName),
          { exerciseName, weight, reps, type },
        ]);
        toast({ title: "🏆 NEW PR!", description: `${exerciseName}: ${weight} lbs × ${reps} reps` });
        isPR = true;
      }
    }
    return isPR;
  }, [personalRecords, prAlerts, toast]);

  const completeSet = (exIdx: number, setIdx: number) => {
    const ex = exercises[exIdx];
    const log = ex.logs[setIdx];
    if (!log.weight || !log.reps) return;

    const isPR = checkPR(ex.id, ex.name, log.weight, log.reps);

    const newEx = [...exercises];
    newEx[exIdx].logs[setIdx] = { ...newEx[exIdx].logs[setIdx], completed: true, isPR };

    // Auto-fill next incomplete set
    const nextIdx = newEx[exIdx].logs.findIndex((l, i) => i > setIdx && !l.completed);
    if (nextIdx !== -1) {
      if (!newEx[exIdx].logs[nextIdx].weight) newEx[exIdx].logs[nextIdx].weight = log.weight;
      if (!newEx[exIdx].logs[nextIdx].reps) newEx[exIdx].logs[nextIdx].reps = log.reps;
    }

    setExercises(newEx);

    if (ex.restSeconds > 0) {
      setRestTimer({ seconds: ex.restSeconds });
    }
  };

  const addSet = (exIdx: number) => {
    const newEx = [...exercises];
    const lastLog = newEx[exIdx].logs[newEx[exIdx].logs.length - 1];
    newEx[exIdx].logs.push({
      setNumber: newEx[exIdx].logs.length + 1,
      weight: lastLog?.weight,
      reps: lastLog?.reps,
      completed: false,
    });
    setExercises(newEx);
  };

  const handleAddExercise = (exercise: any) => {
    const newExercise: ExerciseLogForm = {
      id: exercise.id,
      name: exercise.name,
      sets: 3,
      reps: "10",
      tempo: "",
      restSeconds: 90,
      notes: "",
      videoUrl: exercise.youtube_url || exercise.video_url || null,
      logs: Array.from({ length: 3 }, (_, idx) => ({
        setNumber: idx + 1,
        weight: undefined,
        reps: undefined,
        completed: false,
      })),
    };
    setExercises(prev => [...prev, newExercise]);
    setShowAddExercise(false);
    toast({ title: `${exercise.name} added to workout` });
  };

  const finishWorkout = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);

      const { data: session, error: sessionError } = await supabase
        .from("workout_sessions")
        .insert({
          client_id: user.id,
          workout_id: workoutId,
          completed_at: new Date().toISOString(),
          duration_seconds: durationSeconds,
          total_volume: totalVolume,
          sets_completed: completedSets,
          pr_count: prAlerts.length,
          status: "completed",
        })
        .select()
        .single();
      if (sessionError) throw sessionError;

      const logsToInsert = exercises.flatMap((ex) =>
        ex.logs.filter(log => log.completed).map((log) => ({
          session_id: session.id,
          exercise_id: ex.id,
          set_number: log.setNumber,
          weight: log.weight || null,
          reps: log.reps || null,
          tempo: log.tempo || null,
          rir: log.rir ?? (log.rpe ? (10 - (log.rpe || 0)) : null),
          notes: log.notes || null,
        }))
      );

      if (logsToInsert.length > 0) {
        const { error: logsError } = await supabase.from("exercise_logs").insert(logsToInsert);
        if (logsError) throw logsError;
      }

      for (const alert of prAlerts) {
        const ex = exercises.find(e => e.name === alert.exerciseName);
        if (ex) {
          await supabase.rpc("update_personal_record", {
            _client_id: user.id, _exercise_id: ex.id, _weight: alert.weight, _reps: alert.reps,
          });
        }
      }

      setShowSummary(true);
    } catch (error: any) {
      console.error("[WorkoutLogger] Finish error:", error, { workoutId, userId: user.id });
      toast({ title: "Error saving workout", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const cancelWorkout = () => {
    setShowCancelDialog(false);
    onComplete?.();
  };

  if (showSummary) {
    return (
      <WorkoutSummary
        workoutName={workoutName}
        durationSeconds={Math.floor((Date.now() - startTime) / 1000)}
        totalSets={totalSets}
        completedSets={completedSets}
        totalVolume={totalVolume}
        exerciseCount={exercises.filter(e => e.logs.some(l => l.completed)).length}
        prs={prAlerts}
        isFirstSession={isFirstSession}
        onDone={() => onComplete?.()}
      />
    );
  }

  return (
    <div className="space-y-4 pb-52">
      {/* Sticky Header — Timer + Finish */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border -mx-4 px-4 pt-2 pb-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              // Reset timer visual only (cosmetic)
            }}
            className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <span className="text-lg font-bold tabular-nums text-foreground">{elapsed}</span>
          <Button
            size="sm"
            onClick={finishWorkout}
            disabled={loading || completedSets === 0}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-full px-5"
          >
            {loading && <Loader2 className="animate-spin mr-1 h-3.5 w-3.5" />}
            Finish
          </Button>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-3 mt-2">
          <Progress value={progressPercent} className="flex-1 h-2.5" />
          <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap tabular-nums">
            {completedSets} / {totalSets} sets
          </span>
        </div>

        <h2 className="text-sm font-medium text-muted-foreground mt-1 truncate">{workoutName}</h2>
      </div>

      {workoutInstructions && (
        <div className="p-3 rounded-lg bg-secondary/50 border border-border">
          <p className="text-xs text-muted-foreground whitespace-pre-wrap">{workoutInstructions}</p>
        </div>
      )}

      {/* PR Alerts */}
      {prAlerts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {prAlerts.map((pr, i) => (
            <Badge key={i} variant="default" className="gap-1">
              <Trophy className="h-3 w-3" /> {pr.exerciseName}: {pr.weight}×{pr.reps}
            </Badge>
          ))}
        </div>
      )}

      {/* Exercise Cards */}
      {exercises.map((exercise, exIdx) => (
        <ExerciseCard
          key={`${exercise.id}-${exIdx}`}
          name={exercise.name}
          exerciseId={exercise.id}
          sets={exercise.sets}
          reps={exercise.reps}
          tempo={exercise.tempo}
          restSeconds={exercise.restSeconds}
          rir={exercise.rir}
          notes={exercise.notes}
          videoUrl={exercise.videoUrl}
          logs={exercise.logs}
          previousSets={previousPerformance[exercise.id] || []}
          allTimePR={personalRecords.find(pr => pr.exercise_id === exercise.id) ? {
            weight: personalRecords.find(pr => pr.exercise_id === exercise.id)!.weight,
            reps: personalRecords.find(pr => pr.exercise_id === exercise.id)!.reps,
          } : null}
          onUpdateLog={(setIdx, field, value) => updateLog(exIdx, setIdx, field, value)}
          onCompleteSet={(setIdx) => completeSet(exIdx, setIdx)}
          onAddSet={() => addSet(exIdx)}
        />
      ))}

      {/* Floating Rest Timer */}
      {restTimer && (
        <FloatingRestTimer
          key={restTimer.seconds + Date.now()}
          seconds={restTimer.seconds}
          onComplete={() => setRestTimer(null)}
        />
      )}

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-background/95 backdrop-blur-sm border-t border-border p-4 space-y-2 safe-area-bottom">
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => setShowAddExercise(true)}
        >
          <Plus className="h-4 w-4" /> Add Exercises
        </Button>
        <Button
          onClick={finishWorkout}
          disabled={loading || completedSets === 0}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
          size="lg"
        >
          {loading && <Loader2 className="animate-spin mr-2" />}
          Finish Workout
        </Button>
        <Button
          variant="ghost"
          className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => setShowCancelDialog(true)}
        >
          <X className="h-4 w-4 mr-1" /> Cancel Workout
        </Button>
      </div>

      {/* Cancel Confirmation */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Workout?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this workout? All progress will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction
              onClick={cancelWorkout}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full"
            >
              Cancel Workout
            </AlertDialogAction>
            <AlertDialogCancel className="w-full mt-0">Resume</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Exercise Dialog */}
      <Dialog open={showAddExercise} onOpenChange={setShowAddExercise}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Exercise</DialogTitle>
          </DialogHeader>
          <ExerciseLibrary onSelectExercise={handleAddExercise} selectionMode />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WorkoutLogger;
