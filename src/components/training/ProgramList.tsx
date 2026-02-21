import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Copy, Trash2, Edit, Users, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ProgramBuilder from "./ProgramBuilder";

const GOAL_LABELS: Record<string, string> = {
  hypertrophy: "Hypertrophy",
  strength: "Strength",
  fat_loss: "Fat Loss",
  powerbuilding: "Powerbuilding",
  athletic: "Athletic",
  general: "General Fitness",
  recomp: "Recomp",
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
  const [assigning, setAssigning] = useState(false);

  const loadPrograms = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("programs")
      .select("id, name, description, goal_type, start_date, end_date, is_template, client_id, created_at")
      .eq("coach_id", user.id)
      .order("created_at", { ascending: false });
    setPrograms(data || []);
    setLoading(false);
  };

  const loadClients = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("coach_clients")
      .select("client_id, profiles!coach_clients_client_id_fkey(full_name)")
      .eq("coach_id", user.id)
      .eq("status", "active");

    // Fallback: if the join doesn't work, just get client IDs
    if (data) {
      const clientList = data.map((d: any) => ({
        id: d.client_id,
        name: d.profiles?.full_name || d.client_id.slice(0, 8),
      }));
      setClients(clientList);
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
      }).select().single();
      if (error) throw error;

      // Copy weeks and workouts
      const { data: weeks } = await supabase
        .from("program_weeks")
        .select("id, week_number, name")
        .eq("program_id", programId)
        .order("week_number");

      if (weeks) {
        for (const week of weeks) {
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

      // Create a copy for the client
      const { data: newProg, error } = await supabase.from("programs").insert({
        coach_id: user.id, client_id: selectedClientId,
        name: source.name, description: source.description,
        goal_type: source.goal_type, start_date: source.start_date,
        end_date: source.end_date, is_template: false,
      }).select().single();
      if (error) throw error;

      // Copy structure
      const { data: weeks } = await supabase
        .from("program_weeks")
        .select("id, week_number, name")
        .eq("program_id", assignProgramId)
        .order("week_number");

      if (weeks) {
        for (const week of weeks) {
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
              // Also assign the workouts to the client
              for (const w of workouts) {
                // Duplicate the workout for the client
                const { data: origWorkout } = await supabase
                  .from("workouts")
                  .select("name, description, instructions, phase")
                  .eq("id", w.workout_id)
                  .single();

                if (origWorkout) {
                  const { data: clientWorkout } = await supabase
                    .from("workouts")
                    .insert({
                      coach_id: user.id, client_id: selectedClientId,
                      name: origWorkout.name, description: origWorkout.description,
                      instructions: origWorkout.instructions, phase: origWorkout.phase,
                      is_template: false,
                    })
                    .select().single();

                  if (clientWorkout) {
                    // Copy exercises
                    const { data: exercises } = await supabase
                      .from("workout_exercises")
                      .select("exercise_id, exercise_order, sets, reps, tempo, rest_seconds, rir, notes, video_override")
                      .eq("workout_id", w.workout_id);

                    if (exercises && exercises.length > 0) {
                      await supabase.from("workout_exercises").insert(
                        exercises.map(ex => ({ ...ex, workout_id: clientWorkout.id }))
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

      toast({ title: "Program assigned to client" });
      setShowAssignDialog(false);
      setSelectedClientId("");
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
          Create multi-week training programs and assign to clients.
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
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                {program.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{program.description}</p>
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

      {/* Assign Dialog */}
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
