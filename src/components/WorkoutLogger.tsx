import { useState, useEffect, useCallback, useRef } from "react";
import { unlockAudio } from "@/utils/restTimerAudio";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, RotateCcw, X, Zap, Check, AlertTriangle, Cloud } from "lucide-react";
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
import WorkoutSummary from "@/components/workout/WorkoutSummary";
import ExerciseLibrary from "@/components/training/ExerciseLibrary";
import { useNavigate } from "react-router-dom";

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
  equipment?: string | null;
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

interface ExerciseModification {
  type: "switch" | "delete";
  original_exercise_id?: string;
  original_exercise_name?: string;
  replacement_exercise_id?: string;
  replacement_exercise_name?: string;
  exercise_id?: string;
  exercise_name?: string;
  switched_at?: string;
  deleted_at?: string;
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
  resumeSessionId?: string | null;
  calendarEventId?: string | null;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

// --- Offline retry queue helpers ---
const RETRY_KEY = "set_retry_queue";

function getRetryQueue(): any[] {
  try {
    return JSON.parse(sessionStorage.getItem(RETRY_KEY) || "[]");
  } catch { return []; }
}

function pushToRetryQueue(item: any) {
  const queue = getRetryQueue();
  queue.push({ ...item, queuedAt: Date.now() });
  sessionStorage.setItem(RETRY_KEY, JSON.stringify(queue));
}

function setRetryQueue(queue: any[]) {
  sessionStorage.setItem(RETRY_KEY, JSON.stringify(queue));
}

function clearRetryQueue() {
  sessionStorage.removeItem(RETRY_KEY);
}

const WorkoutLogger = ({ workoutId, workoutName, workoutInstructions, exercises: initialExercises, onComplete, resumeSessionId, calendarEventId }: WorkoutLoggerProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [exercises, setExercises] = useState(initialExercises);
  const [personalRecords, setPersonalRecords] = useState<PersonalRecord[]>([]);
  const [prAlerts, setPrAlerts] = useState<PRAlert[]>([]);
  const [startTime, setStartTime] = useState(Date.now());
  const [elapsed, setElapsed] = useState("0:00");
  const [previousPerformance, setPreviousPerformance] = useState<Record<string, any[]>>({});
  const [showSummary, setShowSummary] = useState(false);
  const [isFirstSession, setIsFirstSession] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(resumeSessionId || null);
  const [exerciseModifications, setExerciseModifications] = useState<ExerciseModification[]>([]);
  const [switchingExIdx, setSwitchingExIdx] = useState<number | null>(null);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Inline rest timer state: which exercise index + which set index the timer appears after
  const [restTimer, setRestTimer] = useState<{ exIdx: number; setIdx: number; seconds: number; startedAt: number } | null>(null);

  // Save status
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recovery banner
  const [showRecoveryBanner, setShowRecoveryBanner] = useState(false);
  const [recoveredSetCount, setRecoveredSetCount] = useState(0);

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

  // Create in_progress session on mount OR restore resumed session
  useEffect(() => {
    if (!user) return;
    const initSession = async () => {
      if (resumeSessionId) {
        // Resuming: restore startTime from DB
        const { data: s } = await supabase
          .from("workout_sessions")
          .select("started_at")
          .eq("id", resumeSessionId)
          .maybeSingle();
        if (s?.started_at) {
          setStartTime(new Date(s.started_at).getTime());
        }
        // Restore previously logged sets
        const { data: logs } = await supabase
          .from("exercise_logs")
          .select("exercise_id, set_number, weight, reps, rir, rpe, notes, tempo")
          .eq("session_id", resumeSessionId)
          .order("set_number");
        if (logs && logs.length > 0) {
          let restoredCount = 0;
          setExercises(prev => {
            const updated = [...prev];
            logs.forEach(log => {
              const exIdx = updated.findIndex(e => e.id === log.exercise_id);
              if (exIdx === -1) return;
              const setIdx = updated[exIdx].logs.findIndex(l => l.setNumber === log.set_number);
              if (setIdx === -1) return;
              updated[exIdx].logs[setIdx] = {
                ...updated[exIdx].logs[setIdx],
                weight: log.weight ?? undefined,
                reps: log.reps ?? undefined,
                rir: log.rir ?? undefined,
                rpe: (log as any).rpe ?? undefined,
                tempo: log.tempo ?? undefined,
                notes: log.notes ?? undefined,
                completed: true,
              };
              restoredCount++;
            });
            return updated;
          });
          if (restoredCount > 0) {
            setRecoveredSetCount(restoredCount);
            setShowRecoveryBanner(true);
          }
        }
        setSessionId(resumeSessionId);
      } else {
        // Create new in_progress session
        const { getLocalDateString } = await import("@/utils/localDate");
        const { data, error } = await supabase
          .from("workout_sessions")
          .insert({
            client_id: user.id,
            workout_id: workoutId,
            status: "in_progress",
            started_at: new Date().toISOString(),
            last_heartbeat: new Date().toISOString(),
            session_date: getLocalDateString(),
            tz_corrected: true,
          } as any)
          .select("id")
          .single();
        if (!error && data) {
          setSessionId(data.id);
        }
      }
    };
    initSession();
  }, [user, workoutId, resumeSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-dismiss recovery banner after 4s
  useEffect(() => {
    if (!showRecoveryBanner) return;
    const t = setTimeout(() => setShowRecoveryBanner(false), 4000);
    return () => clearTimeout(t);
  }, [showRecoveryBanner]);

  // Heartbeat every 30 seconds
  useEffect(() => {
    if (!sessionId) return;
    const interval = setInterval(() => {
      supabase
        .from("workout_sessions")
        .update({ last_heartbeat: new Date().toISOString() })
        .eq("id", sessionId)
        .eq("status", "in_progress")
        .then(() => {}); // fire-and-forget
    }, 30_000);
    return () => clearInterval(interval);
  }, [sessionId]);

  // Flush retry queue on visibility change
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && sessionId) {
        flushRetryQueue(sessionId);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [sessionId]);

  const flushRetryQueue = async (sid: string) => {
    const queue = getRetryQueue();
    if (queue.length === 0) return;
    const failed: any[] = [];
    for (const item of queue) {
      try {
        const { error } = await supabase
          .from("exercise_logs")
          .upsert({
            session_id: item.session_id || sid,
            exercise_id: item.exercise_id,
            set_number: item.set_number,
            weight: item.weight,
            reps: item.reps,
            tempo: item.tempo || null,
            rir: item.rir ?? null,
            notes: item.notes || null,
            logged_at: new Date().toISOString(),
          }, { onConflict: "session_id,exercise_id,set_number" });
        if (error) failed.push(item);
      } catch {
        failed.push(item);
      }
    }
    setRetryQueue(failed);
    if (failed.length === 0 && queue.length > 0) {
      showSaveSuccess();
    }
  };

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

  const showSaveSuccess = () => {
    setSaveStatus("saved");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
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

  // Persist a single set to Supabase immediately
  const persistSet = async (exerciseId: string, log: ExerciseLogForm["logs"][0]) => {
    if (!sessionId) return;
    setSaveStatus("saving");
    try {
      const { error } = await supabase
        .from("exercise_logs")
        .upsert({
          session_id: sessionId,
          exercise_id: exerciseId,
          set_number: log.setNumber,
          weight: log.weight ?? null,
          reps: log.reps || null,
          tempo: log.tempo || null,
          rir: log.rir ?? (log.rpe ? Math.round((10 - log.rpe) * 10) / 10 : null),
          rpe: log.rpe ?? null,
          notes: log.notes || null,
          logged_at: new Date().toISOString(),
        } as any, { onConflict: "session_id,exercise_id,set_number" });

      if (error) {
        console.error("[WorkoutLogger] Set save failed:", error);
        setSaveStatus("error");
        pushToRetryQueue({
          session_id: sessionId,
          exercise_id: exerciseId,
          set_number: log.setNumber,
          weight: log.weight,
          reps: log.reps,
          tempo: log.tempo,
          rir: log.rir,
          notes: log.notes,
        });
        return;
      }
      showSaveSuccess();

      // Update last_activity heartbeat (fire-and-forget)
      supabase
        .from("workout_sessions")
        .update({ last_heartbeat: new Date().toISOString() })
        .eq("id", sessionId)
        .then(() => {});
    } catch (e) {
      console.error("[WorkoutLogger] Set persist error:", e);
      setSaveStatus("error");
      pushToRetryQueue({
        session_id: sessionId,
        exercise_id: exerciseId,
        set_number: log.setNumber,
        weight: log.weight,
        reps: log.reps,
      });
    }
  };

  const completeSet = (exIdx: number, setIdx: number) => {
    const ex = exercises[exIdx];
    const log = ex.logs[setIdx];
    // Allow weight of 0 or undefined (bodyweight/mobility); only require reps > 0
    const weight = log.weight ?? 0;
    if (weight < 0 || !log.reps) return;

    const isPR = checkPR(ex.id, ex.name, weight, log.reps);

    const newEx = [...exercises];
    const completedLog = { ...newEx[exIdx].logs[setIdx], weight, completed: true, isPR };
    newEx[exIdx].logs[setIdx] = completedLog;

    // Auto-fill next incomplete set
    const nextIdx = newEx[exIdx].logs.findIndex((l, i) => i > setIdx && !l.completed);
    if (nextIdx !== -1) {
      if (newEx[exIdx].logs[nextIdx].weight === undefined || newEx[exIdx].logs[nextIdx].weight === null) {
        newEx[exIdx].logs[nextIdx].weight = weight;
      }
      if (!newEx[exIdx].logs[nextIdx].reps) newEx[exIdx].logs[nextIdx].reps = log.reps;
    }

    setExercises(newEx);

    // Immediately persist this set to DB
    persistSet(ex.id, completedLog);

    if (ex.restSeconds > 0) {
      unlockAudio(); // Prime iOS audio before rest timer starts
      setRestTimer({ exIdx, setIdx, seconds: ex.restSeconds, startedAt: Date.now() });
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

  const deleteSet = async (exIdx: number, setIdx: number) => {
    const ex = exercises[exIdx];
    if (ex.logs.length <= 1) return; // Don't allow deleting the last set

    const log = ex.logs[setIdx];

    // If the set was already persisted, delete from DB
    if (log.completed && sessionId) {
      await supabase
        .from("exercise_logs")
        .delete()
        .eq("session_id", sessionId)
        .eq("exercise_id", ex.id)
        .eq("set_number", log.setNumber);
    }

    const newEx = [...exercises];
    newEx[exIdx].logs.splice(setIdx, 1);
    // Re-number remaining sets
    newEx[exIdx].logs.forEach((l, i) => { l.setNumber = i + 1; });
    setExercises(newEx);

    toast({ title: `Set deleted from ${ex.name}` });
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
      equipment: exercise.equipment || null,
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

  const deleteExercise = (exIdx: number) => {
    const ex = exercises[exIdx];
    setExerciseModifications(prev => [...prev, {
      type: "delete",
      exercise_id: ex.id,
      exercise_name: ex.name,
      deleted_at: new Date().toISOString(),
    }]);
    setExercises(prev => prev.filter((_, i) => i !== exIdx));
    toast({ title: `${ex.name} removed from session` });
  };

  const handleSwitchExercise = (exercise: any) => {
    if (switchingExIdx === null) return;
    const original = exercises[switchingExIdx];
    
    setExerciseModifications(prev => [...prev, {
      type: "switch",
      original_exercise_id: original.id,
      original_exercise_name: original.name,
      replacement_exercise_id: exercise.id,
      replacement_exercise_name: exercise.name,
      switched_at: new Date().toISOString(),
    }]);

    const newEx = [...exercises];
    newEx[switchingExIdx] = {
      ...newEx[switchingExIdx],
      id: exercise.id,
      name: exercise.name,
      videoUrl: exercise.youtube_url || exercise.video_url || null,
      equipment: exercise.equipment || null,
      logs: newEx[switchingExIdx].logs.map(l => ({
        ...l,
        weight: 0,
        completed: false,
        isPR: false,
      })),
    };
    setExercises(newEx);
    setSwitchingExIdx(null);
    toast({ title: `Switched to ${exercise.name}` });
  };

  const hasIncompleteSets = () => {
    return exercises.some(ex => ex.logs.some(log => !log.completed));
  };

  const handleFinishTap = () => {
    if (hasIncompleteSets()) {
      setShowFinishModal(true);
    } else {
      finishWorkout(false);
    }
  };

  const finishWorkout = async (hadUnlogged: boolean = false) => {
    if (!user || !sessionId) return;
    setLoading(true);
    try {
      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);

      // Build final set list — upsert to avoid duplicate-key errors
      const logsToUpsert = exercises.flatMap((ex) =>
        ex.logs.filter(log => log.completed).map((log) => ({
          session_id: sessionId,
          exercise_id: ex.id,
          set_number: log.setNumber,
          weight: log.weight ?? 0,
          reps: log.reps || null,
          tempo: log.tempo || null,
          rir: log.rir ?? (log.rpe ? (10 - (log.rpe || 0)) : null),
          notes: log.notes || null,
          logged_at: new Date().toISOString(),
        }))
      );

      if (logsToUpsert.length > 0) {
        const { error: logsError } = await supabase
          .from("exercise_logs")
          .upsert(logsToUpsert, { onConflict: "session_id,exercise_id,set_number" });
        if (logsError) throw logsError;
      }

      // Delete logs for exercises that were removed during session
      const activeExerciseIds = exercises.map(e => e.id);
      const { data: existingLogs } = await supabase
        .from("exercise_logs")
        .select("id, exercise_id")
        .eq("session_id", sessionId);
      
      const orphanedLogIds = (existingLogs || [])
        .filter(l => !activeExerciseIds.includes(l.exercise_id))
        .map(l => l.id);
      
      if (orphanedLogIds.length > 0) {
        await supabase.from("exercise_logs").delete().in("id", orphanedLogIds);
      }

      // Update session to completed
      const { error: sessionError } = await supabase
        .from("workout_sessions")
        .update({
          completed_at: new Date().toISOString(),
          duration_seconds: durationSeconds,
          total_volume: totalVolume,
          sets_completed: completedSets,
          pr_count: prAlerts.length,
          status: "completed",
          had_unlogged_sets: hadUnlogged,
          exercise_modifications: exerciseModifications.length > 0 ? exerciseModifications : undefined,
        } as any)
        .eq("id", sessionId);
      if (sessionError) throw sessionError;

      for (const alert of prAlerts) {
        const ex = exercises.find(e => e.name === alert.exerciseName);
        if (ex) {
          await supabase.rpc("update_personal_record", {
            _client_id: user.id, _exercise_id: ex.id, _weight: alert.weight, _reps: alert.reps,
          });
        }
      }

      // Mark calendar event as completed
      if (calendarEventId) {
        await supabase
          .from("calendar_events")
          .update({ is_completed: true, completed_at: new Date().toISOString() })
          .eq("id", calendarEventId);
      }

      // Clear retry queue
      clearRetryQueue();

      setShowSummary(true);
    } catch (error: any) {
      console.error("[WorkoutLogger] Finish error:", error, { workoutId, userId: user.id });
      toast({ title: "Error saving workout", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const cancelWorkout = async () => {
    if (sessionId) {
      await supabase
        .from("workout_sessions")
        .update({ status: "cancelled" })
        .eq("id", sessionId);
    }
    clearRetryQueue();
    setShowCancelDialog(false);
    onComplete?.();
  };

  const discardWorkout = async () => {
    if (sessionId) {
      await supabase.from("exercise_logs").delete().eq("session_id", sessionId);
      await supabase.from("workout_sessions").delete().eq("id", sessionId);
    }
    clearRetryQueue();
    setShowFinishModal(false);
    setShowDiscardConfirm(false);
    onComplete?.();
  };

  const finishAnyway = async () => {
    setShowFinishModal(false);
    await finishWorkout(true);
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
        onDone={() => {
          // Clear session storage and navigate to dashboard
          clearRetryQueue();
          onComplete?.();
          navigate("/");
        }}
      />
    );
  }

  return (
    <div className="space-y-4 pb-52">
      {/* Recovery Banner */}
      {showRecoveryBanner && (
        <div className="mx-0 rounded-lg border-l-4 border-l-primary bg-primary/10 border border-primary/20 p-3 flex items-center justify-between animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm font-medium text-foreground">
              Session restored — {recoveredSetCount} set{recoveredSetCount !== 1 ? "s" : ""} recovered
            </span>
          </div>
          <button
            onClick={() => setShowRecoveryBanner(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Sticky Header — Timer + Finish + Save Status */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border -mx-4 px-4 pt-2 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {}}
              className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            {/* Save Status Indicator */}
            <SaveStatusIndicator status={saveStatus} />
          </div>
          <span className="text-lg font-bold tabular-nums text-foreground">{elapsed}</span>
          <Button
            size="sm"
            onClick={handleFinishTap}
            disabled={loading}
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
          equipment={exercise.equipment}
          logs={exercise.logs}
          previousSets={previousPerformance[exercise.id] || []}
          allTimePR={personalRecords.find(pr => pr.exercise_id === exercise.id) ? {
            weight: personalRecords.find(pr => pr.exercise_id === exercise.id)!.weight,
            reps: personalRecords.find(pr => pr.exercise_id === exercise.id)!.reps,
          } : null}
          activeTimerAfterSetIndex={restTimer?.exIdx === exIdx ? restTimer.setIdx : null}
          timerSeconds={restTimer?.seconds ?? 0}
          onTimerComplete={() => setRestTimer(null)}
          onTimerSkip={() => setRestTimer(null)}
          onUpdateLog={(setIdx, field, value) => updateLog(exIdx, setIdx, field, value)}
          onCompleteSet={(setIdx) => completeSet(exIdx, setIdx)}
          onAddSet={() => addSet(exIdx)}
          onDeleteSet={(setIdx) => deleteSet(exIdx, setIdx)}
          onDeleteExercise={() => deleteExercise(exIdx)}
          onSwitchExercise={() => { setSwitchingExIdx(exIdx); setShowAddExercise(true); }}
        />
      ))}

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
          variant="ghost"
          className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => setShowCancelDialog(true)}
        >
          Cancel Workout
        </Button>
      </div>

      {/* Cancel Confirmation */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Workout?</AlertDialogTitle>
            <AlertDialogDescription>
              All your saved sets here will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction
              onClick={cancelWorkout}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full"
            >
              Cancel Workout
            </AlertDialogAction>
            <AlertDialogCancel className="w-full mt-0">Resume Workout</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add / Switch Exercise Dialog */}
      <Dialog open={showAddExercise} onOpenChange={(open) => { setShowAddExercise(open); if (!open) setSwitchingExIdx(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{switchingExIdx !== null ? "Switch Exercise" : "Add Exercise"}</DialogTitle>
          </DialogHeader>
          <ExerciseLibrary
            onSelectExercise={switchingExIdx !== null ? handleSwitchExercise : handleAddExercise}
            selectionMode
          />
        </DialogContent>
      </Dialog>

      {/* Finish Workout Modal — 3-option Strong-style */}
      <Dialog open={showFinishModal} onOpenChange={(open) => { setShowFinishModal(open); if (!open) setShowDiscardConfirm(false); }}>
        <DialogContent className="max-w-sm border-primary/30">
          <div className="flex flex-col items-center text-center space-y-4 py-2">
            <span className="text-4xl">🎉</span>
            <div>
              <h3 className="text-lg font-bold text-foreground">Finish Workout?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                There are sets in this workout that have not been logged yet.
              </p>
            </div>

            <div className="w-full space-y-3 pt-2">
              <Button
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                size="lg"
                onClick={finishAnyway}
                disabled={loading}
              >
                {loading && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
                Finish Anyway
              </Button>

              <div className="w-full">
                <Button
                  variant="outline"
                  className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 font-semibold"
                  size="lg"
                  onClick={() => setShowDiscardConfirm(true)}
                >
                  Discard Workout
                </Button>
                {showDiscardConfirm && (
                  <div className="mt-2 text-center">
                    <p className="text-xs text-muted-foreground mb-2">Are you sure? This will delete all logged sets.</p>
                    <div className="flex justify-center gap-3">
                      <button className="text-xs font-semibold text-destructive" onClick={discardWorkout}>
                        Yes, Discard
                      </button>
                      <button className="text-xs text-muted-foreground" onClick={() => setShowDiscardConfirm(false)}>
                        Go Back
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <Button
                variant="secondary"
                className="w-full"
                size="lg"
                onClick={() => { setShowFinishModal(false); setShowDiscardConfirm(false); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// --- Save Status Indicator ---
function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;

  return (
    <span className={`text-[11px] font-medium flex items-center gap-1 transition-opacity ${
      status === "saved" ? "text-primary" :
      status === "saving" ? "text-muted-foreground" :
      "text-destructive"
    }`}>
      {status === "saving" && <Cloud className="h-3 w-3 animate-pulse" />}
      {status === "saved" && <Check className="h-3 w-3" />}
      {status === "error" && <AlertTriangle className="h-3 w-3" />}
      {status === "saving" ? "Saving..." : status === "saved" ? "Saved" : "Save failed"}
    </span>
  );
}

export default WorkoutLogger;
