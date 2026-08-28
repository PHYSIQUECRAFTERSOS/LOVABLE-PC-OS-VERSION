import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, ChevronDown, ChevronUp, Calendar, Dumbbell, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import WorkoutPreviewModal from "./WorkoutPreviewModal";
import { fetchWorkoutThumbnailSummary } from "@/lib/workoutExerciseQueries";
import ExportPdfButton from "@/components/common/ExportPdfButton";
import { sortWorkoutsChronologically } from "@/utils/workoutOrder";
import { withRetry } from "@/lib/resilientFetch";

const GOAL_LABELS: Record<string, string> = {
  hypertrophy: "Hypertrophy", strength: "Strength", fat_loss: "Fat Loss",
  powerbuilding: "Powerbuilding", athletic: "Athletic", general: "General Fitness",
  recomp: "Recomp", muscle_gain: "Muscle Gain",
};

// Last-good program workouts persisted per user+program. A dropped request on
// mobile should never wipe a client's training list.
const detailsCacheKey = (userId: string, programId: string) =>
  `pc:programDetails:${userId}:${programId}`;

function readDetailsCache(userId: string | undefined, programId: string): any[] | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(detailsCacheKey(userId, programId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.phases) ? parsed.phases : null;
  } catch {
    return null;
  }
}

function writeDetailsCache(userId: string | undefined, programId: string, phases: any[]) {
  if (!userId) return;
  try {
    localStorage.setItem(
      detailsCacheKey(userId, programId),
      JSON.stringify({ phases, ts: Date.now() }),
    );
  } catch {
    /* quota / private mode — cache is best-effort */
  }
}

interface ClientProgramViewProps {
  onStartWorkout: (workoutId: string) => void;
}

interface ProgramAssignment {
  id: string;
  program_id: string;
  start_date: string;
  status: string;
  current_phase_id?: string | null;
  program: {
    id: string;
    name: string;
    description: string | null;
    goal_type: string | null;
  };
}

interface PhaseDetail {
  id: string;
  name: string;
  phase_order: number;
  workouts: {
    id: string;
    workout_id: string;
    day_label: string | null;
    sort_order: number | null;
    day_of_week: number | null;
    workout_name: string;
    exclude_from_numbering?: boolean;
    custom_tag?: string | null;
    thumbnail_url?: string | null;
    exercise_count?: number;
  }[];
}

