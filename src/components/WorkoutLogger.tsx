import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Trophy } from "lucide-react";
import ExerciseCard from "@/components/workout/ExerciseCard";
import FloatingRestTimer from "@/components/workout/FloatingRestTimer";
import WorkoutSummary from "@/components/workout/WorkoutSummary";

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
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [previousPerformance, setPreviousPerformance] = useState<Record<string, any[]>>({});
  const [showSummary, setShowSummary] = useState(false);

  // Floating rest timer
  const [restTimer, setRestTimer] = useState<{ seconds: number } | null>(null);

  // Elapsed timer
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedMinutes(Math.floor((Date.now() - startTime) / 60000));
    }, 10000);
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

      const { data: lastSession } = await supabase
        .from("workout_sessions")
        .select("id")
        .eq("client_id", user.id)
        .eq("workout_id", workoutId)
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

    // Auto-fill next incomplete set with same values
    const nextIdx = newEx[exIdx].logs.findIndex((l, i) => i > setIdx && !l.completed);
    if (nextIdx !== -1) {
      if (!newEx[exIdx].logs[nextIdx].weight) newEx[exIdx].logs[nextIdx].weight = log.weight;
      if (!newEx[exIdx].logs[nextIdx].reps) newEx[exIdx].logs[nextIdx].reps = log.reps;
    }

    setExercises(newEx);

    // Start floating rest timer
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

  const completeWorkout = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: session, error: sessionError } = await supabase
        .from("workout_sessions")
        .insert({ client_id: user.id, workout_id: workoutId, completed_at: new Date().toISOString() })
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
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (showSummary) {
    return (
      <WorkoutSummary
        workoutName={workoutName}
        durationMinutes={Math.round((Date.now() - startTime) / 60000)}
        totalSets={totalSets}
        completedSets={completedSets}
        totalVolume={totalVolume}
        exerciseCount={exercises.length}
        prs={prAlerts}
        onDone={() => onComplete?.()}
      />
    );
  }

  return (
    <div className="space-y-4 pb-28">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm pb-3 border-b border-border -mx-4 px-4 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-display font-bold text-foreground">{workoutName}</h2>
          <span className="text-sm text-muted-foreground tabular-nums">{elapsedMinutes}:{((Math.floor((Date.now() - startTime) / 1000)) % 60).toString().padStart(2, "0")}</span>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <Progress value={progressPercent} className="flex-1 h-3" />
          <span className="text-sm font-bold text-primary whitespace-nowrap tabular-nums">
            {completedSets}/{totalSets}
          </span>
        </div>
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
          key={exIdx}
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

      {/* Complete Workout — sticky bottom */}
      {completedSets > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur-sm border-t border-border z-20">
          <Button onClick={completeWorkout} disabled={loading} className="w-full" size="lg">
            {loading && <Loader2 className="animate-spin mr-2" />}
            Complete Workout ({completedSets}/{totalSets} sets)
          </Button>
        </div>
      )}
    </div>
  );
};

export default WorkoutLogger;
