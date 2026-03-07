import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, ChevronDown, ChevronUp, Calendar, Dumbbell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
  }[];
}

const ClientProgramView = ({ onStartWorkout }: ClientProgramViewProps) => {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<ProgramAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedProgram, setExpandedProgram] = useState<string | null>(null);
  const [phaseDetails, setPhaseDetails] = useState<Record<string, PhaseDetail[]>>({});
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      // 1. Get assigned programs via client_program_assignments
      const { data: cpa } = await supabase
        .from("client_program_assignments")
        .select("id, program_id, start_date, status")
        .eq("client_id", user.id)
        .in("status", ["active", "subscribed"])
        .order("created_at", { ascending: false });

      if (!cpa || cpa.length === 0) {
        // Fallback: check programs directly assigned via client_id
        const { data: directPrograms } = await supabase
          .from("programs")
          .select("id, name, description, goal_type")
          .eq("client_id", user.id)
          .eq("is_template", false)
          .order("created_at", { ascending: false });

        if (directPrograms && directPrograms.length > 0) {
          setAssignments(directPrograms.map(p => ({
            id: p.id,
            program_id: p.id,
            start_date: "",
            status: "active",
            program: p,
          })));
        }
        setLoading(false);
        return;
      }

      // 2. Fetch program details for each assignment
      const programIds = [...new Set(cpa.map(a => a.program_id))];
      const { data: programs } = await supabase
        .from("programs")
        .select("id, name, description, goal_type")
        .in("id", programIds);

      const programMap = new Map((programs || []).map(p => [p.id, p]));

      const merged: ProgramAssignment[] = cpa
        .filter(a => programMap.has(a.program_id))
        .map(a => ({
          ...a,
          program: programMap.get(a.program_id)!,
        }));

      // Deduplicate by program_id (keep latest assignment)
      const seen = new Set<string>();
      const deduped = merged.filter(a => {
        if (seen.has(a.program_id)) return false;
        seen.add(a.program_id);
        return true;
      });

      setAssignments(deduped);
      setLoading(false);
    };
    load();
  }, [user]);

  const toggleProgram = async (programId: string) => {
    if (expandedProgram === programId) {
      setExpandedProgram(null);
      return;
    }
    setExpandedProgram(programId);
    if (phaseDetails[programId]) return;

    setLoadingDetails(programId);

    // Load phases for this program
    const { data: phases } = await supabase
      .from("program_phases")
      .select("id, name, phase_order")
      .eq("program_id", programId)
      .order("phase_order");

    if (!phases || phases.length === 0) {
      // Try loading workouts directly via program_workouts with phase_id or week_id
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

        // Fetch workout names
        const workoutIds = [...new Set((pwRows || []).map(pw => pw.workout_id))];
        const { data: workouts } = workoutIds.length > 0
          ? await supabase.from("workouts").select("id, name").in("id", workoutIds)
          : { data: [] };
        const wMap = new Map((workouts || []).map(w => [w.id, w.name]));

        const detail: PhaseDetail[] = weeks.map(w => ({
          id: w.id,
          name: w.name || `Week ${w.week_number}`,
          phase_order: w.week_number,
          workouts: (pwRows || [])
            .filter(pw => pw.week_id === w.id)
            .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
            .map(pw => ({
              id: pw.id,
              workout_id: pw.workout_id,
              day_label: pw.day_label,
              sort_order: pw.sort_order,
              day_of_week: pw.day_of_week,
              workout_name: wMap.get(pw.workout_id) || "Workout",
              exclude_from_numbering: (pw as any).exclude_from_numbering || false,
              custom_tag: (pw as any).custom_tag || null,
            })),
        }));

        setPhaseDetails(prev => ({ ...prev, [programId]: detail }));
      } else {
        // No phases, no weeks — try loading workouts directly assigned to this program's workouts table
        const { data: directWorkouts } = await supabase
          .from("workouts")
          .select("id, name")
          .eq("client_id", user?.id || "")
          .order("created_at");

        if (directWorkouts && directWorkouts.length > 0) {
          setPhaseDetails(prev => ({
            ...prev,
            [programId]: [{
              id: "direct",
              name: "Workouts",
              phase_order: 1,
              workouts: directWorkouts.map((w, i) => ({
                id: w.id,
                workout_id: w.id,
                day_label: `Day ${i + 1}`,
                sort_order: i,
                day_of_week: i,
                workout_name: w.name,
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

    // Load workouts for each phase via program_workouts.phase_id
    const phaseIds = phases.map(p => p.id);
    const { data: pwRows } = await supabase
      .from("program_workouts")
      .select("id, phase_id, workout_id, day_of_week, day_label, sort_order, exclude_from_numbering, custom_tag")
      .in("phase_id", phaseIds)
      .order("sort_order");

    // Also check week-based workouts
    const { data: weekRows } = await supabase
      .from("program_weeks")
      .select("id, phase_id")
      .in("phase_id", phaseIds);

    let weekWorkouts: any[] = [];
    if (weekRows && weekRows.length > 0) {
      const weekIds = weekRows.map(w => w.id);
      const { data: wwRows } = await supabase
        .from("program_workouts")
        .select("id, week_id, workout_id, day_of_week, day_label, sort_order")
        .in("week_id", weekIds)
        .order("sort_order");
      weekWorkouts = wwRows || [];
    }

    // Merge both sources
    const allPwRows = [...(pwRows || []), ...weekWorkouts];

    // Fetch workout names
    const workoutIds = [...new Set(allPwRows.map(pw => pw.workout_id))];
    const { data: workouts } = workoutIds.length > 0
      ? await supabase.from("workouts").select("id, name").in("id", workoutIds)
      : { data: [] };
    const wMap = new Map((workouts || []).map(w => [w.id, w.name]));

    // Map week_id to phase_id
    const weekToPhase = new Map((weekRows || []).map(w => [w.id, w.phase_id]));

    const detail: PhaseDetail[] = phases.map(phase => {
      const phaseWorkouts = allPwRows
        .filter(pw => {
          if (pw.phase_id === phase.id) return true;
          if (pw.week_id && weekToPhase.get(pw.week_id) === phase.id) return true;
          return false;
        })
        // Deduplicate by workout_id within a phase
        .filter((pw, idx, arr) => arr.findIndex(x => x.workout_id === pw.workout_id) === idx)
        .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
        .map(pw => ({
          id: pw.id,
          workout_id: pw.workout_id,
          day_label: pw.day_label,
          sort_order: pw.sort_order,
          day_of_week: pw.day_of_week,
          workout_name: wMap.get(pw.workout_id) || "Workout",
        }));

      return { ...phase, workouts: phaseWorkouts };
    });

    setPhaseDetails(prev => ({ ...prev, [programId]: detail }));
    setLoadingDetails(null);
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
                        {phase.workouts.map((pw, idx) => (
                          <div key={pw.id} className="flex items-center gap-3 p-3 border rounded-lg bg-card/50">
                            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <Dumbbell className="h-4 w-4 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <Badge variant="outline" className="text-[9px] h-4 shrink-0">Day {idx + 1}</Badge>
                                <p className="text-sm font-medium truncate">{pw.workout_name}</p>
                              </div>
                            </div>
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
                        ))}
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
  );
};

export default ClientProgramView;
