import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Check, ChevronLeft, ChevronRight, Trophy, Timer, TrendingUp, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import RestTimer from "./RestTimer";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

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
  const [currentExerciseIdx, setCurrentExerciseIdx] = useState(0);
  const [exercises, setExercises] = useState(initialExercises);
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [restTimerKey, setRestTimerKey] = useState(0);
  const [personalRecords, setPersonalRecords] = useState<PersonalRecord[]>([]);
  const [prAlerts, setPrAlerts] = useState<PRAlert[]>([]);
  const [startTime] = useState(Date.now());

  const currentExercise = exercises[currentExerciseIdx];

  const [previousPerformance, setPreviousPerformance] = useState<Record<string, any[]>>({});
  const [suggestedWeights, setSuggestedWeights] = useState<Record<string, number>>({});

  // Load existing PRs and previous performance
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

      // Load last session performance for each exercise
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

          // Compute suggested weights based on progression settings
          const suggestions: Record<string, number> = {};
          initialExercises.forEach(ex => {
            const prevLogs = grouped[ex.id];
            if (!prevLogs || prevLogs.length === 0 || !ex.progression) return;
            const prog = ex.progression;
            const avgWeight = prevLogs.reduce((s, l) => s + (l.weight || 0), 0) / prevLogs.length;
            const avgReps = prevLogs.reduce((s, l) => s + (l.reps || 0), 0) / prevLogs.length;
            const avgRpe = prevLogs.filter(l => l.rir != null).length > 0
              ? 10 - (prevLogs.reduce((s, l) => s + (l.rir ?? 0), 0) / prevLogs.filter(l => l.rir != null).length)
              : null;

            // Parse rep range
            const repRange = ex.reps.replace(/[–—]/g, "-");
            const [minReps, maxReps] = repRange.split("-").map(Number);
            const topReps = maxReps || minReps || 10;
            const bottomReps = minReps || 8;

            if (prog.progressionType === "manual") {
              suggestions[ex.id] = avgWeight;
              return;
            }

            let suggested = avgWeight;

            if (prog.progressionType === "double") {
              // Double progression: if hit top of range on all sets, increase weight
              const allHitTop = prevLogs.every(l => (l.reps ?? 0) >= topReps);
              const anyBelowMin = prevLogs.some(l => (l.reps ?? 0) < bottomReps);
              const rpeOk = avgRpe === null || avgRpe <= prog.rpeThreshold;

              if (allHitTop && rpeOk) {
                if (prog.incrementType === "percentage") {
                  suggested = Math.round(avgWeight * (1 + prog.weightIncrement / 100) * 2) / 2;
                } else {
                  suggested = avgWeight + prog.weightIncrement;
                }
              } else if (anyBelowMin) {
                suggested = Math.round(avgWeight * 0.95 * 2) / 2;
              }
            } else if (prog.progressionType === "linear") {
              if (prog.incrementType === "percentage") {
                suggested = Math.round(avgWeight * (1 + prog.weightIncrement / 100) * 2) / 2;
              } else {
                suggested = avgWeight + prog.weightIncrement;
              }
            } else if (prog.progressionType === "rpe") {
              if (avgRpe !== null) {
                if (avgRpe < prog.rpeThreshold - 0.5) {
                  const mult = prog.progressionMode === "aggressive" ? 1.05 : prog.progressionMode === "conservative" ? 1.02 : 1.03;
                  suggested = Math.round(avgWeight * mult * 2) / 2;
                } else if (avgRpe > prog.rpeThreshold + 0.5) {
                  suggested = Math.round(avgWeight * 0.97 * 2) / 2;
                }
              }
            } else if (prog.progressionType === "percentage") {
              if (prog.incrementType === "percentage") {
                suggested = Math.round(avgWeight * (1 + prog.weightIncrement / 100) * 2) / 2;
              } else {
                suggested = avgWeight + prog.weightIncrement;
              }
            }

            suggestions[ex.id] = Math.round(suggested * 2) / 2;
          });
          setSuggestedWeights(suggestions);
        }
      }
    };
    loadData();
  }, [user, initialExercises, workoutId]);

  // Total sets progress
  const totalSets = exercises.reduce((acc, ex) => acc + ex.logs.length, 0);
  const completedSets = exercises.reduce(
    (acc, ex) => acc + ex.logs.filter(l => l.completed).length, 0
  );
  const progressPercent = totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0;

  const updateLog = (setIdx: number, field: string, value: unknown) => {
    const newEx = [...exercises];
    newEx[currentExerciseIdx].logs[setIdx] = {
      ...newEx[currentExerciseIdx].logs[setIdx],
      [field]: value,
    };
    setExercises(newEx);
  };

  const checkPR = useCallback((exerciseId: string, exerciseName: string, weight: number, reps: number) => {
    const existingPR = personalRecords.find(pr => pr.exercise_id === exerciseId);
    if (!existingPR || weight > existingPR.weight || (weight === existingPR.weight && reps > existingPR.reps)) {
      // Check if we already alerted for a better PR this session
      const existingAlert = prAlerts.find(a => a.exerciseName === exerciseName);
      if (!existingAlert || weight > existingAlert.weight || (weight === existingAlert.weight && reps > existingAlert.reps)) {
        setPrAlerts(prev => [
          ...prev.filter(a => a.exerciseName !== exerciseName),
          { exerciseName, weight, reps },
        ]);
        toast({
          title: "🏆 NEW PR!",
          description: `${exerciseName}: ${weight} lbs × ${reps} reps`,
        });
      }
    }
  }, [personalRecords, prAlerts, toast]);

  const completeSet = (setIdx: number) => {
    const log = currentExercise.logs[setIdx];
    if (!log.weight || !log.reps) return;

    updateLog(setIdx, "completed", true);
    checkPR(currentExercise.id, currentExercise.name, log.weight, log.reps);

    // Auto-start rest timer
    setShowRestTimer(true);
    setRestTimerKey(prev => prev + 1);
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

      const logsToInsert = exercises.flatMap((ex) =>
        ex.logs
          .filter(log => log.completed)
          .map((log) => ({
            session_id: session.id,
            exercise_id: ex.id,
            set_number: log.setNumber,
            weight: log.weight || null,
            reps: log.reps || null,
            tempo: log.tempo || null,
            rir: log.rir ?? log.rpe ? (10 - (log.rpe || 0)) : null,
            notes: log.notes || null,
          }))
      );

      if (logsToInsert.length > 0) {
        const { error: logsError } = await supabase.from("exercise_logs").insert(logsToInsert);
        if (logsError) throw logsError;
      }

      // Update PRs
      for (const alert of prAlerts) {
        const ex = exercises.find(e => e.name === alert.exerciseName);
        if (ex) {
          await supabase.rpc("update_personal_record", {
            _client_id: user.id,
            _exercise_id: ex.id,
            _weight: alert.weight,
            _reps: alert.reps,
          });
        }
      }

      // Plateau detection: check for stagnation
      for (const ex of exercises) {
        const prev = previousPerformance[ex.id];
        if (!prev || prev.length === 0) continue;

        const currentLogs = ex.logs.filter(l => l.completed);
        if (currentLogs.length === 0) continue;

        const prevAvgWeight = prev.reduce((s, l) => s + (l.weight || 0), 0) / prev.length;
        const currAvgWeight = currentLogs.reduce((s, l) => s + (l.weight || 0), 0) / currentLogs.length;
        const prevAvgReps = prev.reduce((s, l) => s + (l.reps || 0), 0) / prev.length;
        const currAvgReps = currentLogs.reduce((s, l) => s + (l.reps || 0), 0) / currentLogs.length;

        // If weight hasn't increased and reps stagnated
        const weightStagnant = Math.abs(currAvgWeight - prevAvgWeight) < 2.5;
        const repsStagnant = Math.abs(currAvgReps - prevAvgReps) < 1;

        if (weightStagnant && repsStagnant) {
          // Check how many sessions have been stagnant
          const { data: recentSessions } = await supabase
            .from("workout_sessions")
            .select("id")
            .eq("client_id", user.id)
            .eq("workout_id", workoutId)
            .order("created_at", { ascending: false })
            .limit(3);

          if (recentSessions && recentSessions.length >= 3) {
            // Check if already flagged
            const { data: existingFlag } = await supabase
              .from("plateau_flags")
              .select("id")
              .eq("client_id", user.id)
              .eq("exercise_id", ex.id)
              .eq("workout_id", workoutId)
              .is("resolved_at", null)
              .maybeSingle();

            if (!existingFlag) {
              await supabase.from("plateau_flags").insert({
                client_id: user.id,
                exercise_id: ex.id,
                workout_id: workoutId,
                stagnant_sessions: recentSessions.length,
                last_weight: currAvgWeight,
                last_reps: Math.round(currAvgReps),
              });
            }
          }
        }
      }

      const elapsed = Math.round((Date.now() - startTime) / 60000);
      toast({
        title: "Workout Complete! 💪",
        description: `${completedSets} sets in ${elapsed} min${prAlerts.length > 0 ? ` — ${prAlerts.length} new PR(s)!` : ""}`,
      });
      onComplete?.();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const getPRForExercise = (exerciseId: string) => personalRecords.find(pr => pr.exercise_id === exerciseId);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-display font-bold text-foreground">{workoutName}</h2>
        {workoutInstructions && (
          <div className="mt-2 p-3 rounded-lg bg-secondary/50 border border-border">
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{workoutInstructions}</p>
          </div>
        )}
        <div className="flex items-center gap-3 mt-2">
          <Progress value={progressPercent} className="flex-1 h-2" />
          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
            {completedSets}/{totalSets} sets
          </span>
        </div>
      </div>

      {/* PR Alerts Banner */}
      {prAlerts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {prAlerts.map((pr, i) => (
            <Badge key={i} variant="default" className="gap-1">
              <Trophy className="h-3 w-3" /> {pr.exerciseName}: {pr.weight}×{pr.reps}
            </Badge>
          ))}
        </div>
      )}

      {/* Exercise Navigation */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCurrentExerciseIdx(Math.max(0, currentExerciseIdx - 1))}
          disabled={currentExerciseIdx === 0}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 flex gap-1.5 overflow-x-auto py-1">
          {exercises.map((ex, i) => {
            const allDone = ex.logs.every(l => l.completed);
            const someDone = ex.logs.some(l => l.completed);
            return (
              <button
                key={i}
                onClick={() => setCurrentExerciseIdx(i)}
                className={`h-2 flex-1 min-w-4 rounded-full transition-colors ${
                  i === currentExerciseIdx
                    ? "bg-primary"
                    : allDone
                    ? "bg-primary/40"
                    : someDone
                    ? "bg-primary/20"
                    : "bg-secondary"
                }`}
              />
            );
          })}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCurrentExerciseIdx(Math.min(exercises.length - 1, currentExerciseIdx + 1))}
          disabled={currentExerciseIdx === exercises.length - 1}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Current Exercise */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{currentExercise.name}</CardTitle>
            <span className="text-xs text-muted-foreground">
              {currentExerciseIdx + 1}/{exercises.length}
            </span>
          </div>
          {/* Exercise metadata */}
          <div className="flex flex-wrap gap-2 mt-1">
            <span className="text-xs bg-secondary px-2 py-0.5 rounded">{currentExercise.sets} sets · {currentExercise.reps} reps</span>
            {currentExercise.tempo && <span className="text-xs bg-secondary px-2 py-0.5 rounded">Tempo: {currentExercise.tempo}</span>}
            {currentExercise.rir != null && <span className="text-xs bg-secondary px-2 py-0.5 rounded">RIR: {currentExercise.rir}</span>}
            {currentExercise.restSeconds > 0 && <span className="text-xs bg-secondary px-2 py-0.5 rounded">Rest: {currentExercise.restSeconds}s</span>}
          </div>
          {(() => {
            const pr = getPRForExercise(currentExercise.id);
            return pr ? (
              <p className="text-xs text-primary mt-1 flex items-center gap-1">
                <Trophy className="h-3 w-3" /> PR: {pr.weight} lbs × {pr.reps} reps
              </p>
            ) : null;
          })()}
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Suggested Weight Banner */}
          {suggestedWeights[currentExercise.id] && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/10 border border-primary/20">
              <TrendingUp className="h-4 w-4 text-primary flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-medium text-foreground">
                  Suggested Weight: {suggestedWeights[currentExercise.id]} lbs
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Based on {currentExercise.progression?.progressionType === "double" ? "double progression" : currentExercise.progression?.progressionType || "progression"} logic
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  const newEx = [...exercises];
                  newEx[currentExerciseIdx].logs.forEach((log, i) => {
                    if (!log.completed && !log.weight) {
                      newEx[currentExerciseIdx].logs[i].weight = suggestedWeights[currentExercise.id];
                    }
                  });
                  setExercises(newEx);
                }}
              >
                Apply
              </Button>
            </div>
          )}

          {currentExercise.notes && (
            <div className="p-2 rounded bg-secondary/50 text-xs text-muted-foreground">
              {currentExercise.notes}
            </div>
          )}

          {/* Set rows */}
          {currentExercise.logs.map((log, setIdx) => (
            <div
              key={setIdx}
              className={`border rounded-lg p-3 space-y-2 transition-colors ${
                log.completed ? "border-primary/30 bg-primary/5" : "bg-card/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  Set {log.setNumber}
                  {log.completed && <Check className="h-4 w-4 text-primary" />}
                </h4>
                {(() => {
                  const prev = previousPerformance[currentExercise.id];
                  const prevSet = prev?.find(p => p.set_number === log.setNumber);
                  return prevSet ? (
                    <span className="text-[10px] text-muted-foreground">
                      Last: {prevSet.weight ?? "–"} lbs × {prevSet.reps ?? "–"}
                    </span>
                  ) : null;
                })()}
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Weight</Label>
                  <Input
                    type="number"
                    value={log.weight ?? ""}
                    onChange={(e) => updateLog(setIdx, "weight", e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="lbs"
                    className="text-sm h-9"
                    disabled={log.completed}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Reps</Label>
                  <Input
                    type="number"
                    value={log.reps ?? ""}
                    onChange={(e) => updateLog(setIdx, "reps", e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="0"
                    className="text-sm h-9"
                    disabled={log.completed}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">RPE</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={log.rpe ?? ""}
                    onChange={(e) => updateLog(setIdx, "rpe", e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="1-10"
                    className="text-sm h-9"
                    disabled={log.completed}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    size="sm"
                    className="w-full h-9"
                    variant={log.completed ? "secondary" : "default"}
                    disabled={log.completed || !log.weight || !log.reps}
                    onClick={() => completeSet(setIdx)}
                  >
                    {log.completed ? <Check className="h-4 w-4" /> : "Log"}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Rest Timer */}
      {showRestTimer && currentExercise.restSeconds > 0 && (
        <RestTimer
          key={restTimerKey}
          initialSeconds={currentExercise.restSeconds}
          onComplete={() => setShowRestTimer(false)}
        />
      )}

      {/* Complete Workout */}
      {completedSets > 0 && (
        <Button
          onClick={completeWorkout}
          disabled={loading}
          className="w-full"
          size="lg"
        >
          {loading && <Loader2 className="animate-spin mr-2" />}
          Complete Workout ({completedSets} sets logged)
        </Button>
      )}
    </div>
  );
};

export default WorkoutLogger;
