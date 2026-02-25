import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  Dumbbell, Plus, Trash2, Copy, ChevronDown, ChevronRight, Layers,
  ArrowUp, ArrowDown, Edit2, Play, GripVertical, Calendar, Target
} from "lucide-react";
import { format } from "date-fns";

interface Phase {
  id: string;
  name: string;
  description: string | null;
  phase_order: number;
  duration_weeks: number;
  training_style: string | null;
  intensity_system: string | null;
  progression_rule: string | null;
}

interface Week {
  id: string;
  week_number: number;
  name: string;
  phase_id: string | null;
  workouts: ProgramWorkout[];
}

interface ProgramWorkout {
  id: string;
  workout_id: string;
  workout_name: string;
  day_of_week: number;
  day_label: string;
  exercises?: any[];
}

const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const TRAINING_STYLE_LABELS: Record<string, string> = {
  hypertrophy: "Hypertrophy", strength: "Strength", deload: "Deload",
  power: "Power", endurance: "Endurance", metabolite: "Metabolite",
};

const ClientWorkspaceTraining = ({ clientId }: { clientId: string }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState<any>(null);
  const [program, setProgram] = useState<any>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);
  const [expandedWorkout, setExpandedWorkout] = useState<string | null>(null);
  const [workoutExercises, setWorkoutExercises] = useState<Record<string, any[]>>({});

  // Assign dialog
  const [showAssign, setShowAssign] = useState(false);
  const [masterPrograms, setMasterPrograms] = useState<any[]>([]);
  const [selectedMaster, setSelectedMaster] = useState("");
  const [assigning, setAssigning] = useState(false);

  // Phase management
  const [editingPhase, setEditingPhase] = useState<string | null>(null);
  const [phaseNameEdit, setPhaseNameEdit] = useState("");

  useEffect(() => {
    loadClientProgram();
  }, [clientId, user]);

  const loadClientProgram = async () => {
    if (!clientId || !user) return;
    setLoading(true);

    // Get active assignment
    const { data: assignData } = await supabase
      .from("client_program_assignments")
      .select("*, programs(id, name, description, goal_type)")
      .eq("client_id", clientId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (!assignData) {
      setAssignment(null);
      setProgram(null);
      setPhases([]);
      setWeeks([]);
      setLoading(false);
      return;
    }

    setAssignment(assignData);
    const prog = (assignData as any).programs;
    setProgram(prog);

    // Load phases
    const { data: phaseData } = await supabase
      .from("program_phases")
      .select("*")
      .eq("program_id", prog.id)
      .order("phase_order");

    setPhases((phaseData || []) as Phase[]);

    // Load all weeks
    const { data: weekData } = await supabase
      .from("program_weeks")
      .select("id, week_number, name, phase_id")
      .eq("program_id", prog.id)
      .order("week_number");

    if (weekData && weekData.length > 0) {
      const weekIds = weekData.map(w => w.id);
      const { data: pwData } = await supabase
        .from("program_workouts")
        .select("id, week_id, workout_id, day_of_week, day_label, sort_order, workouts(id, name)")
        .in("week_id", weekIds)
        .order("sort_order");

      const enrichedWeeks: Week[] = weekData.map(w => ({
        ...w,
        workouts: (pwData || [])
          .filter((pw: any) => pw.week_id === w.id)
          .map((pw: any) => ({
            id: pw.id,
            workout_id: pw.workout_id,
            workout_name: (pw.workouts as any)?.name || "Workout",
            day_of_week: pw.day_of_week ?? 0,
            day_label: pw.day_label || DAY_LABELS[pw.day_of_week ?? 0],
          })),
      }));
      setWeeks(enrichedWeeks);
    } else {
      setWeeks([]);
    }

    // Auto-expand current phase
    if (assignData.current_phase_id) {
      setExpandedPhase(assignData.current_phase_id);
    } else if (phaseData && phaseData.length > 0) {
      setExpandedPhase(phaseData[0].id);
    }

    setLoading(false);
  };

  const loadWorkoutExercises = async (workoutId: string) => {
    if (workoutExercises[workoutId]) {
      setExpandedWorkout(expandedWorkout === workoutId ? null : workoutId);
      return;
    }
    const { data } = await supabase
      .from("workout_exercises")
      .select("*, exercises(name, primary_muscle, youtube_thumbnail)")
      .eq("workout_id", workoutId)
      .order("exercise_order");

    setWorkoutExercises(prev => ({ ...prev, [workoutId]: data || [] }));
    setExpandedWorkout(workoutId);
  };

  const openAssignDialog = async () => {
    const { data } = await supabase
      .from("programs")
      .select("id, name, goal_type, duration_weeks")
      .eq("coach_id", user!.id)
      .eq("is_template", true)
      .order("name");
    setMasterPrograms(data || []);
    setShowAssign(true);
  };

  const handleAssignProgram = async () => {
    if (!selectedMaster || !user) return;
    setAssigning(true);

    try {
      // Get master program
      const { data: master } = await supabase
        .from("programs")
        .select("*")
        .eq("id", selectedMaster)
        .single();
      if (!master) throw new Error("Program not found");

      // Fork: create client copy
      const { data: clientProg, error: progErr } = await supabase
        .from("programs")
        .insert({
          coach_id: user.id,
          client_id: clientId,
          name: master.name,
          description: master.description,
          goal_type: master.goal_type,
          is_template: false,
          tags: (master as any).tags || [],
          duration_weeks: (master as any).duration_weeks || 0,
        } as any)
        .select()
        .single();
      if (progErr) throw progErr;

      // Clone phases
      const { data: masterPhases } = await supabase
        .from("program_phases")
        .select("*")
        .eq("program_id", selectedMaster)
        .order("phase_order");

      let firstPhaseId: string | null = null;

      for (const phase of (masterPhases || [])) {
        const { data: newPhase } = await supabase
          .from("program_phases")
          .insert({
            program_id: clientProg.id,
            name: phase.name,
            description: phase.description,
            phase_order: phase.phase_order,
            duration_weeks: phase.duration_weeks,
            training_style: phase.training_style,
            intensity_system: phase.intensity_system,
            progression_rule: phase.progression_rule,
          })
          .select()
          .single();

        if (!firstPhaseId) firstPhaseId = newPhase?.id || null;

        // Clone weeks for this phase
        const { data: masterWeeks } = await supabase
          .from("program_weeks")
          .select("*")
          .eq("program_id", selectedMaster)
          .eq("phase_id", phase.id)
          .order("week_number");

        for (const week of (masterWeeks || [])) {
          const { data: newWeek } = await supabase
            .from("program_weeks")
            .insert({
              program_id: clientProg.id,
              phase_id: newPhase!.id,
              week_number: week.week_number,
              name: week.name,
            })
            .select()
            .single();

          // Clone workouts for this week
          const { data: masterPW } = await supabase
            .from("program_workouts")
            .select("*")
            .eq("week_id", week.id)
            .order("sort_order");

          if (masterPW && masterPW.length > 0) {
            await supabase.from("program_workouts").insert(
              masterPW.map(pw => ({
                week_id: newWeek!.id,
                workout_id: pw.workout_id,
                day_of_week: pw.day_of_week,
                day_label: pw.day_label,
                sort_order: pw.sort_order,
              }))
            );
          }
        }
      }

      // Deactivate old assignments
      await supabase
        .from("client_program_assignments")
        .update({ status: "completed" })
        .eq("client_id", clientId)
        .eq("status", "active");

      // Create assignment
      await supabase.from("client_program_assignments").insert({
        client_id: clientId,
        coach_id: user.id,
        program_id: clientProg.id,
        current_phase_id: firstPhaseId,
        current_week_number: 1,
        forked_from_program_id: selectedMaster,
        status: "active",
      });

      toast({ title: "Program assigned successfully" });
      setShowAssign(false);
      setSelectedMaster("");
      loadClientProgram();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAssigning(false);
    }
  };

  const renamePhase = async (phaseId: string, newName: string) => {
    await supabase.from("program_phases").update({ name: newName }).eq("id", phaseId);
    setPhases(prev => prev.map(p => p.id === phaseId ? { ...p, name: newName } : p));
    setEditingPhase(null);
    toast({ title: "Phase renamed" });
  };

  const duplicatePhase = async (phase: Phase) => {
    if (!program) return;
    const newOrder = phases.length + 1;
    const { data: newPhase } = await supabase
      .from("program_phases")
      .insert({
        program_id: program.id,
        name: `${phase.name} (Copy)`,
        description: phase.description,
        phase_order: newOrder,
        duration_weeks: phase.duration_weeks,
        training_style: phase.training_style,
        intensity_system: phase.intensity_system,
        progression_rule: phase.progression_rule,
      })
      .select()
      .single();

    if (newPhase) {
      // Clone weeks
      const phaseWeeks = weeks.filter(w => w.phase_id === phase.id);
      for (const week of phaseWeeks) {
        const { data: newWeek } = await supabase
          .from("program_weeks")
          .insert({ program_id: program.id, phase_id: newPhase.id, week_number: week.week_number, name: week.name })
          .select().single();
        if (newWeek && week.workouts.length > 0) {
          await supabase.from("program_workouts").insert(
            week.workouts.map((w, i) => ({ week_id: newWeek.id, workout_id: w.workout_id, day_of_week: w.day_of_week, day_label: w.day_label, sort_order: i }))
          );
        }
      }
      toast({ title: "Phase duplicated" });
      loadClientProgram();
    }
  };

  const deletePhase = async (phaseId: string) => {
    // Delete weeks first (cascading), then phase
    const phaseWeekIds = weeks.filter(w => w.phase_id === phaseId).map(w => w.id);
    if (phaseWeekIds.length > 0) {
      await supabase.from("program_workouts").delete().in("week_id", phaseWeekIds);
      await supabase.from("program_weeks").delete().in("id", phaseWeekIds);
    }
    await supabase.from("program_phases").delete().eq("id", phaseId);
    toast({ title: "Phase deleted" });
    loadClientProgram();
  };

  const movePhase = async (phaseId: string, direction: "up" | "down") => {
    const idx = phases.findIndex(p => p.id === phaseId);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= phases.length) return;

    const updates = [
      supabase.from("program_phases").update({ phase_order: swapIdx + 1 }).eq("id", phases[idx].id),
      supabase.from("program_phases").update({ phase_order: idx + 1 }).eq("id", phases[swapIdx].id),
    ];
    await Promise.all(updates);
    loadClientProgram();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 rounded-lg" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!assignment || !program) {
    return (
      <Card>
        <CardContent className="pt-6 text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto">
            <Dumbbell className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">No training program assigned yet.</p>
          <Button onClick={openAssignDialog}>
            <Plus className="h-4 w-4 mr-2" /> Assign Program
          </Button>
          <AssignDialog
            open={showAssign}
            onOpenChange={setShowAssign}
            programs={masterPrograms}
            selected={selectedMaster}
            onSelect={setSelectedMaster}
            onAssign={handleAssignProgram}
            loading={assigning}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Program Header */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-foreground text-lg">{program.name}</h3>
              <div className="flex items-center gap-2 mt-1">
                {program.goal_type && (
                  <Badge variant="secondary" className="text-[10px]">{program.goal_type}</Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  Week {assignment.current_week_number} · {phases.length} phase{phases.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={openAssignDialog}>
                Change Program
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Phases */}
      {phases.map((phase, phaseIdx) => {
        const phaseWeeks = weeks.filter(w => w.phase_id === phase.id);
        const isExpanded = expandedPhase === phase.id;
        const isCurrent = assignment.current_phase_id === phase.id;

        return (
          <Card key={phase.id} className={`overflow-hidden ${isCurrent ? "ring-1 ring-primary/50" : ""}`}>
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => setExpandedPhase(isExpanded ? null : phase.id)}
            >
              <div className="flex items-center gap-3">
                {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <div>
                  {editingPhase === phase.id ? (
                    <Input
                      autoFocus
                      value={phaseNameEdit}
                      onChange={e => setPhaseNameEdit(e.target.value)}
                      onBlur={() => renamePhase(phase.id, phaseNameEdit)}
                      onKeyDown={e => e.key === "Enter" && renamePhase(phase.id, phaseNameEdit)}
                      onClick={e => e.stopPropagation()}
                      className="h-7 w-48 text-sm"
                    />
                  ) : (
                    <h4 className="font-semibold text-sm text-foreground">{phase.name}</h4>
                  )}
                  <div className="flex items-center gap-2 mt-0.5">
                    {isCurrent && <Badge className="text-[9px] h-4">Current</Badge>}
                    {phase.training_style && (
                      <span className="text-[10px] text-muted-foreground">
                        {TRAINING_STYLE_LABELS[phase.training_style] || phase.training_style}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {phase.duration_weeks}w · {phaseWeeks.reduce((s, w) => s + w.workouts.length, 0)} workouts
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => movePhase(phase.id, "up")} disabled={phaseIdx === 0}>
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => movePhase(phase.id, "down")} disabled={phaseIdx === phases.length - 1}>
                  <ArrowDown className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingPhase(phase.id); setPhaseNameEdit(phase.name); }}>
                  <Edit2 className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => duplicatePhase(phase)}>
                  <Copy className="h-3 w-3" />
                </Button>
                {phases.length > 1 && (
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deletePhase(phase.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>

            {isExpanded && (
              <CardContent className="pt-0 space-y-3 pb-4">
                {phaseWeeks.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No weeks in this phase.</p>
                ) : (
                  phaseWeeks.map(week => (
                    <Collapsible key={week.id} open={expandedWeek === week.id} onOpenChange={open => setExpandedWeek(open ? week.id : null)}>
                      <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 rounded-md hover:bg-muted/50 transition-colors">
                        <span className="text-sm font-medium">{week.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">{week.workouts.length} workout{week.workouts.length !== 1 ? "s" : ""}</span>
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pl-4 space-y-2 mt-1">
                        {week.workouts.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2">No workouts this week.</p>
                        ) : (
                          week.workouts.map(pw => (
                            <div key={pw.id}>
                              <div
                                className="flex items-center justify-between p-3 border rounded-lg bg-card/50 cursor-pointer hover:bg-muted/30 transition-colors"
                                onClick={() => loadWorkoutExercises(pw.workout_id)}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center">
                                    <Dumbbell className="h-4 w-4 text-primary" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">{pw.workout_name}</p>
                                    <p className="text-[10px] text-muted-foreground">{pw.day_label}</p>
                                  </div>
                                </div>
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                              </div>

                              {/* Exercise details */}
                              {expandedWorkout === pw.workout_id && workoutExercises[pw.workout_id] && (
                                <div className="ml-4 mt-2 space-y-1.5">
                                  {workoutExercises[pw.workout_id].map((ex: any, i: number) => (
                                    <div key={ex.id} className="flex items-center gap-3 py-2 px-3 border-l-2 border-primary/20">
                                      {ex.exercises?.youtube_thumbnail ? (
                                        <img src={ex.exercises.youtube_thumbnail} alt="" className="w-8 h-6 rounded object-cover" />
                                      ) : (
                                        <div className="w-8 h-6 rounded bg-muted flex items-center justify-center">
                                          <Dumbbell className="h-3 w-3 text-muted-foreground" />
                                        </div>
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium truncate">{ex.exercises?.name || "Exercise"}</p>
                                        <p className="text-[10px] text-muted-foreground">
                                          {ex.sets} sets × {ex.reps}
                                          {ex.tempo ? ` · ${ex.tempo}` : ""}
                                          {ex.rest_seconds ? ` · ${ex.rest_seconds}s rest` : ""}
                                        </p>
                                      </div>
                                      {ex.superset_group && (
                                        <Badge variant="outline" className="text-[9px]">{ex.superset_group}</Badge>
                                      )}
                                      {ex.intensity_type && ex.intensity_type !== "straight" && (
                                        <Badge variant="secondary" className="text-[9px]">{ex.intensity_type}</Badge>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </CollapsibleContent>
                    </Collapsible>
                  ))
                )}
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Add Phase */}
      <Button variant="outline" className="w-full" onClick={async () => {
        if (!program) return;
        const newOrder = phases.length + 1;
        await supabase.from("program_phases").insert({
          program_id: program.id,
          name: `Phase ${newOrder}`,
          phase_order: newOrder,
          duration_weeks: 4,
        });
        toast({ title: "Phase added" });
        loadClientProgram();
      }}>
        <Plus className="h-4 w-4 mr-2" /> Add Phase
      </Button>

      {/* Assign Dialog */}
      <AssignDialog
        open={showAssign}
        onOpenChange={setShowAssign}
        programs={masterPrograms}
        selected={selectedMaster}
        onSelect={setSelectedMaster}
        onAssign={handleAssignProgram}
        loading={assigning}
      />
    </div>
  );
};

const AssignDialog = ({ open, onOpenChange, programs, selected, onSelect, onAssign, loading }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  programs: any[]; selected: string; onSelect: (v: string) => void;
  onAssign: () => void; loading: boolean;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Assign Master Program</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <Label>Select Program</Label>
          <Select value={selected} onValueChange={onSelect}>
            <SelectTrigger><SelectValue placeholder="Choose a master program" /></SelectTrigger>
            <SelectContent>
              {programs.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} {p.goal_type ? `(${p.goal_type})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          This will create a client-specific copy (fork) of the master program. The master template remains unchanged.
        </p>
        <Button onClick={onAssign} disabled={!selected || loading} className="w-full">
          {loading ? "Assigning..." : "Assign Program"}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

export default ClientWorkspaceTraining;
