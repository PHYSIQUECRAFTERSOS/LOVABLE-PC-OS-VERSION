import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, ChevronDown, ChevronUp, Calendar, Dumbbell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import WorkoutPreviewModal from "./WorkoutPreviewModal";
import { fetchWorkoutThumbnailSummary } from "@/lib/workoutExerciseQueries";

const GOAL_LABELS: Record<string, string> = {
  hypertrophy: "Hypertrophy", strength: "Strength", fat_loss: "Fat Loss",
  powerbuilding: "Powerbuilding", athletic: "Athletic", general: "General Fitness",
  recomp: "Recomp", muscle_gain: "Muscle Gain",
};

interface ClientProgramViewProps {
  onStartWorkout: (workoutId: string) => void;
}

interface ProgramAssignment {
  id: string;
  program_id: string;
  start_date: string;
  status: string;
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
  const [expandedProgram, setExpandedProgram] = useState<string | null>(null);
  const [phaseDetails, setPhaseDetails] = useState<Record<string, PhaseDetail[]>>({});
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);

  // Preview modal state
  const [previewWorkoutId, setPreviewWorkoutId] = useState<string | null>(null);
  const [previewWorkoutName, setPreviewWorkoutName] = useState("");

  useEffect(() => {
    if (!userId || !session) return;
    const load = async () => {
      try {
      const { data: cpa, error: cpaErr } = await supabase
        .from("client_program_assignments")
        .select("id, program_id, start_date, status")
        .eq("client_id", userId)
        .in("status", ["active", "subscribed"])
        .order("created_at", { ascending: false });

      if (cpaErr) console.error("[ClientProgramView] assignments query error:", cpaErr);
      console.log("[ClientProgramView] assignments:", cpa?.length ?? 0);

      if (!cpa || cpa.length === 0) {
        const { data: directPrograms } = await supabase
          .from("programs")
          .select("id, name, description, goal_type")
          .eq("client_id", userId)
          .eq("is_template", false)
          .order("created_at", { ascending: false });

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
      const { data: programs, error: progErr } = await supabase
        .from("programs")
        .select("id, name, description, goal_type")
        .in("id", programIds);

      if (progErr) console.error("[ClientProgramView] programs query error:", progErr);
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
      } catch (err) {
        console.error("[ClientProgramView] load error:", err);
        setLoading(false);
      }
    };
    load();
  }, [userId, session]);

  // Fetch first exercise thumbnail for each workout
  const fetchWorkoutThumbnails = async (workoutIds: string[]) => {
    return fetchWorkoutThumbnailSummary(workoutIds);
  };

  const toggleProgram = async (programId: string) => {
    if (!session) { console.warn("[ClientProgramView] toggleProgram blocked — no session"); return; }
    if (expandedProgram === programId) {
      setExpandedProgram(null);
      return;
    }
    setExpandedProgram(programId);
    if (phaseDetails[programId]) return;

    setLoadingDetails(programId);

    try {
    const { data: phases, error: phaseErr } = await supabase
      .from("program_phases")
      .select("id, name, phase_order")
      .eq("program_id", programId)
      .order("phase_order");
    if (phaseErr) { console.error("[ClientProgramView] phases error:", phaseErr); setPhaseDetails(prev => ({ ...prev, [programId]: [] })); setLoadingDetails(null); return; }

    const buildDetails = async (rawPhases: any[], allPwRows: any[]) => {
      const workoutIds = [...new Set(allPwRows.map(pw => pw.workout_id))];
      const [workoutsResult, thumbsResult] = await Promise.allSettled([
        workoutIds.length > 0
          ? supabase.from("workouts").select("id, name").in("id", workoutIds)
          : Promise.resolve({ data: [] }),
        fetchWorkoutThumbnails(workoutIds),
      ]);
      const workoutsRes = workoutsResult.status === "fulfilled" ? workoutsResult.value : { data: [] };
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
      const { data: weeks } = await supabase
        .from("program_weeks")
        .select("id, week_number, name, phase_id")
        .eq("program_id", programId)
        .order("week_number");

      if (weeks && weeks.length > 0) {
        const weekIds = weeks.map(w => w.id);
        const { data: pwRows } = await supabase
          .from("program_workouts")
          .select("id, week_id, workout_id, day_of_week, day_label, sort_order, exclude_from_numbering, custom_tag")
          .in("week_id", weekIds)
          .order("sort_order");

        const fakePhases = weeks.map(w => ({
          id: w.id, name: w.name || `Week ${w.week_number}`, phase_order: w.week_number,
        }));
        const annotated = (pwRows || []).map(pw => ({
          ...pw, _resolvedPhaseId: pw.week_id, phase_id: pw.week_id,
        }));

        const detail = await buildDetails(fakePhases, annotated);
        setPhaseDetails(prev => ({ ...prev, [programId]: detail }));
      } else {
        const { data: directWorkouts } = await supabase
          .from("workouts")
          .select("id, name")
          .eq("client_id", userId || "")
          .order("created_at");

        if (directWorkouts && directWorkouts.length > 0) {
          const thumbs = await fetchWorkoutThumbnails(directWorkouts.map(w => w.id));
          setPhaseDetails(prev => ({
            ...prev,
            [programId]: [{
              id: "direct", name: "Workouts", phase_order: 1,
              workouts: directWorkouts.map((w, i) => ({
                id: w.id, workout_id: w.id, day_label: `Day ${i + 1}`,
                sort_order: i, day_of_week: i, workout_name: w.name,
                thumbnail_url: thumbs.get(w.id)?.thumbnail || null,
                exercise_count: thumbs.get(w.id)?.count || 0,
              })),
            }],
          }));
        } else {
          setPhaseDetails(prev => ({ ...prev, [programId]: [] }));
        }
      }
      setLoadingDetails(null);
      return;
    }

    const phaseIds = phases.map(p => p.id);
    const { data: pwRows } = await supabase
      .from("program_workouts")
      .select("id, phase_id, workout_id, day_of_week, day_label, sort_order, exclude_from_numbering, custom_tag")
      .in("phase_id", phaseIds)
      .order("sort_order");

    const { data: weekRows } = await supabase
      .from("program_weeks")
      .select("id, phase_id")
      .in("phase_id", phaseIds);

    let weekWorkouts: any[] = [];
    if (weekRows && weekRows.length > 0) {
      const weekIds = weekRows.map(w => w.id);
      const { data: wwRows } = await supabase
        .from("program_workouts")
        .select("id, week_id, workout_id, day_of_week, day_label, sort_order, exclude_from_numbering, custom_tag")
        .in("week_id", weekIds)
        .order("sort_order");
      weekWorkouts = wwRows || [];
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
    setLoadingDetails(null);
    } catch (err) {
      console.error("[ClientProgramView] toggleProgram error:", err);
      setPhaseDetails(prev => ({ ...prev, [programId]: [] }));
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
                            let dayCounter = 1;
                            return phase.workouts.map((pw) => {
                              const isExcluded = pw.exclude_from_numbering;
                              const pos = isExcluded ? null : dayCounter++;
                              return (
                                <div key={pw.id} className="flex items-center gap-3 p-3 border rounded-lg bg-card/50">
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
                                    <div className="flex items-center gap-1.5">
                                      {isExcluded && pw.custom_tag ? (
                                        <Badge className="text-[9px] h-4 shrink-0 bg-slate-600/30 text-slate-300 border-slate-500/30">{pw.custom_tag}</Badge>
                                      ) : pos != null ? (
                                        <Badge variant="outline" className="text-[9px] h-4 shrink-0">Day {pos}</Badge>
                                      ) : null}
                                      <p className="text-sm font-medium truncate">{pw.workout_name}</p>
                                    </div>
                                    {(pw.exercise_count ?? 0) > 0 && (
                                      <p className="text-[11px] text-muted-foreground mt-0.5">
                                        {pw.exercise_count} exercise{pw.exercise_count !== 1 ? "s" : ""}
                                      </p>
                                    )}
                                  </button>

                                  <Button
                                    size="sm"
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
