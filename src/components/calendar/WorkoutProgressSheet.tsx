import { useState, useEffect, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface WorkoutProgressSheetProps {
  open: boolean;
  onClose: () => void;
  workoutId: string;
  workoutName: string;
  clientId: string;
}

interface SetLog {
  set_number: number;
  weight: number | null;
  reps: number | null;
  rir: number | null;
  weight_unit: string;
}

interface SessionColumn {
  sessionId: string;
  date: string;
  dateLabel: string;
  exerciseLogs: Map<string, SetLog[]>; // exercise_id -> sets
}

interface ExerciseRow {
  exerciseId: string;
  exerciseName: string;
  maxSets: number;
}

const MAX_SESSIONS = 20;

const WorkoutProgressSheet = ({ open, onClose, workoutId, workoutName, clientId }: WorkoutProgressSheetProps) => {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionColumn[]>([]);
  const [exercises, setExercises] = useState<ExerciseRow[]>([]);
  const [capped, setCapped] = useState(false);

  useEffect(() => {
    if (!open || !workoutId || !clientId) return;
    loadProgress();
  }, [open, workoutId, clientId]);

  const loadProgress = async () => {
    setLoading(true);
    try {
      // 1. Get the workout name to match across programs
      const { data: currentWorkout } = await supabase
        .from("workouts")
        .select("name")
        .eq("id", workoutId)
        .maybeSingle();

      if (!currentWorkout?.name) {
        setLoading(false);
        return;
      }

      const wName = currentWorkout.name;

      // 2. Find ALL workout IDs with the same name (across programs/phases)
      const { data: matchingWorkouts } = await supabase
        .from("workouts")
        .select("id")
        .ilike("name", wName);

      const allWorkoutIds = [...new Set([
        workoutId,
        ...((matchingWorkouts || []).map(w => w.id)),
      ])];

      // 3. Fetch all completed sessions for these workout IDs for this client
      const { data: sessionsData } = await supabase
        .from("workout_sessions")
        .select("id, completed_at, session_date")
        .eq("client_id", clientId)
        .eq("status", "completed")
        .in("workout_id", allWorkoutIds)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: true })
        .limit(100);

      if (!sessionsData || sessionsData.length === 0) {
        setSessions([]);
        setExercises([]);
        setLoading(false);
        return;
      }

      // Cap to most recent MAX_SESSIONS
      const cappedSessions = sessionsData.length > MAX_SESSIONS;
      const displaySessions = cappedSessions
        ? sessionsData.slice(-MAX_SESSIONS)
        : sessionsData;
      setCapped(cappedSessions);

      const sessionIds = displaySessions.map(s => s.id);

      // 4. Fetch all exercise logs for these sessions
      const { data: logs } = await supabase
        .from("exercise_logs")
        .select("session_id, exercise_id, set_number, weight, reps, rir, weight_unit, exercises(name)")
        .in("session_id", sessionIds)
        .order("set_number");

      // 5. Build exercise list (preserving order from most recent session)
      const exerciseOrderMap = new Map<string, { name: string; maxSets: number; firstSeen: number }>();
      let exerciseOrder = 0;

      (logs || []).forEach((log: any) => {
        const exId = log.exercise_id;
        const existing = exerciseOrderMap.get(exId);
        if (!existing) {
          exerciseOrderMap.set(exId, {
            name: log.exercises?.name || "Unknown",
            maxSets: log.set_number,
            firstSeen: exerciseOrder++,
          });
        } else {
          existing.maxSets = Math.max(existing.maxSets, log.set_number);
        }
      });

      const exerciseRows: ExerciseRow[] = Array.from(exerciseOrderMap.entries())
        .sort((a, b) => a[1].firstSeen - b[1].firstSeen)
        .map(([id, info]) => ({
          exerciseId: id,
          exerciseName: info.name,
          maxSets: info.maxSets,
        }));

      // 6. Build session columns
      const sessionColumns: SessionColumn[] = displaySessions.map(s => {
        const sessionLogs = (logs || []).filter((l: any) => l.session_id === s.id);
        const exerciseLogs = new Map<string, SetLog[]>();

        sessionLogs.forEach((l: any) => {
          if (!exerciseLogs.has(l.exercise_id)) {
            exerciseLogs.set(l.exercise_id, []);
          }
          exerciseLogs.get(l.exercise_id)!.push({
            set_number: l.set_number,
            weight: l.weight,
            reps: l.reps,
            rir: l.rir,
            weight_unit: l.weight_unit || "lbs",
          });
        });

        const dateObj = new Date(s.session_date || s.completed_at!);
        return {
          sessionId: s.id,
          date: s.session_date || s.completed_at!.split("T")[0],
          dateLabel: format(dateObj, "d MMM"),
          exerciseLogs,
        };
      });

      setSessions(sessionColumns);
      setExercises(exerciseRows);
    } catch (err) {
      console.error("[WorkoutProgressSheet] load error:", err);
    } finally {
      setLoading(false);
    }
  };

  const getCellContent = (session: SessionColumn, exerciseId: string, setNum: number) => {
    const sets = session.exerciseLogs.get(exerciseId);
    if (!sets) return null;
    return sets.find(s => s.set_number === setNum) || null;
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="h-[85vh] p-0 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-foreground truncate">{workoutName}</h2>
            {!loading && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {sessions.length} session{sessions.length !== 1 ? "s" : ""}
                {capped && ` (showing last ${MAX_SESSIONS})`}
              </p>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length < 2 ? (
            <div className="flex items-center justify-center h-full px-6">
              <p className="text-sm text-muted-foreground text-center">
                No previous sessions to compare yet. Keep training and your progress will appear here.
              </p>
            </div>
          ) : (
            <div className="h-full overflow-auto">
              <table className="border-collapse w-max min-w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-background">
                    {/* Pinned header */}
                    <th className="sticky left-0 z-20 bg-background border-b border-r border-border px-3 py-2 text-left text-xs font-medium text-muted-foreground min-w-[160px] max-w-[200px]">
                      Exercise / Set
                    </th>
                    {sessions.map(s => (
                      <th
                        key={s.sessionId}
                        className="border-b border-border px-3 py-2 text-center text-xs font-medium text-muted-foreground whitespace-nowrap min-w-[100px]"
                      >
                        {s.dateLabel}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {exercises.map((ex) => (
                    <>
                      {/* Exercise name row */}
                      <tr key={`name-${ex.exerciseId}`} className="bg-secondary/30">
                        <td
                          className="sticky left-0 z-10 bg-secondary/30 border-r border-border px-3 py-2 text-xs font-semibold text-primary truncate max-w-[200px]"
                          colSpan={1}
                        >
                          {ex.exerciseName}
                        </td>
                        {sessions.map(s => (
                          <td key={s.sessionId} className="bg-secondary/30 px-3 py-2" />
                        ))}
                      </tr>
                      {/* Set rows */}
                      {Array.from({ length: ex.maxSets }, (_, i) => i + 1).map(setNum => (
                        <tr key={`${ex.exerciseId}-set-${setNum}`} className="border-b border-border/30">
                          <td className="sticky left-0 z-10 bg-background border-r border-border px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap">
                            Set {setNum}
                          </td>
                          {sessions.map(s => {
                            const cell = getCellContent(s, ex.exerciseId, setNum);
                            if (!cell) {
                              return (
                                <td key={s.sessionId} className="px-3 py-1.5 text-center text-xs text-muted-foreground/50">
                                  --
                                </td>
                              );
                            }
                            return (
                              <td key={s.sessionId} className="px-3 py-1.5 text-center">
                                <span className="text-xs font-medium text-foreground tabular-nums">
                                  {cell.reps ?? "—"} × {cell.weight ?? 0} lbs
                                </span>
                                {cell.rir != null && (
                                  <span className="block text-[10px] text-muted-foreground">
                                    RIR: {cell.rir}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default WorkoutProgressSheet;
