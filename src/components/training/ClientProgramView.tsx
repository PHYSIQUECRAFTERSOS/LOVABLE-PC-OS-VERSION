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
import { derivePhaseDates } from "@/lib/phaseDates";
import { getLocalDateString } from "@/utils/localDate";
import { useClientProgram } from "@/hooks/useClientProgram";


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
  const {
    assignment: bundledAssignment,
    program: bundledProgram,
    phases: bundledPhases,
    weeks: bundledWeeks,
    loading,
    error: loadError,
    reload: reloadProgram,
  } = useClientProgram(userId);
  const [expandedProgram, setExpandedProgram] = useState<string | null>(null);
  const [phaseDetails, setPhaseDetails] = useState<Record<string, PhaseDetail[]>>({});
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});

  // Preview modal state
  const [previewWorkoutId, setPreviewWorkoutId] = useState<string | null>(null);
  const [previewWorkoutName, setPreviewWorkoutName] = useState("");

  useEffect(() => {
    if (!bundledAssignment || !bundledProgram) {
      if (!loading) setAssignments([]);
      return;
    }

    setAssignments([{
      id: bundledAssignment.id,
      program_id: bundledAssignment.program_id,
      start_date: bundledAssignment.start_date || "",
      status: bundledAssignment.status,
      current_phase_id: bundledAssignment.current_phase_id,
      program: {
        id: bundledProgram.id,
        name: bundledProgram.name,
        description: bundledProgram.description,
        goal_type: bundledProgram.goal_type,
      },
    }]);
  }, [bundledAssignment, bundledProgram, loading]);

  // Fetch first exercise thumbnail for each workout
  const fetchWorkoutThumbnails = async (workoutIds: string[]) => {
    return fetchWorkoutThumbnailSummary(workoutIds);
  };

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
      if (forceReload) await reloadProgram();

      const assignment = assignments.find((item) => item.program_id === programId);
      const sortedPhases = [...bundledPhases].sort(
        (a, b) => (a.phase_order ?? 0) - (b.phase_order ?? 0),
      );
      const derived = derivePhaseDates(assignment?.start_date, sortedPhases as any);
      const today = getLocalDateString();
      const activePhase =
        sortedPhases.find((phase) => derived[phase.id]?.isCurrent) ||
        sortedPhases.find((phase) => phase.id === assignment?.current_phase_id) ||
        [...sortedPhases].reverse().find((phase) => {
          const startDate = derived[phase.id]?.start_date;
          return startDate ? startDate <= today : false;
        }) ||
        sortedPhases[0];

      const sourceGroups = activePhase
        ? [{
            id: activePhase.id,
            name: activePhase.name,
            phase_order: activePhase.phase_order,
            workouts: [
              ...(activePhase.directWorkouts || []),
              ...bundledWeeks
                .filter((week) => week.phase_id === activePhase.id)
                .flatMap((week) => week.workouts || []),
            ],
          }]
        : bundledWeeks.map((week) => ({
            id: week.id,
            name: week.name || `Week ${week.week_number}`,
            phase_order: week.week_number,
            workouts: week.workouts || [],
          }));

      const detail: PhaseDetail[] = sourceGroups.map((group) => ({
        id: group.id,
        name: group.name,
        phase_order: group.phase_order,
        workouts: group.workouts
          .filter((workout, index, rows) =>
            rows.findIndex((candidate) => candidate.workout_id === workout.workout_id) === index
          )
          .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
          .map((workout) => ({
            id: workout.id,
            workout_id: workout.workout_id,
            day_label: workout.day_label,
            sort_order: workout.sort_order ?? null,
            day_of_week: workout.day_of_week,
            workout_name: workout.workout_name || "Workout",
            exclude_from_numbering: workout.exclude_from_numbering || false,
            custom_tag: workout.custom_tag || null,
            thumbnail_url: null,
            exercise_count: 0,
          })),
      }));

      setPhaseDetails((prev) => ({ ...prev, [programId]: detail }));
      writeDetailsCache(userId, programId, detail);
      setLoadingDetails(null);

      const workoutIds = detail.flatMap((phase) => phase.workouts.map((workout) => workout.workout_id));
      void fetchWorkoutThumbnails(workoutIds).then((thumbs) => {
        const enriched = detail.map((phase) => ({
          ...phase,
          workouts: phase.workouts.map((workout) => ({
            ...workout,
            thumbnail_url: thumbs.get(workout.workout_id)?.thumbnail || null,
            exercise_count: thumbs.get(workout.workout_id)?.count || 0,
          })),
        }));
        setPhaseDetails((prev) => ({ ...prev, [programId]: enriched }));
        writeDetailsCache(userId, programId, enriched);
      }).catch((thumbnailError) => {
        console.warn("[ClientProgramView] thumbnails unavailable:", thumbnailError);
      });
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
          <Button variant="outline" size="sm" onClick={() => { void reloadProgram(); }}>
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
