import { useState, useEffect, useCallback, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Loader2, Plus, RotateCcw, X, Zap, Check, AlertTriangle, Cloud } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useXPAward } from "@/hooks/useXPAward";
import { useUnitPreferences } from "@/hooks/useUnitPreferences";
import { XP_VALUES } from "@/utils/rankedXP";
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
import { invalidateCache } from "@/hooks/useDataFetch";
import { format } from "date-fns";

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

// --- Unit conversion helpers ---
const KG_TO_LBS = 2.20462;
const LBS_TO_KG = 0.453592;

/** Convert a weight value from any stored unit to lbs for internal comparisons */
function weightToLbs(value: number, unit: string): number {
  if (unit === 'kg') return Number((value * KG_TO_LBS).toFixed(1));
  return value;
}

/** Convert a weight from its stored unit to the client's display unit */
function normalizeToClientUnit(value: number, storedUnit: string, clientUnit: string): number {
  if (storedUnit === clientUnit) return value;
  if (storedUnit === 'lbs' && clientUnit === 'kg') return Number((value * LBS_TO_KG).toFixed(1));
  if (storedUnit === 'kg' && clientUnit === 'lbs') return Number((value * KG_TO_LBS).toFixed(1));
  return value;
}

const WorkoutLogger = ({ workoutId, workoutName, workoutInstructions, exercises: initialExercises, onComplete, resumeSessionId, calendarEventId }: WorkoutLoggerProps) => {
  const { user } = useAuth();
  const { triggerXP } = useXPAward();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { weightUnit: clientWeightUnit, weightLabel } = useUnitPreferences();
  const [loading, setLoading] = useState(false);
  const [exercises, setExercises] = useState(initialExercises);
  const [personalRecords, setPersonalRecords] = useState<PersonalRecord[]>([]);
  const [prAlerts, setPrAlerts] = useState<PRAlert[]>([]);
  const [startTime, setStartTime] = useState(Date.now());
  const [elapsed, setElapsed] = useState("0:00");
  const [previousPerformance, setPreviousPerformance] = useState<Record<string, any[]>>({});
  // All-time best weight×reps per exercise from completed sessions (for accurate PR detection)
  // These are ALWAYS stored in lbs for consistent comparison
  const [allTimeBests, setAllTimeBests] = useState<Record<string, { weight: number; reps: number }[]>>({});
  const [showSummary, setShowSummary] = useState(false);
  const [isFirstSession, setIsFirstSession] = useState(false);
  const [frozenDuration, setFrozenDuration] = useState(0);
  const [summaryRankData, setSummaryRankData] = useState<{
    xpEarned: number;
    tier: string;
    division: number;
    divisionXP: number;
    xpNeeded: number;
    totalXP: number;
  } | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(resumeSessionId || null);
  const [exerciseModifications, setExerciseModifications] = useState<ExerciseModification[]>([]);
  const [switchingExIdx, setSwitchingExIdx] = useState<number | null>(null);
  const [showFinishModal, setShowFinishModal] = useState(false);

  // Inline rest timer state: which exercise index + which set index the timer appears after
  const [restTimer, setRestTimer] = useState<{ exIdx: number; setIdx: number; seconds: number; startedAt: number } | null>(null);

  // Save status
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recovery banner
  const [showRecoveryBanner, setShowRecoveryBanner] = useState(false);
  const [recoveredSetCount, setRecoveredSetCount] = useState(0);

  // Guard: workout was already completed today (prevents ghost session creation
  // if the logger remounts after a successful finish — see fix for Keith Berens
  // "crashes back into empty workout" report).
  const [alreadyCompletedToday, setAlreadyCompletedToday] = useState(false);

  // Completion lock — prevents duplicate finish calls (useRef to avoid re-render loops)
  const isCompletingRef = useRef(false);
  // Done-button lock — prevents double-fires of the post-summary navigation
  const doneClickedRef = useRef(false);

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

  // Helper to restore exercise logs from DB into exercise state
  const restoreLogsIntoState = (logs: any[], clientUnit: string) => {
    let restoredCount = 0;
    setExercises(prev => {
      const updated = [...prev];
      logs.forEach(log => {
        const exIdx = updated.findIndex(e => e.id === log.exercise_id);
        if (exIdx === -1) return;
        const setIdx = updated[exIdx].logs.findIndex(l => l.setNumber === log.set_number);
        if (setIdx === -1) return;
        const storedUnit = (log as any).weight_unit || 'lbs';
        const displayWeight = log.weight != null
          ? normalizeToClientUnit(log.weight, storedUnit, clientUnit)
          : undefined;
        updated[exIdx].logs[setIdx] = {
          ...updated[exIdx].logs[setIdx],
          weight: displayWeight,
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
    return restoredCount;
  };

  // Create in_progress session on mount OR restore resumed session
  useEffect(() => {
    if (!user) return;
    // Session init
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
          .select("exercise_id, set_number, weight, reps, rir, rpe, notes, tempo, weight_unit")
          .eq("session_id", resumeSessionId)
          .order("set_number");
        if (logs && logs.length > 0) {
          const count = restoreLogsIntoState(logs, clientWeightUnit);
          if (count > 0) {
            setRecoveredSetCount(count);
            setShowRecoveryBanner(true);
          }
        }
        setSessionId(resumeSessionId);
      } else {
        // Before creating a new session, check for an existing in_progress session
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        const { data: existingSession } = await supabase
          .from("workout_sessions")
          .select("id, started_at")
          .eq("client_id", user.id)
          .eq("workout_id", workoutId)
          .eq("status", "in_progress")
          .gte("last_heartbeat", twoHoursAgo)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingSession) {
          console.log("[WorkoutLogger] Reusing existing in_progress session:", existingSession.id.slice(0, 8));
          setStartTime(new Date(existingSession.started_at).getTime());
          const { data: logs } = await supabase
            .from("exercise_logs")
            .select("exercise_id, set_number, weight, reps, rir, rpe, notes, tempo, weight_unit")
            .eq("session_id", existingSession.id)
            .order("set_number");
          if (logs && logs.length > 0) {
            const count = restoreLogsIntoState(logs, clientWeightUnit);
            if (count > 0) {
              setRecoveredSetCount(count);
              setShowRecoveryBanner(true);
            }
          }
          setSessionId(existingSession.id);
        } else {
          // No existing in_progress session. Before creating a new one, check
          // if this workout was already completed today (calendar self-heal).
          // Without this guard, a parent re-render that remounts the logger
          // after a successful finish would insert an empty ghost session row,
          // which useActiveSession then flips to "completed" with no data —
          // producing the "crashes back into empty workout" symptom.
          const { getLocalDateString } = await import("@/utils/localDate");
          const todayStr = getLocalDateString();
          const { data: completedToday } = await supabase
            .from("calendar_events")
            .select("id")
            .eq("linked_workout_id", workoutId)
            .eq("event_type", "workout")
            .eq("event_date", todayStr)
            .eq("is_completed", true)
            .or(`user_id.eq.${user.id},target_client_id.eq.${user.id}`)
            .limit(1);

          if (completedToday && completedToday.length > 0) {
            console.log("[WorkoutLogger] Workout already completed today — skipping session creation");
            setAlreadyCompletedToday(true);
            return;
          }

          // Safe to create a new session.
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
            weight_unit: item.weight_unit || clientWeightUnit,
            logged_at: new Date().toISOString(),
          } as any, { onConflict: "session_id,exercise_id,set_number" });
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

      // Fetch previous performance per exercise across ALL completed sessions
      if (exerciseIds.length > 0) {
        const { data: allLogs } = await supabase
          .from("exercise_logs")
          .select("exercise_id, set_number, weight, reps, rir, session_id, weight_unit, workout_sessions!inner(created_at, status)")
          .in("exercise_id", exerciseIds)
          .eq("workout_sessions.client_id", user.id)
          .eq("workout_sessions.status", "completed")
          .order("set_number", { ascending: true });

        if (allLogs && allLogs.length > 0) {
          // Build all-time bests per exercise — ALWAYS in lbs for PR comparison
          const bestsMap: Record<string, { weight: number; reps: number }[]> = {};
          const byExercise: Record<string, Record<string, { created_at: string; logs: any[] }>> = {};
          allLogs.forEach((l: any) => {
            const eid = l.exercise_id;
            const sid = l.session_id;
            const sessionCreated = l.workout_sessions?.created_at || "";
            if (!byExercise[eid]) byExercise[eid] = {};
            if (!byExercise[eid][sid]) byExercise[eid][sid] = { created_at: sessionCreated, logs: [] };
            byExercise[eid][sid].logs.push(l);
            // Normalize to lbs for all-time best comparison
            const logUnit = l.weight_unit || 'lbs';
            const w = l.weight ?? 0;
            const wLbs = weightToLbs(w, logUnit);
            const r = l.reps ?? 0;
            if (wLbs > 0 && r > 0) {
              if (!bestsMap[eid]) bestsMap[eid] = [];
              bestsMap[eid].push({ weight: wLbs, reps: r });
            }
          });
          setAllTimeBests(bestsMap);

          const grouped: Record<string, any[]> = {};
          Object.entries(byExercise).forEach(([eid, sessions]) => {
            const latestSession = Object.values(sessions).sort(
              (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            )[0];
            if (latestSession) {
              grouped[eid] = latestSession.logs.sort(
                (a: any, b: any) => (a.set_number || 0) - (b.set_number || 0)
              );
            }
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

  // Volume always calculated in lbs for consistency
  const totalVolume = exercises.reduce((acc, ex) => {
    return acc + ex.logs.filter(l => l.completed).reduce((s, l) => {
      const wLbs = weightToLbs(l.weight || 0, clientWeightUnit);
      return s + (wLbs * (l.reps || 0));
    }, 0);
  }, 0);

  const updateLog = (exIdx: number, setIdx: number, field: string, value: unknown) => {
    const newEx = [...exercises];
    const updatedLog = { ...newEx[exIdx].logs[setIdx], [field]: value };
    newEx[exIdx].logs[setIdx] = updatedLog;
    setExercises(newEx);

    // If RPE or reps is updated on a completed set, re-persist immediately
    if ((field === "rpe" || field === "reps") && updatedLog.completed) {
      persistSet(newEx[exIdx].id, updatedLog);
    }
  };

  const showSaveSuccess = () => {
    setSaveStatus("saved");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
  };

  const checkPR = useCallback((exerciseId: string, exerciseName: string, weightRaw: number, reps: number): boolean => {
    // Normalize weight to lbs for PR comparison (personal_records and allTimeBests are in lbs)
    const weightLbs = weightToLbs(weightRaw, clientWeightUnit);
    if (!weightLbs || weightLbs <= 0 || !reps || reps <= 0) return false;

    // Check against personal_records table (must STRICTLY beat, not match)
    const existingPR = personalRecords.find(pr => pr.exercise_id === exerciseId);
    if (existingPR) {
      const beatsPR = (weightLbs > existingPR.weight) || (weightLbs === existingPR.weight && reps > existingPR.reps);
      if (!beatsPR) return false;
    }

    // Check against ALL historical sets (every completed session ever) — already in lbs
    const historicalSets = allTimeBests[exerciseId] || [];
    for (const prev of historicalSets) {
      if (prev.weight > weightLbs || (prev.weight === weightLbs && prev.reps >= reps)) {
        return false;
      }
    }

    // Check against current session's already-completed sets
    const currentExercise = exercises.find(e => e.id === exerciseId);
    if (currentExercise) {
      for (const log of currentExercise.logs) {
        if (log.completed && log.weight && log.reps) {
          const logLbs = weightToLbs(log.weight, clientWeightUnit);
          if (logLbs > weightLbs || (logLbs === weightLbs && log.reps >= reps)) {
            return false;
          }
        }
      }
    }

    // Also check against PRs already detected this session
    const existingAlert = prAlerts.find(a => a.exerciseName === exerciseName);
    if (existingAlert && (existingAlert.weight > weightLbs || (existingAlert.weight === weightLbs && reps <= existingAlert.reps))) {
      return false;
    }

    const type: "weight" | "rep" = !existingPR || weightLbs > (existingPR?.weight || 0) ? "weight" : "rep";
    setPrAlerts(prev => [
      ...prev.filter(a => a.exerciseName !== exerciseName),
      { exerciseName, weight: weightLbs, reps, type },
    ]);
    toast({ title: "🏆 NEW PR!", description: `${exerciseName}: ${weightRaw} ${weightLabel} × ${reps} reps` });
    return true;
  }, [personalRecords, allTimeBests, prAlerts, exercises, toast, clientWeightUnit, weightLabel]);

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
          rir: log.rir ?? (log.rpe ? Math.round(10 - log.rpe) : null),
          rpe: log.rpe ?? null,
          notes: log.notes || null,
          weight_unit: clientWeightUnit,
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
          weight_unit: clientWeightUnit,
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
        weight_unit: clientWeightUnit,
      });
    }
  };

  // Bug 2 fix: rest timer DISPLAY is decoupled from set save.
  //
  // Previously, the timer trigger read `restSecs` from a variable mutated INSIDE
  // a `setExercises(prev => ...)` updater. Two failure modes existed:
  //   (a) The early-return paths (missing reps, negative weight) returned `prev`
  //       without setting `restSecs`, leaving the post-call read at 0 and skipping
  //       the timer.
  //   (b) Under React 18 concurrent rendering / Strict Mode, the updater can run
  //       deferred or twice; relying on outer-scope mutation timing is unsafe.
  //
  // New approach (per Master Prompt's required architecture):
  //   - Path A (display): read everything we need from the CURRENT `exercises`
  //     state synchronously before any state update, then trigger the timer
  //     immediately. This guarantees 100% timer reliability.
  //   - Path B (save): the functional setExercises updater handles state
  //     transition + autofill; persistSet is fired with values captured up-front.
  //   - Coach-set rest seconds are honored exactly. We only fall back when the
  //     value is missing/invalid (null/undefined/0/NaN).
  const completeSet = (exIdx: number, setIdx: number) => {
    // ── Read snapshot synchronously from current state ──
    const exSnapshot = exercises[exIdx];
    if (!exSnapshot) return;
    const logSnapshot = exSnapshot.logs[setIdx];
    if (!logSnapshot) return;

    const weight = logSnapshot.weight ?? 0;
    if (weight < 0 || !logSnapshot.reps) return;

    const exerciseId = exSnapshot.id;
    // Honor coach-configured rest. Only fall back if the value is missing/invalid.
    const restSecs =
      Number.isFinite(exSnapshot.restSeconds as number) && (exSnapshot.restSeconds as number) > 0
        ? (exSnapshot.restSeconds as number)
        : 90;
    const isPR = checkPR(exSnapshot.id, exSnapshot.name, weight, logSnapshot.reps);
    const completedLogForPersist: ExerciseLogForm["logs"][0] = {
      ...logSnapshot,
      weight,
      completed: true,
      isPR,
    };

    // ── Path A (display): fire timer IMMEDIATELY, before any state update ──
    // This runs in the same React event-handler tick. Wrapped in try/catch so a
    // theoretical setState failure cannot block the save path below.
    try {
      if (restSecs > 0) {
        setRestTimer({ exIdx, setIdx, seconds: restSecs, startedAt: Date.now() });
      }
    } catch (timerErr) {
      console.error("[WorkoutLogger] Rest timer trigger failed:", timerErr);
    }

    // ── Path B (state + save): functional updater for safe React 18 batching ──
    setExercises(prev => {
      const ex = prev[exIdx];
      if (!ex) return prev;
      const log = ex.logs[setIdx];
      if (!log) return prev;
      // Idempotency guard: if already completed (rapid double-tap), no-op.
      if (log.completed) return prev;

      const newExercises = prev.map((e, i) => {
        if (i !== exIdx) return e;
        return { ...e, logs: e.logs.map(l => ({ ...l })) };
      });

      newExercises[exIdx].logs[setIdx] = {
        ...newExercises[exIdx].logs[setIdx],
        weight,
        completed: true,
        isPR,
      };

      // Auto-fill next incomplete set
      const nextIdx = newExercises[exIdx].logs.findIndex((l, i) => i > setIdx && !l.completed);
      if (nextIdx !== -1) {
        if (
          newExercises[exIdx].logs[nextIdx].weight === undefined ||
          newExercises[exIdx].logs[nextIdx].weight === null
        ) {
          newExercises[exIdx].logs[nextIdx].weight = weight;
        }
        if (!newExercises[exIdx].logs[nextIdx].reps) {
          newExercises[exIdx].logs[nextIdx].reps = logSnapshot.reps;
        }
      }

      return newExercises;
    });

    // Persist the set independently — uses values captured at click time.
    persistSet(exerciseId, completedLogForPersist);
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
    if (ex.logs.length <= 1) return;

    const log = ex.logs[setIdx];

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
      // Inherit sets/reps/rest/rir from original; reset logged data to blank
      logs: newEx[switchingExIdx].logs.map(l => ({
        setNumber: l.setNumber,
        weight: undefined,
        reps: undefined,
        tempo: undefined,
        rir: undefined,
        rpe: undefined,
        notes: undefined,
        completed: false,
        isPR: false,
      })),
    };
    setExercises(newEx);

    // Close dialog BEFORE clearing switchingExIdx
    setShowAddExercise(false);
    setSwitchingExIdx(null);
    toast({ title: `Switched to ${exercise.name}` });
  };

  const hasIncompleteSets = () => {
    return exercises.some(ex => ex.logs.some(log => !log.completed));
  };

  const handleFinishTap = () => {
    setShowFinishModal(true);
  };

  const finishWorkout = async (hadUnlogged: boolean = false) => {
    if (!user || !sessionId) return;
    // Prevent duplicate completion calls (rapid taps, double-fires)
    if (isCompletingRef.current) return;
    isCompletingRef.current = true;
    setLoading(true);

    const durationSeconds = Math.floor((Date.now() - startTime) / 1000);

    // Immediately signal to the active-session hook that this session is finishing,
    // so the banner will NOT appear even if we navigate before DB writes commit.
    window.dispatchEvent(new CustomEvent("workout-session-completed", { detail: { sessionId } }));

    try {
      // STEP 1: Save all exercise logs to DB (critical — must complete before teardown)
      const logsToUpsert = exercises.flatMap((ex) =>
        ex.logs.filter(log => log.completed).map((log) => ({
          session_id: sessionId,
          exercise_id: ex.id,
          set_number: log.setNumber,
          weight: log.weight ?? 0,
          reps: log.reps || null,
          tempo: log.tempo || null,
          rir: log.rir ?? (log.rpe ? Math.round(10 - (log.rpe || 0)) : null),
          rpe: log.rpe ?? null,
          notes: log.notes || null,
          weight_unit: clientWeightUnit,
          logged_at: new Date().toISOString(),
        }))
      );

      if (logsToUpsert.length > 0) {
        const { error: logsError } = await supabase
          .from("exercise_logs")
          .upsert(logsToUpsert as any[], { onConflict: "session_id,exercise_id,set_number" });
        if (logsError) {
          console.error("[WorkoutLogger] Logs upsert error:", logsError);
          throw logsError;
        }
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

      // STEP 2: Update session status to "completed" — MUST succeed before showing summary.
      //
      // Bug 1 root-cause defense: we update by id (canonical write) AND additionally
      // close ANY other in_progress sessions this client may have stranded from prior
      // partial finishes (iOS app suspension mid-request, network drops, etc.). This
      // ensures the dashboard banner cannot resurrect from a sibling row.
      const finishPayload = {
        completed_at: new Date().toISOString(),
        duration_seconds: durationSeconds,
        total_volume: totalVolume,
        sets_completed: completedSets,
        pr_count: prAlerts.length,
        status: "completed",
        had_unlogged_sets: hadUnlogged,
        exercise_modifications: exerciseModifications.length > 0 ? exerciseModifications : undefined,
      };

      const { error: sessionError } = await supabase
        .from("workout_sessions")
        .update(finishPayload as any)
        .eq("id", sessionId);
      if (sessionError) {
        console.error("[WorkoutLogger] Session update error:", sessionError);
        throw sessionError;
      }

      // Belt-and-suspenders: close any sibling in_progress sessions for this client.
      // Fire-and-forget — failure here must NOT block the summary screen.
      supabase
        .from("workout_sessions")
        .update({ status: "completed", completed_at: new Date().toISOString() } as any)
        .eq("client_id", user.id)
        .eq("status", "in_progress")
        .then(({ error }) => {
          if (error) console.warn("[WorkoutLogger] Sibling session cleanup warning:", error);
        });

      // STEP 3: Critical writes done — NOW show summary (safe to navigate away)
      setFrozenDuration(durationSeconds);
      setShowSummary(true);
      document.body.style.pointerEvents = '';
      setLoading(false);

      // Dispatch ended event now that DB is committed.
      // Also dispatch workout-session-completed with the sessionId so
      // useActiveSession permanently suppresses the Unfinished Workout
      // banner for this session even if a stale DB query returns it
      // before the row's status flip is visible to the next read.
      window.dispatchEvent(new CustomEvent("workout-session-ended"));
      if (sessionId) {
        window.dispatchEvent(new CustomEvent("workout-session-completed", { detail: { sessionId } }));
      }

      // STEP 4: Non-critical background work (PRs, calendar, XP) — fire-and-forget
      const backgroundWork = async () => {
        try {
          for (const alert of prAlerts) {
            const ex = exercises.find(e => e.name === alert.exerciseName);
            if (ex) {
              await supabase.rpc("update_personal_record", {
                _client_id: user.id, _exercise_id: ex.id, _weight: alert.weight, _reps: alert.reps,
              });
            }
          }

          // Mark calendar event as completed
          const completionTimestamp = new Date().toISOString();
          if (calendarEventId) {
            await supabase
              .from("calendar_events")
              .update({ is_completed: true, completed_at: completionTimestamp })
              .eq("id", calendarEventId);
          } else if (workoutId) {
            // Bug 3 fix: when no explicit calendar_event was passed (ad-hoc
            // launch from Training tab, banner resume, etc.), prefer events
            // up to and including today. Among those, mark TODAY's event
            // first if present; otherwise the most recent missed past event.
            // Never mark a future event as completed.
            const todayStr = new Date().toLocaleDateString("en-CA");
            const { data: calEvents } = await supabase
              .from("calendar_events")
              .select("id, event_date")
              .eq("linked_workout_id", workoutId)
              .eq("event_type", "workout")
              .eq("is_completed", false)
              .lte("event_date", todayStr)
              .or(`user_id.eq.${user.id},target_client_id.eq.${user.id}`)
              .order("event_date", { ascending: false })
              .limit(5);
            if (calEvents?.length) {
              const todayEvent = calEvents.find(e => e.event_date === todayStr);
              const target = todayEvent ?? calEvents[0];
              await supabase
                .from("calendar_events")
                .update({ is_completed: true, completed_at: completionTimestamp })
                .eq("id", target.id);
            }
          }

          // Invalidate dashboard + calendar caches
          const todayStr = format(new Date(), "yyyy-MM-dd");
          invalidateCache(`today-actions-${user.id}-${todayStr}`);

          clearRetryQueue();

          // Auto-score challenge points
          try {
            const { autoScoreChallengePoints } = await import("@/utils/challengeAutoScore");
            const actions: { type: string; count: number }[] = [
              { type: "workout_completed", count: 1 },
            ];
            if (prAlerts.length > 0) {
              actions.push({ type: "personal_best", count: prAlerts.length });
            }
            await autoScoreChallengePoints(user.id, actions);
          } catch (e) {
            console.error("[WorkoutLogger] Challenge auto-score error:", e);
          }

          // Award Ranked XP
          try {
            const { awardXP: directAwardXP, calculateTierAndDivision } = await import("@/utils/rankedXP");
            const xpResult = await directAwardXP(user.id, "workout_completed", XP_VALUES.workout_completed, "Completed workout: " + workoutName);
            const { checkAndAwardBadges } = await import("@/utils/badgeChecker");
            if (xpResult) {
              setSummaryRankData({
                xpEarned: xpResult.xpAwarded,
                tier: xpResult.tier,
                division: xpResult.division,
                divisionXP: xpResult.divisionXP,
                xpNeeded: xpResult.xpNeeded,
                totalXP: xpResult.newTotal,
              });
              const { data: freshProfile } = await (supabase as any)
                .from("ranked_profiles")
                .select("*")
                .eq("user_id", user.id)
                .maybeSingle();
              if (freshProfile) {
                checkAndAwardBadges(user.id, freshProfile, "workout_completed").catch(console.error);
              }
            }
          } catch (e) {
            console.error("[WorkoutLogger] Ranked XP error:", e);
          }
        } catch (bgError) {
          console.error("[WorkoutLogger] Background work error:", bgError);
        }
      };
      backgroundWork(); // fire-and-forget for non-critical work

    } catch (error: any) {
      console.error("[WorkoutLogger] Finish error:", error);
      // Critical save failed — do NOT show summary, let user retry
      isCompletingRef.current = false;
      setLoading(false);
      toast({ title: "Error saving workout", description: "Please try again. Your data is safe.", variant: "destructive" });
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
    window.dispatchEvent(new CustomEvent("workout-session-ended"));
    onComplete?.();
  };


  // Workout was already completed today — show a friendly panel instead of
  // a fresh tracker. Prevents the "back into empty workout" symptom that
  // occurs when the logger remounts after a successful finish.
  if (alreadyCompletedToday) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 space-y-6 bg-background">
        <div className="text-5xl">✅</div>
        <h1 className="text-2xl font-display font-bold text-foreground text-center">
          Workout Already Completed
        </h1>
        <p className="text-sm text-muted-foreground text-center max-w-xs">
          You've already finished {workoutName} today. Nice work.
        </p>
        <button
          onClick={() => {
            onComplete?.();
            navigate("/dashboard", { replace: true });
          }}
          className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (showSummary) {
    return (
      <WorkoutSummary
        workoutName={workoutName}
        durationSeconds={frozenDuration}
        totalSets={totalSets}
        completedSets={completedSets}
        totalVolume={totalVolume}
        exerciseCount={exercises.filter(e => e.logs.some(l => l.completed)).length}
        prs={prAlerts}
        isFirstSession={isFirstSession}
        rankData={summaryRankData}
        onDone={() => {
          // Centralized "finish & navigate home" handler — all dismissal paths call this.
          // Idempotent: safe to call multiple times (rapid taps).
          if (doneClickedRef.current) return;
          doneClickedRef.current = true;

          document.body.style.pointerEvents = '';
          clearRetryQueue();

          // Defensive: ensure the in-progress session row is no longer "in_progress"
          // so the auto-resume guard in Training.tsx will never re-hydrate it.
          if (sessionId) {
            window.dispatchEvent(new CustomEvent("workout-session-completed", { detail: { sessionId } }));
            // Fire-and-forget belt-and-suspenders update — finishWorkout already
            // sets status to "completed", but in rare race conditions the row may
            // still report in_progress on a slow network. This makes it explicit.
            supabase
              .from("workout_sessions")
              .update({ status: "completed" } as any)
              .eq("id", sessionId)
              .then(() => { /* noop */ });
          }
          window.dispatchEvent(new CustomEvent("workout-session-ended"));

          // Invalidate dashboard cache one more time to guarantee cross-off is fresh
          if (user) {
            const todayStr = format(new Date(), "yyyy-MM-dd");
            invalidateCache(`today-actions-${user.id}-${todayStr}`);
          }

          // Close the overlay (resets selectedWorkout in Training/launcher), then
          // navigate with replace semantics so the tracker is NOT on the back stack.
          onComplete?.();
          navigate("/dashboard", { replace: true });
        }}
      />
    );
  }

  return (
    <div className="space-y-4 pb-24">
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
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border -mx-4 -mt-6 px-4 pt-2 pb-3 overflow-hidden">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {}}
              className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <SaveStatusIndicator status={saveStatus} />
          </div>
          <span className="text-lg font-bold tabular-nums text-foreground">{elapsed}</span>
          <Button
            size="sm"
            onClick={handleFinishTap}
            disabled={loading || isCompletingRef.current}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-full px-4 shrink-0"
          >
            {loading && <Loader2 className="animate-spin mr-1 h-3.5 w-3.5" />}
            {loading ? "Saving..." : "Finish"}
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
              <Trophy className="h-3 w-3" /> {pr.exerciseName}: {pr.weight} lbs ×{pr.reps}
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
          clientWeightUnit={clientWeightUnit}
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

      {/* Inline Action Buttons */}
      <div className="mt-6 space-y-3 pb-4">
        <Button
          variant="outline"
          className="w-full gap-2 border-dashed border-border"
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
        <AlertDialogContent className="max-w-sm mx-auto rounded-2xl">
          <AlertDialogHeader className="text-center">
            <AlertDialogTitle className="text-xl font-bold">Cancel Workout?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              Are you sure you want to cancel this workout? All progress will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-3 sm:flex-col mt-2">
            <Button
              onClick={cancelWorkout}
              className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 font-bold text-base"
              size="lg"
            >
              Cancel Workout
            </Button>
            <Button
              variant="secondary"
              className="w-full font-semibold text-base"
              size="lg"
              onClick={() => setShowCancelDialog(false)}
            >
              Resume
            </Button>
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

      {/* Finish Workout Confirmation */}
      <AlertDialog open={showFinishModal} onOpenChange={setShowFinishModal}>
        <AlertDialogContent>
          <div className="flex flex-col items-center text-center space-y-4 py-2">
            <span className="text-4xl">💯</span>
            <AlertDialogTitle className="text-lg font-bold text-foreground">Finished your workout 💯?</AlertDialogTitle>
          </div>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold"
              size="lg"
              onClick={() => {
                setShowFinishModal(false);
                finishWorkout(hasIncompleteSets());
              }}
              disabled={loading || isCompletingRef.current}
            >
              {loading && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
              {loading ? "Saving..." : "Finish"}
            </Button>
            <Button
              variant="secondary"
              className="w-full font-semibold"
              size="lg"
              onClick={() => setShowFinishModal(false)}
            >
              Resume Workout
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
