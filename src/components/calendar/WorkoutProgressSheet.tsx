import { useState, useEffect, useRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, X, Dumbbell } from "lucide-react";
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
  exerciseLogs: Map<string, SetLog[]>;
  isCurrent: boolean;
}

interface ExerciseRow {
  exerciseId: string;
  exerciseName: string;
  maxSets: number;
  thumbnail: string | null;
}

const MAX_SESSIONS = 20;

const WorkoutProgressSheet = ({ open, onClose, workoutId, workoutName, clientId }: WorkoutProgressSheetProps) => {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionColumn[]>([]);
  const [exercises, setExercises] = useState<ExerciseRow[]>([]);
  const [capped, setCapped] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !workoutId || !clientId) return;
    loadProgress();
  }, [open, workoutId, clientId]);

  // Auto-scroll to newest (rightmost) column when data loads
  useEffect(() => {
    if (!loading && sessions.length > 0 && scrollRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
        }
      });
    }
  }, [loading, sessions]);

  const loadProgress = async () => {
    setLoading(true);
    try {
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

      const { data: matchingWorkouts } = await supabase
        .from("workouts")
        .select("id")
        .ilike("name", wName);

      const allWorkoutIds = [...new Set([
        workoutId,
        ...((matchingWorkouts || []).map(w => w.id)),
      ])];

      const { data: sessionsData } = await supabase
        .from("workout_sessions")
        .select("id, completed_at, session_date, workout_id")
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

      const cappedSessions = sessionsData.length > MAX_SESSIONS;
      const displaySessions = cappedSessions
        ? sessionsData.slice(-MAX_SESSIONS)
        : sessionsData;
      setCapped(cappedSessions);

      const sessionIds = displaySessions.map(s => s.id);

      const { data: logs } = await supabase
        .from("exercise_logs")
        .select("session_id, exercise_id, set_number, weight, reps, rir, weight_unit, exercises(name, youtube_url, video_url, youtube_thumbnail)")
        .in("session_id", sessionIds)
        .order("set_number");

      const extractYouTubeId = (url?: string | null): string | null => {
        if (!url) return null;
        const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
        return m ? m[1] : null;
      };
      const resolveThumb = (ex: any): string | null => {
        if (!ex) return null;
        if (ex.youtube_thumbnail) return ex.youtube_thumbnail;
        const id = extractYouTubeId(ex.youtube_url) || extractYouTubeId(ex.video_url);
        return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
      };

      const exerciseOrderMap = new Map<string, { name: string; maxSets: number; firstSeen: number; thumbnail: string | null }>();
      let exerciseOrder = 0;

      (logs || []).forEach((log: any) => {
        const exId = log.exercise_id;
        const existing = exerciseOrderMap.get(exId);
        if (!existing) {
          exerciseOrderMap.set(exId, {
            name: log.exercises?.name || "Unknown",
            maxSets: log.set_number,
            firstSeen: exerciseOrder++,
            thumbnail: resolveThumb(log.exercises),
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
          thumbnail: info.thumbnail,
        }));

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
          isCurrent: s.workout_id === workoutId,
        };
      });

      // Mark only the most recent matching session as "current"
      const currentIdx = [...sessionColumns].reverse().findIndex(s => s.isCurrent);
      sessionColumns.forEach((s, i) => {
        s.isCurrent = currentIdx >= 0 && i === sessionColumns.length - 1 - currentIdx;
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
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        {/* Custom overlay at z-[84] — above EventDetailModal Dialog (z-70) */}
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[84] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        {/* Custom content at z-[85] — bottom sheet */}
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-[85] flex flex-col",
            "h-[92vh] bg-background border-t border-border shadow-2xl",
            "rounded-t-2xl overflow-hidden",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
            "data-[state=closed]:duration-300 data-[state=open]:duration-400"
          )}
        >
          <DialogPrimitive.Title className="sr-only">{workoutName} — Workout Progress</DialogPrimitive.Title>

          {/* Drag handle */}
          <div className="flex justify-center pt-2 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Sticky header */}
          <div className="flex items-center justify-between px-4 pt-2 pb-3 border-b border-border shrink-0 bg-background">
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
              <div ref={scrollRef} className="h-full overflow-auto">
                <table className="border-collapse w-max min-w-full">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-background">
                      <th className="sticky left-0 z-20 bg-background border-b border-r border-border px-3 py-2 text-left text-xs font-medium text-muted-foreground min-w-[160px] max-w-[200px]">
                        Exercise / Set
                      </th>
                      {sessions.map(s => (
                        <th
                          key={s.sessionId}
                          className={cn(
                            "border-b border-border px-3 py-2 text-center text-xs font-medium whitespace-nowrap min-w-[100px]",
                            s.isCurrent
                              ? "text-primary border-l-2 border-l-primary bg-primary/5"
                              : "text-muted-foreground"
                          )}
                        >
                          {s.dateLabel}
                          {s.isCurrent && <span className="block text-[9px] mt-0.5">CURRENT</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {exercises.map((ex) => (
                      <>
                        <tr key={`name-${ex.exerciseId}`} className="bg-secondary/30">
                          <td
                            className="sticky left-0 z-10 bg-secondary/30 border-r border-border px-3 py-2 text-xs font-semibold text-primary max-w-[200px]"
                            colSpan={1}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="h-7 w-7 rounded-md bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
                                {ex.thumbnail ? (
                                  <img
                                    src={ex.thumbnail}
                                    alt=""
                                    loading="lazy"
                                    className="h-full w-full object-cover pointer-events-none"
                                    onError={(e) => {
                                      const img = e.currentTarget;
                                      img.style.display = "none";
                                      const fallback = img.nextElementSibling as HTMLElement | null;
                                      if (fallback) fallback.style.display = "block";
                                    }}
                                  />
                                ) : null}
                                <Dumbbell
                                  className="h-3.5 w-3.5 text-muted-foreground"
                                  style={{ display: ex.thumbnail ? "none" : "block" }}
                                />
                              </div>
                              <span className="truncate">{ex.exerciseName}</span>
                            </div>
                          </td>
                          {sessions.map(s => (
                            <td
                              key={s.sessionId}
                              className={cn(
                                "bg-secondary/30 px-3 py-2",
                                s.isCurrent && "border-l-2 border-l-primary"
                              )}
                            />
                          ))}
                        </tr>
                        {Array.from({ length: ex.maxSets }, (_, i) => i + 1).map(setNum => (
                          <tr key={`${ex.exerciseId}-set-${setNum}`} className="border-b border-border/30">
                            <td className="sticky left-0 z-10 bg-background border-r border-border px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap">
                              Set {setNum}
                            </td>
                            {sessions.map(s => {
                              const cell = getCellContent(s, ex.exerciseId, setNum);
                              const cellClass = cn(
                                "px-3 py-1.5 text-center",
                                s.isCurrent && "border-l-2 border-l-primary bg-primary/5"
                              );
                              if (!cell) {
                                return (
                                  <td key={s.sessionId} className={cn(cellClass, "text-xs text-muted-foreground/50")}>
                                    --
                                  </td>
                                );
                              }
                              return (
                                <td key={s.sessionId} className={cellClass}>
                                  <span className="text-xs font-medium text-foreground tabular-nums">
                                    {(cell.weight == null || cell.weight === 0) ? "BW" : `${cell.weight} ${cell.weight_unit || "lbs"}`} × {(cell.reps == null || cell.reps === 0) ? "--" : `${cell.reps} reps`}
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
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default WorkoutProgressSheet;