const ClientProgramView = ({ onStartWorkout }: ClientProgramViewProps) => {
  const { user, session } = useAuth();
  const userId = user?.id;
  const [assignments, setAssignments] = useState<ProgramAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [expandedProgram, setExpandedProgram] = useState<string | null>(null);
  const [phaseDetails, setPhaseDetails] = useState<Record<string, PhaseDetail[]>>({});
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});

  // Preview modal state
  const [previewWorkoutId, setPreviewWorkoutId] = useState<string | null>(null);
  const [previewWorkoutName, setPreviewWorkoutName] = useState("");

  useEffect(() => {
    if (!userId || !session) return;
    const load = async () => {
      setLoadError(null);
      if (assignments.length === 0) setLoading(true);
      try {
      const { data: cpa, error: cpaErr } = await withRetry(
        async () => await supabase
          .from("client_program_assignments")
          .select("id, program_id, start_date, status, current_phase_id")
          .eq("client_id", userId)
          .in("status", ["active", "subscribed"])
          .order("created_at", { ascending: false }),
        { label: "training assignments", attempts: 2, timeoutMs: 8000 },
      );

      if (cpaErr) throw cpaErr;
      console.log("[ClientProgramView] assignments:", cpa?.length ?? 0);

      if (!cpa || cpa.length === 0) {
        const { data: directPrograms, error: directError } = await withRetry(
          async () => await supabase
            .from("programs")
            .select("id, name, description, goal_type")
            .eq("client_id", userId)
            .eq("is_template", false)
            .order("created_at", { ascending: false }),
          { label: "direct training programs", attempts: 2, timeoutMs: 8000 },
        );
        if (directError) throw directError;

        console.log("[ClientProgramView] directPrograms fallback:", directPrograms?.length ?? 0);
        if (directPrograms && directPrograms.length > 0) {
          setAssignments(directPrograms.map(p => ({
            id: p.id, program_id: p.id, start_date: "", status: "active",
            program: p,
          })));
        }
        setLoading(false);
        return;
      }

      const programIds = [...new Set(cpa.map(a => a.program_id))];
      const { data: programs, error: progErr } = await withRetry(
        async () => await supabase
          .from("programs")
          .select("id, name, description, goal_type")
          .in("id", programIds),
        { label: "assigned training programs", attempts: 2, timeoutMs: 8000 },
      );

      if (progErr) throw progErr;
      console.log("[ClientProgramView] programs fetched:", programs?.length ?? 0, "for IDs:", programIds);

      const programMap = new Map((programs || []).map(p => [p.id, p]));
      const merged: ProgramAssignment[] = cpa
        .filter(a => programMap.has(a.program_id))
        .map(a => ({ ...a, program: programMap.get(a.program_id)! }));

      const seen = new Set<string>();
      const deduped = merged.filter(a => {
        if (seen.has(a.program_id)) return false;
        seen.add(a.program_id);
        return true;
      });

      setAssignments(deduped);
      setLoading(false);
      } catch (err: any) {
        console.error("[ClientProgramView] load error:", err);
        setLoadError(err?.message || "Training could not be loaded.");
        setLoading(false);
      }
    };
    load();
  }, [userId, session, loadAttempt]); // assignments intentionally retained during retries

  // Fetch first exercise thumbnail for each workout
  const fetchWorkoutThumbnails = async (workoutIds: string[]) => {
    return fetchWorkoutThumbnailSummary(workoutIds);
  };

  // Every program-detail read goes through the same retry/timeout budget so a
  // single dropped request on mobile can't dead-end the workout list.
  const q = <T,>(fn: () => any, label: string): Promise<T> =>
    withRetry(async () => {
      const { data, error } = await fn();
      if (error) throw error;
      return data as T;
    }, { label, attempts: 3, timeoutMs: 10000 });

  const toggleProgram = async (programId: string, forceReload = false) => {
    if (!session) { console.warn("[ClientProgramView] toggleProgram blocked — no session"); return; }
    if (expandedProgram === programId && !forceReload) {
      setExpandedProgram(null);
      return;
    }
    setExpandedProgram(programId);
    if (phaseDetails[programId] && !forceReload) return;

    // Paint the last-known workouts instantly while we revalidate.
    const cached = readDetailsCache(userId, programId);
    if (cached && !phaseDetails[programId]) {
      setPhaseDetails((prev) => ({ ...prev, [programId]: cached as PhaseDetail[] }));
    }

    setLoadingDetails(cached ? null : programId);
    setDetailErrors((prev) => {
      const next = { ...prev };
      delete next[programId];
      return next;
    });


    try {
    // Clients only see their CURRENT phase — never future phases.
    const assignment = assignments.find(a => a.program_id === programId);
    const currentPhaseId = assignment?.current_phase_id || null;

    const phasesRaw = await q<any[]>(
      () => supabase
        .from("program_phases")
        .select("id, name, phase_order")
        .eq("program_id", programId)
        .order("phase_order"),
      "training phases",
    );

    // Restrict to the active phase. Fallback to the first phase if no
    // current_phase_id is set yet (newly-assigned client).
    let phases = phasesRaw || [];
    if (phases.length > 0) {
      const active = currentPhaseId
        ? phases.find(p => p.id === currentPhaseId)
        : phases[0];
      phases = active ? [active] : [phases[0]];
    }

    const buildDetails = async (rawPhases: any[], allPwRows: any[]) => {
      const workoutIds = [...new Set(allPwRows.map(pw => pw.workout_id))];
      const [workoutsResult, thumbsResult] = await Promise.allSettled([
        workoutIds.length > 0
          ? q<any[]>(() => supabase.from("workouts").select("id, name").in("id", workoutIds), "program workouts names")
          : Promise.resolve([] as any[]),
        fetchWorkoutThumbnails(workoutIds),
      ]);
      if (workoutsResult.status === "rejected") throw workoutsResult.reason;
      const workoutsRes = { data: workoutsResult.value } as any;
      const thumbs = thumbsResult.status === "fulfilled" ? thumbsResult.value : new Map();
      const wMap = new Map(((workoutsRes as any).data || []).map((w: any) => [w.id, w.name]));

      return rawPhases.map(phase => ({
        ...phase,
        workouts: allPwRows
          .filter((pw: any) => {
            if (pw.phase_id === phase.id) return true;
            if (pw._resolvedPhaseId === phase.id) return true;
            return false;
          })
          .filter((pw: any, idx: number, arr: any[]) =>
            arr.findIndex((x: any) => x.workout_id === pw.workout_id) === idx
          )
          .sort((a: any, b: any) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
          .map((pw: any) => ({
            id: pw.id,
            workout_id: pw.workout_id,
            day_label: pw.day_label,
            sort_order: pw.sort_order,
            day_of_week: pw.day_of_week,
            workout_name: wMap.get(pw.workout_id) || "Workout",
            exclude_from_numbering: pw.exclude_from_numbering || false,
            custom_tag: pw.custom_tag || null,
            thumbnail_url: thumbs.get(pw.workout_id)?.thumbnail || null,
            exercise_count: thumbs.get(pw.workout_id)?.count || 0,
          })),
      }));
    };

    if (!phases || phases.length === 0) {
      const weeks = await q<any[]>(
        () => supabase
          .from("program_weeks")
          .select("id, week_number, name, phase_id")
          .eq("program_id", programId)
          .order("week_number"),
        "program weeks",
      );

      if (weeks && weeks.length > 0) {
        const weekIds = weeks.map(w => w.id);
        const pwRows = await q<any[]>(
          () => supabase
            .from("program_workouts")
            .select("id, week_id, workout_id, day_of_week, day_label, sort_order, exclude_from_numbering, custom_tag")
            .in("week_id", weekIds)
            .order("sort_order"),
          "week workouts",
        );

        const fakePhases = weeks.map(w => ({
          id: w.id, name: w.name || `Week ${w.week_number}`, phase_order: w.week_number,
        }));
        const annotated = (pwRows || []).map(pw => ({
          ...pw, _resolvedPhaseId: pw.week_id, phase_id: pw.week_id,
        }));

        const detail = await buildDetails(fakePhases, annotated);
        setPhaseDetails(prev => ({ ...prev, [programId]: detail }));
        writeDetailsCache(userId, programId, detail);
      } else {
        const directWorkouts = await q<any[]>(
          () => supabase
            .from("workouts")
            .select("id, name")
            .eq("client_id", userId || "")
            .order("created_at"),
          "direct workouts",
        );

        if (directWorkouts && directWorkouts.length > 0) {
          const thumbsSettled = await Promise.allSettled([
            fetchWorkoutThumbnails(directWorkouts.map(w => w.id)),
          ]);
          const thumbs = thumbsSettled[0].status === "fulfilled" ? thumbsSettled[0].value : new Map();
          const detail = [{
            id: "direct", name: "Workouts", phase_order: 1,
            workouts: directWorkouts.map((w, i) => ({
              id: w.id, workout_id: w.id, day_label: `Day ${i + 1}`,
              sort_order: i, day_of_week: i, workout_name: w.name,
              thumbnail_url: thumbs.get(w.id)?.thumbnail || null,
              exercise_count: thumbs.get(w.id)?.count || 0,
            })),
          }] as any;
          setPhaseDetails(prev => ({ ...prev, [programId]: detail }));
          writeDetailsCache(userId, programId, detail);
        } else {
          setPhaseDetails(prev => ({ ...prev, [programId]: [] }));
          writeDetailsCache(userId, programId, []);
        }
      }
      setLoadingDetails(null);
      return;
    }

    const phaseIds = phases.map(p => p.id);
    const pwRows = await q<any[]>(
      () => supabase
        .from("program_workouts")
        .select("id, phase_id, workout_id, day_of_week, day_label, sort_order, exclude_from_numbering, custom_tag")
        .in("phase_id", phaseIds)
        .order("sort_order"),
      "phase workouts",
    );

    const weekRows = await q<any[]>(
      () => supabase
        .from("program_weeks")
        .select("id, phase_id")
        .in("phase_id", phaseIds),
      "phase weeks",
    );

    let weekWorkouts: any[] = [];
    if (weekRows && weekRows.length > 0) {
      const weekIds = weekRows.map(w => w.id);
      weekWorkouts = (await q<any[]>(
        () => supabase
          .from("program_workouts")
          .select("id, week_id, workout_id, day_of_week, day_label, sort_order, exclude_from_numbering, custom_tag")
          .in("week_id", weekIds)
          .order("sort_order"),
        "week workouts",
      )) || [];
    }

    const weekToPhase = new Map((weekRows || []).map(w => [w.id, w.phase_id]));
    const allPwRows = [
      ...(pwRows || []),
      ...(weekWorkouts || []).map(ww => ({
        ...ww,
        _resolvedPhaseId: weekToPhase.get(ww.week_id),
      })),
    ];

    const detail = await buildDetails(phases, allPwRows);
    setPhaseDetails(prev => ({ ...prev, [programId]: detail }));
    writeDetailsCache(userId, programId, detail);
    setLoadingDetails(null);
    } catch (err: any) {
      console.error("[ClientProgramView] toggleProgram error:", err);
      // Keep showing the last-good list rather than a dead-end error card.
      const fallback = readDetailsCache(userId, programId);
      if (fallback && fallback.length > 0) {
        setPhaseDetails((prev) => ({ ...prev, [programId]: prev[programId] ?? (fallback as PhaseDetail[]) }));
      } else {
        setDetailErrors((prev) => ({ ...prev, [programId]: err?.message || "Workouts could not be loaded." }));
      }
      setLoadingDetails(null);
    }

  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (assignments.length === 0) {
    if (loadError) {
      return (
        <Card><CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
          <p className="text-sm text-muted-foreground">Your training program couldn't be loaded.</p>
          <Button variant="outline" size="sm" onClick={() => setLoadAttempt((value) => value + 1)}>
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
        </CardContent></Card>
      );
    }
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground text-sm">
            No programs assigned yet. Your coach will assign a program to you.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {userId && assignments.length > 0 && (
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">My Training Program</h3>
            <ExportPdfButton kind="training" clientId={userId} variant="labeled" />
          </div>
        )}
        {assignments.map((assignment) => (
          <Card key={assignment.id} className="overflow-hidden">
            <div
              className="flex items-center justify-between px-4 py-4 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => toggleProgram(assignment.program_id)}
            >
              <div className="space-y-1">
                <h3 className="font-semibold text-foreground">{assignment.program.name}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {assignment.program.goal_type && (
                    <Badge variant="secondary" className="text-[10px]">
                      {GOAL_LABELS[assignment.program.goal_type] || assignment.program.goal_type}
                    </Badge>
                  )}
                  {assignment.start_date && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <Calendar className="h-2.5 w-2.5" />
                      {new Date(assignment.start_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              {expandedProgram === assignment.program_id
                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>

            {expandedProgram === assignment.program_id && (
              <CardContent className="pt-0 space-y-4">
                {assignment.program.description && (
                  <p className="text-xs text-muted-foreground">{assignment.program.description}</p>
                )}

                {loadingDetails === assignment.program_id ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : detailErrors[assignment.program_id] ? (
                  <div className="flex flex-col items-center gap-2 py-4 text-center">
                    <p className="text-xs text-muted-foreground">Workouts couldn't be loaded.</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void toggleProgram(assignment.program_id, true);
                      }}
                    >
                      <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry
                    </Button>
                  </div>
                ) : (phaseDetails[assignment.program_id] || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No workouts found in this program yet.
                  </p>
                ) : (
                  (phaseDetails[assignment.program_id] || []).map((phase) => (
                    <div key={phase.id} className="space-y-2">
                      <h4 className="text-sm font-medium text-foreground">{phase.name}</h4>
                      {phase.workouts.length === 0 ? (
                        <p className="text-xs text-muted-foreground pl-2">No workouts in this phase</p>
                      ) : (
                        <div className="space-y-2">
                          {(() => {
                            // Order workouts by the "Day N" prefix in the
                            // authored name (Trainerize-style) and drop the
                            // auto "Day N" badge so the verbatim name shows.
                            const ordered = sortWorkoutsChronologically(
                              phase.workouts.map((w) => ({ ...w, name: w.workout_name }))
                            ) as typeof phase.workouts;
                            return ordered.map((pw) => {
                              const isExcluded = pw.exclude_from_numbering;
                              const pos: number | null = null;
                              return (
                                <div key={pw.id} className="flex items-start gap-3 p-3 border rounded-lg bg-card/50">
                                  {/* Thumbnail — clickable to preview */}
                                  <button
                                    className="h-14 w-14 rounded-lg overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all"
                                    onClick={() => {
                                      setPreviewWorkoutId(pw.workout_id);
                                      setPreviewWorkoutName(pw.workout_name);
                                    }}
                                  >
                                    {pw.thumbnail_url ? (
                                      <img
                                        src={pw.thumbnail_url}
                                        alt={pw.workout_name}
                                        className="h-full w-full object-cover"
                                        loading="lazy"
                                      />
                                    ) : (
                                      <Dumbbell className="h-5 w-5 text-muted-foreground/50" />
                                    )}
                                  </button>

                                  {/* Name + meta — clickable to preview */}
                                  <button
                                    className="flex-1 min-w-0 text-left cursor-pointer"
                                    onClick={() => {
                                      setPreviewWorkoutId(pw.workout_id);
                                      setPreviewWorkoutName(pw.workout_name);
                                    }}
                                  >
                                    <div className="flex items-start gap-1.5 flex-wrap">
                                      {isExcluded && pw.custom_tag ? (
                                        <Badge className="text-[9px] h-4 shrink-0 bg-slate-600/30 text-slate-300 border-slate-500/30">{pw.custom_tag}</Badge>
                                      ) : pos != null ? (
                                        <Badge variant="outline" className="text-[9px] h-4 shrink-0 mt-0.5">Day {pos}</Badge>
                                      ) : null}
                                      <p className="text-sm font-medium break-words whitespace-normal flex-1 min-w-0">{pw.workout_name}</p>
                                    </div>

                                    {(pw.exercise_count ?? 0) > 0 && (
                                      <p className="text-[11px] text-muted-foreground mt-0.5">
                                        {pw.exercise_count} exercise{pw.exercise_count !== 1 ? "s" : ""}
                                      </p>
                                    )}
                                  </button>

                                  <Button
                                    size="sm"
                                    className="shrink-0"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onStartWorkout(pw.workout_id);
                                    }}
                                  >

                                    <Play className="h-3.5 w-3.5 mr-1" /> Start
                                  </Button>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {/* Workout Preview Modal */}
      <WorkoutPreviewModal
        open={!!previewWorkoutId}
        onOpenChange={(open) => { if (!open) setPreviewWorkoutId(null); }}
        workoutId={previewWorkoutId}
        workoutName={previewWorkoutName}
        onStartWorkout={onStartWorkout}
      />
    </>
  );
};

export default ClientProgramView;
