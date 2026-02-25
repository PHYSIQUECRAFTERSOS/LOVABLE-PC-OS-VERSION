import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Copy, Trash2, Edit, Users, Calendar, Layers } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ProgramBuilder from "./ProgramBuilder";
import { format } from "date-fns";

const GOAL_LABELS: Record<string, string> = {
  hypertrophy: "Hypertrophy",
  strength: "Strength",
  fat_loss: "Fat Loss",
  powerbuilding: "Powerbuilding",
  athletic: "Athletic",
  general: "General Fitness",
  recomp: "Recomp",
  prep: "Contest Prep",
};

const ProgramList = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [programs, setPrograms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [assignProgramId, setAssignProgramId] = useState<string | null>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [phaseCounts, setPhaseCounts] = useState<Record<string, number>>({});

  const loadPrograms = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("programs")
      .select("id, name, description, goal_type, start_date, end_date, is_template, client_id, created_at, duration_weeks, tags")
      .eq("coach_id", user.id)
      .order("created_at", { ascending: false });
    setPrograms(data || []);

    // Load phase counts
    if (data && data.length > 0) {
      const ids = data.map((p: any) => p.id);
      const { data: phases } = await supabase
        .from("program_phases")
        .select("program_id")
        .in("program_id", ids);
      const counts: Record<string, number> = {};
      (phases || []).forEach((p: any) => {
        counts[p.program_id] = (counts[p.program_id] || 0) + 1;
      });
      setPhaseCounts(counts);
    }

    setLoading(false);
  };

  const loadClients = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("coach_clients")
      .select("client_id, profiles!coach_clients_client_id_fkey(full_name)")
      .eq("coach_id", user.id)
      .eq("status", "active");

    if (data) {
      setClients(data.map((d: any) => ({
        id: d.client_id,
        name: d.profiles?.full_name || d.client_id.slice(0, 8),
      })));
    }
  };

  useEffect(() => { loadPrograms(); loadClients(); }, [user]);

  const duplicateProgram = async (programId: string) => {
    if (!user) return;
    try {
      const source = programs.find(p => p.id === programId);
      if (!source) return;

      const { data: newProg, error } = await supabase.from("programs").insert({
        coach_id: user.id, name: `${source.name} (Copy)`,
        description: source.description, goal_type: source.goal_type, is_template: true,
        duration_weeks: source.duration_weeks, tags: source.tags,
      } as any).select().single();
      if (error) throw error;

      // Copy phases
      const { data: phaseRows } = await supabase
        .from("program_phases")
        .select("*")
        .eq("program_id", programId)
        .order("phase_order");

      if (phaseRows) {
        for (const phase of phaseRows) {
          const { data: newPhase } = await supabase
            .from("program_phases")
            .insert({
              program_id: newProg.id, name: phase.name, description: phase.description,
              phase_order: phase.phase_order, duration_weeks: phase.duration_weeks,
              training_style: phase.training_style, intensity_system: phase.intensity_system,
              progression_rule: phase.progression_rule,
            })
            .select().single();

          if (newPhase) {
            const { data: weeks } = await supabase
              .from("program_weeks")
              .select("id, week_number, name")
              .eq("program_id", programId)
              .eq("phase_id", phase.id)
              .order("week_number");

            if (weeks) {
              for (const week of weeks) {
                const { data: newWeek } = await supabase
                  .from("program_weeks")
                  .insert({ program_id: newProg.id, phase_id: newPhase.id, week_number: week.week_number, name: week.name })
                  .select().single();

                if (newWeek) {
                  const { data: workouts } = await supabase
                    .from("program_workouts")
                    .select("workout_id, day_of_week, day_label, sort_order")
                    .eq("week_id", week.id);
                  if (workouts && workouts.length > 0) {
                    await supabase.from("program_workouts").insert(
                      workouts.map(w => ({ ...w, week_id: newWeek.id }))
                    );
                  }
                }
              }
            }
          }
        }
      }

      // Also copy legacy weeks without phases
      const { data: legacyWeeks } = await supabase
        .from("program_weeks")
        .select("id, week_number, name")
        .eq("program_id", programId)
        .is("phase_id", null)
        .order("week_number");

      if (legacyWeeks) {
        for (const week of legacyWeeks) {
          const { data: newWeek } = await supabase
            .from("program_weeks")
            .insert({ program_id: newProg.id, week_number: week.week_number, name: week.name })
            .select().single();
          if (newWeek) {
            const { data: workouts } = await supabase
              .from("program_workouts")
              .select("workout_id, day_of_week, day_label, sort_order")
              .eq("week_id", week.id);
            if (workouts && workouts.length > 0) {
              await supabase.from("program_workouts").insert(
                workouts.map(w => ({ ...w, week_id: newWeek.id }))
              );
            }
          }
        }
      }

      toast({ title: "Program duplicated" });
      loadPrograms();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const deleteProgram = async (programId: string) => {
    const { error } = await supabase.from("programs").delete().eq("id", programId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Program deleted" });
      loadPrograms();
    }
  };

  const assignToClient = async () => {
    if (!user || !assignProgramId || !selectedClientId) return;
    setAssigning(true);
    try {
      const source = programs.find(p => p.id === assignProgramId);
      if (!source) throw new Error("Program not found");

      // 1. Fork: Create a client-specific copy of the program
      const { data: newProg, error } = await supabase.from("programs").insert({
        coach_id: user.id,
        client_id: selectedClientId,
        name: source.name,
        description: source.description,
        goal_type: source.goal_type,
        start_date: startDate,
        is_template: false,
        duration_weeks: source.duration_weeks,
        tags: source.tags,
      } as any).select().single();
      if (error) throw error;

      // 2. Copy phases and structure
      const { data: phaseRows } = await supabase
        .from("program_phases")
        .select("*")
        .eq("program_id", assignProgramId)
        .order("phase_order");

      let firstPhaseId: string | null = null;

      if (phaseRows && phaseRows.length > 0) {
        for (const phase of phaseRows) {
          const { data: newPhase } = await supabase
            .from("program_phases")
            .insert({
              program_id: newProg.id, name: phase.name, description: phase.description,
              phase_order: phase.phase_order, duration_weeks: phase.duration_weeks,
              training_style: phase.training_style, intensity_system: phase.intensity_system,
              progression_rule: phase.progression_rule,
            })
            .select().single();

          if (newPhase) {
            if (!firstPhaseId) firstPhaseId = newPhase.id;

            const { data: weeks } = await supabase
              .from("program_weeks")
              .select("id, week_number, name")
              .eq("program_id", assignProgramId)
              .eq("phase_id", phase.id)
              .order("week_number");

            if (weeks) {
              for (const week of weeks) {
                const { data: newWeek } = await supabase
                  .from("program_weeks")
                  .insert({ program_id: newProg.id, phase_id: newPhase.id, week_number: week.week_number, name: week.name })
                  .select().single();

                if (newWeek) {
                  const { data: workouts } = await supabase
                    .from("program_workouts")
                    .select("workout_id, day_of_week, day_label, sort_order")
                    .eq("week_id", week.id);

                  if (workouts && workouts.length > 0) {
                    for (const w of workouts) {
                      // Deep-copy workout for client
                      const { data: origWorkout } = await supabase
                        .from("workouts")
                        .select("name, description, instructions, phase, workout_type")
                        .eq("id", w.workout_id)
                        .single();

                      if (origWorkout) {
                        const { data: clientWorkout } = await supabase
                          .from("workouts")
                          .insert({
                            coach_id: user.id, client_id: selectedClientId,
                            name: origWorkout.name, description: origWorkout.description,
                            instructions: origWorkout.instructions, phase: origWorkout.phase,
                            is_template: false, workout_type: (origWorkout as any).workout_type || "regular",
                          } as any)
                          .select().single();

                        if (clientWorkout) {
                          const { data: exes } = await supabase
                            .from("workout_exercises")
                            .select("exercise_id, exercise_order, sets, reps, tempo, rest_seconds, rir, notes, video_override, progression_type, weight_increment, increment_type, rpe_threshold, progression_mode, superset_group, intensity_type, loading_type, loading_percentage, rpe_target, is_amrap")
                            .eq("workout_id", w.workout_id);

                          if (exes && exes.length > 0) {
                            await supabase.from("workout_exercises").insert(
                              exes.map((ex: any) => ({ ...ex, workout_id: clientWorkout.id }))
                            );
                          }

                          await supabase.from("program_workouts").insert({
                            week_id: newWeek.id, workout_id: clientWorkout.id,
                            day_of_week: w.day_of_week, day_label: w.day_label, sort_order: w.sort_order,
                          });
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      // 3. Create assignment tracking record
      await supabase.from("client_program_assignments").insert({
        client_id: selectedClientId,
        program_id: newProg.id,
        coach_id: user.id,
        start_date: startDate,
        current_phase_id: firstPhaseId,
        current_week_number: 1,
        status: "active",
        auto_advance: autoAdvance,
        forked_from_program_id: assignProgramId,
      });

      toast({ title: "Program assigned to client", description: `Starting ${format(new Date(startDate), "MMM d, yyyy")}` });
      setShowAssignDialog(false);
      setSelectedClientId("");
      setStartDate(format(new Date(), "yyyy-MM-dd"));
      loadPrograms();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAssigning(false);
    }
  };

  if (showBuilder) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">
            {editingId ? "Edit Program" : "Create Program"}
          </h3>
          <Button variant="outline" size="sm" onClick={() => { setShowBuilder(false); setEditingId(undefined); }}>
            Back
          </Button>
        </div>
        <ProgramBuilder
          editProgramId={editingId}
          onSave={() => { setShowBuilder(false); setEditingId(undefined); loadPrograms(); }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Create multi-phase training programs and assign to clients.
        </p>
        <Button size="sm" onClick={() => setShowBuilder(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New Program
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : programs.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground text-sm">
              No programs yet. Create your first training program.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {programs.map((program) => (
            <Card key={program.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{program.name}</CardTitle>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="secondary" className="text-[10px]">
                        {GOAL_LABELS[program.goal_type] || program.goal_type}
                      </Badge>
                      {program.is_template && (
                        <Badge variant="outline" className="text-[10px]">Template</Badge>
                      )}
                      {program.client_id && (
                        <Badge variant="default" className="text-[10px] gap-1">
                          <Users className="h-2.5 w-2.5" /> Assigned
                        </Badge>
                      )}
                      {phaseCounts[program.id] > 0 && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <Layers className="h-2.5 w-2.5" /> {phaseCounts[program.id]} phases
                        </Badge>
                      )}
                      {program.duration_weeks && (
                        <Badge variant="outline" className="text-[10px]">
                          {program.duration_weeks}w
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                {program.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{program.description}</p>
                )}
                {program.tags && program.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {program.tags.map((tag: string) => (
                      <Badge key={tag} variant="outline" className="text-[9px]">{tag}</Badge>
                    ))}
                  </div>
                )}
                {program.start_date && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(program.start_date).toLocaleDateString()}
                    {program.end_date && ` — ${new Date(program.end_date).toLocaleDateString()}`}
                  </p>
                )}
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => { setEditingId(program.id); setShowBuilder(true); }}>
                    <Edit className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                  {program.is_template && (
                    <Button variant="outline" size="sm" onClick={() => { setAssignProgramId(program.id); setShowAssignDialog(true); }} title="Assign to client">
                      <Users className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => duplicateProgram(program.id)} title="Duplicate">
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteProgram(program.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Assign Dialog — Enhanced */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Assign Program to Client</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select Client</Label>
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger><SelectValue placeholder="Choose a client..." /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">
                Phases will auto-map from this date forward.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Auto-Advance Phases</Label>
                <p className="text-[11px] text-muted-foreground">
                  Automatically move to next phase when complete
                </p>
              </div>
              <Switch checked={autoAdvance} onCheckedChange={setAutoAdvance} />
            </div>

            <div className="p-3 rounded-lg bg-muted/30 border">
              <p className="text-[11px] text-muted-foreground">
                <strong>Fork from master:</strong> A client-specific copy will be created. Edits to the client's program won't affect the master template.
              </p>
            </div>

            <Button onClick={assignToClient} disabled={assigning || !selectedClientId} className="w-full">
              {assigning && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
              Assign Program
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProgramList;
