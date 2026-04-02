import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, Plus, Copy, Trash2, Edit, Users, Calendar, Layers, Link2, Unlink, RefreshCw, History, ArrowUpDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import SearchableClientSelect from "@/components/ui/searchable-client-select";
import ProgramBuilder from "./ProgramBuilder";
import ProgramDetailView from "./ProgramDetailView";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

const GOAL_LABELS: Record<string, string> = {
  hypertrophy: "Hypertrophy", strength: "Strength", fat_loss: "Fat Loss",
  powerbuilding: "Powerbuilding", athletic: "Athletic", general: "General Fitness",
  recomp: "Recomp", prep: "Contest Prep",
};

const ProgramList = () => {
  const { user, role } = useAuth();
  const userId = user?.id;
  const isAdmin = role === "admin";
  const { toast } = useToast();
  const [programs, setPrograms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [drillProgramId, setDrillProgramId] = useState<string | null>(null);
  const [drillProgramName, setDrillProgramName] = useState("");
  const [phaseCounts, setPhaseCounts] = useState<Record<string, number>>({});
  const [linkedCounts, setLinkedCounts] = useState<Record<string, number>>({});
  const [creatorNames, setCreatorNames] = useState<Record<string, string>>({});

  // Assign dialog
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [assignProgramId, setAssignProgramId] = useState<string | null>(null);
  const [assignMode, setAssignMode] = useState<"subscribe" | "import">("subscribe");
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [assigning, setAssigning] = useState(false);

  // Push update dialog
  const [showPushDialog, setShowPushDialog] = useState(false);
  const [pushProgramId, setPushProgramId] = useState<string | null>(null);
  const [linkedClients, setLinkedClients] = useState<any[]>([]);
  const [selectedPushClients, setSelectedPushClients] = useState<string[]>([]);
  const [pushing, setPushing] = useState(false);
  const [changeLog, setChangeLog] = useState("");

  // Version history dialog
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);
  const [versionProgramId, setVersionProgramId] = useState<string | null>(null);

  const loadPrograms = async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase
      .from("programs")
      .select("id, name, description, goal_type, start_date, end_date, is_template, is_master, client_id, created_at, duration_weeks, tags, version_number")
      .eq("coach_id", userId)
      .eq("is_template", true)
      .order("created_at", { ascending: false });
    setPrograms(data || []);

    if (data && data.length > 0) {
      const ids = data.map((p: any) => p.id);

      // Phase counts
      const { data: phases } = await supabase.from("program_phases").select("program_id").in("program_id", ids);
      const pc: Record<string, number> = {};
      (phases || []).forEach((p: any) => { pc[p.program_id] = (pc[p.program_id] || 0) + 1; });
      setPhaseCounts(pc);

      // Linked client counts
      const { data: assignments } = await supabase
        .from("client_program_assignments")
        .select("forked_from_program_id")
        .in("forked_from_program_id", ids)
        .eq("is_linked_to_master", true)
        .eq("status", "active");
      const lc: Record<string, number> = {};
      (assignments || []).forEach((a: any) => { lc[a.forked_from_program_id] = (lc[a.forked_from_program_id] || 0) + 1; });
      setLinkedCounts(lc);
    }

    setLoading(false);
  };

  const loadClients = async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("coach_clients")
      .select("client_id")
      .eq("coach_id", userId)
      .eq("status", "active");
    if (error || !data) return;
    
    const clientIds = data.map((d: any) => d.client_id);
    if (clientIds.length === 0) { setClients([]); return; }
    
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", clientIds);
    
    const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p.full_name]));
    setClients(clientIds.map((id: string) => ({ id, name: profileMap.get(id) || id.slice(0, 8) })));
  };

  useEffect(() => { loadPrograms(); loadClients(); }, [userId]);

  const cloneProgramToClient = async (masterProgramId: string, clientId: string, isLinked: boolean) => {
    if (!user) throw new Error("Not authenticated");

    const source = programs.find(p => p.id === masterProgramId);
    if (!source) throw new Error("Program not found");

    // 1. Create client program
    const { data: newProg, error } = await supabase.from("programs").insert({
      coach_id: user.id, client_id: clientId, name: source.name, description: source.description,
      goal_type: source.goal_type, start_date: startDate, is_template: false, is_master: false,
      duration_weeks: source.duration_weeks, tags: source.tags, version_number: source.version_number,
    } as any).select().single();
    if (error) throw error;

    // 2. Clone phases → workouts → exercises (phase-direct, no weeks needed)
    const { data: phaseRows } = await supabase.from("program_phases").select("*").eq("program_id", masterProgramId).order("phase_order");
    let firstPhaseId: string | null = null;

    for (const phase of (phaseRows || [])) {
      const { data: newPhase } = await supabase.from("program_phases").insert({
        program_id: newProg.id, name: phase.name, description: phase.description,
        phase_order: phase.phase_order, duration_weeks: phase.duration_weeks,
        training_style: phase.training_style, intensity_system: phase.intensity_system,
        progression_rule: phase.progression_rule,
      }).select().single();
      if (!firstPhaseId) firstPhaseId = newPhase?.id || null;

      // Get workouts linked to this phase
      const { data: pws } = await supabase.from("program_workouts")
        .select("workout_id, day_of_week, day_label, sort_order")
        .eq("phase_id", phase.id);

      for (const w of (pws || [])) {
        const { data: origW } = await supabase.from("workouts")
          .select("name, description, instructions, phase, workout_type").eq("id", w.workout_id).single();
        if (!origW) continue;

        const { data: clientW } = await supabase.from("workouts").insert({
          coach_id: user.id, client_id: clientId, name: origW.name, description: origW.description,
          instructions: origW.instructions, phase: origW.phase, is_template: false,
          workout_type: (origW as any).workout_type || "regular",
        } as any).select().single();
        if (!clientW) continue;

        const { data: exes } = await supabase.from("workout_exercises")
          .select("exercise_id, exercise_order, sets, reps, tempo, rest_seconds, rir, notes, rpe_target, grouping_type, grouping_id")
          .eq("workout_id", w.workout_id);
        if (exes && exes.length > 0) {
          await supabase.from("workout_exercises").insert(exes.map((ex: any) => ({ ...ex, workout_id: clientW.id })));
        }

        await supabase.from("program_workouts").insert({
          phase_id: newPhase!.id, workout_id: clientW.id,
          day_of_week: w.day_of_week, day_label: w.day_label, sort_order: w.sort_order,
        });
      }
    }

    // 3. Deactivate old assignments
    await supabase.from("client_program_assignments").update({ status: "completed" })
      .eq("client_id", clientId).eq("status", "active");

    // 4. Create assignment
    await supabase.from("client_program_assignments").insert({
      client_id: clientId, program_id: newProg.id, coach_id: user.id, start_date: startDate,
      current_phase_id: firstPhaseId, current_week_number: 1, status: "active", auto_advance: autoAdvance,
      forked_from_program_id: masterProgramId, is_linked_to_master: isLinked,
      master_version_number: source.version_number, last_synced_at: new Date().toISOString(),
    });

    return newProg;
  };

  const assignToClient = async () => {
    if (!assignProgramId || !selectedClientId) return;
    setAssigning(true);
    try {
      const isLinked = assignMode === "subscribe";
      await cloneProgramToClient(assignProgramId, selectedClientId, isLinked);
      toast({
        title: isLinked ? "Client subscribed to master" : "Program imported to client",
        description: isLinked ? "Future updates will sync." : "Client has an independent copy.",
      });
      setShowAssignDialog(false);
      setSelectedClientId("");
      loadPrograms();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAssigning(false);
    }
  };

  // ── Push update to linked clients ──
  const openPushDialog = async (programId: string) => {
    setPushProgramId(programId);
    const { data } = await supabase
      .from("client_program_assignments")
      .select("id, client_id, program_id, master_version_number, profiles:client_id(full_name)")
      .eq("forked_from_program_id", programId)
      .eq("is_linked_to_master", true)
      .eq("status", "active");

    const list = (data || []).map((a: any) => ({
      assignmentId: a.id,
      clientId: a.client_id,
      clientProgramId: a.program_id,
      name: (a as any).profiles?.full_name || a.client_id.slice(0, 8),
      currentVersion: a.master_version_number,
    }));
    setLinkedClients(list);
    setSelectedPushClients(list.map((c: any) => c.assignmentId));
    setChangeLog("");
    setShowPushDialog(true);
  };

  const pushUpdate = async () => {
    if (!pushProgramId || !user) return;
    setPushing(true);
    try {
      const master = programs.find(p => p.id === pushProgramId);
      if (!master) throw new Error("Master not found");
      const newVersion = (master.version_number || 1) + 1;

      // Increment version on master
      await supabase.from("programs").update({ version_number: newVersion } as any).eq("id", pushProgramId);

      // Save version history
      await supabase.from("master_program_versions").insert({
        program_id: pushProgramId, version_number: newVersion,
        change_log: changeLog || "Structure updated", updated_by: user.id,
      });

      // Re-sync selected clients
      const targetAssignments = linkedClients.filter(c => selectedPushClients.includes(c.assignmentId));

      for (const target of targetAssignments) {
        // Delete old client program structure (workouts, weeks, phases) but NOT workout_sessions/exercise_logs
        const { data: oldWeeks } = await supabase.from("program_weeks").select("id").eq("program_id", target.clientProgramId);
        if (oldWeeks && oldWeeks.length > 0) {
          await supabase.from("program_workouts").delete().in("week_id", oldWeeks.map(w => w.id));
        }
        await supabase.from("program_weeks").delete().eq("program_id", target.clientProgramId);
        await supabase.from("program_phases").delete().eq("program_id", target.clientProgramId);

        // Clone fresh structure from master
        const { data: phases } = await supabase.from("program_phases").select("*").eq("program_id", pushProgramId).order("phase_order");
        let firstPhaseId: string | null = null;

        for (const phase of (phases || [])) {
          const { data: newPhase } = await supabase.from("program_phases").insert({
            program_id: target.clientProgramId, name: phase.name, description: phase.description,
            phase_order: phase.phase_order, duration_weeks: phase.duration_weeks,
            training_style: phase.training_style, intensity_system: phase.intensity_system,
            progression_rule: phase.progression_rule,
          }).select().single();
          if (!firstPhaseId) firstPhaseId = newPhase?.id || null;

          const { data: weeks } = await supabase.from("program_weeks").select("id, week_number, name")
            .eq("program_id", pushProgramId).eq("phase_id", phase.id).order("week_number");

          for (const week of (weeks || [])) {
            const { data: newWeek } = await supabase.from("program_weeks")
              .insert({ program_id: target.clientProgramId, phase_id: newPhase!.id, week_number: week.week_number, name: week.name })
              .select().single();

            const { data: pws } = await supabase.from("program_workouts")
              .select("workout_id, day_of_week, day_label, sort_order").eq("week_id", week.id);

            for (const w of (pws || [])) {
              const { data: origW } = await supabase.from("workouts")
                .select("name, description, instructions, phase, workout_type").eq("id", w.workout_id).single();
              if (!origW) continue;

              const { data: clientW } = await supabase.from("workouts").insert({
                coach_id: user.id, client_id: target.clientId, name: origW.name, description: origW.description,
                instructions: origW.instructions, phase: origW.phase, is_template: false,
                workout_type: (origW as any).workout_type || "regular",
              } as any).select().single();
              if (!clientW) continue;

              const { data: exes } = await supabase.from("workout_exercises")
                .select("exercise_id, exercise_order, sets, reps, tempo, rest_seconds, rir, notes, video_override, progression_type, weight_increment, increment_type, rpe_threshold, progression_mode, superset_group, intensity_type, loading_type, loading_percentage, rpe_target, is_amrap")
                .eq("workout_id", w.workout_id);
              if (exes && exes.length > 0) {
                await supabase.from("workout_exercises").insert(exes.map((ex: any) => ({ ...ex, workout_id: clientW.id })));
              }

              await supabase.from("program_workouts").insert({
                week_id: newWeek!.id, workout_id: clientW.id,
                day_of_week: w.day_of_week, day_label: w.day_label, sort_order: w.sort_order,
              });
            }
          }
        }

        // Update assignment
        await supabase.from("client_program_assignments").update({
          master_version_number: newVersion,
          last_synced_at: new Date().toISOString(),
          current_phase_id: firstPhaseId,
        } as any).eq("id", target.assignmentId);
      }

      toast({ title: "Update pushed", description: `Synced ${targetAssignments.length} client(s) to v${newVersion}` });
      setShowPushDialog(false);
      loadPrograms();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setPushing(false);
    }
  };

  // ── Version history ──
  const openVersionHistory = async (programId: string) => {
    setVersionProgramId(programId);
    const { data } = await supabase
      .from("master_program_versions")
      .select("*")
      .eq("program_id", programId)
      .order("version_number", { ascending: false });
    setVersions(data || []);
    setShowVersions(true);
  };

  const duplicateProgram = async (programId: string) => {
    if (!user) return;
    try {
      const source = programs.find(p => p.id === programId);
      if (!source) return;

      const { data: newProg, error } = await supabase.from("programs").insert({
        coach_id: user.id, name: `${source.name} (Copy)`, description: source.description,
        goal_type: source.goal_type, is_template: true, is_master: source.is_master,
        duration_weeks: source.duration_weeks, tags: source.tags, version_number: 1,
      } as any).select().single();
      if (error) throw error;

      const { data: phaseRows } = await supabase.from("program_phases").select("*").eq("program_id", programId).order("phase_order");
      for (const phase of (phaseRows || [])) {
        const { data: newPhase } = await supabase.from("program_phases").insert({
          program_id: newProg.id, name: phase.name, description: phase.description,
          phase_order: phase.phase_order, duration_weeks: phase.duration_weeks,
          training_style: phase.training_style, intensity_system: phase.intensity_system,
          progression_rule: phase.progression_rule,
        }).select().single();

        if (newPhase) {
          const { data: weeks } = await supabase.from("program_weeks").select("id, week_number, name")
            .eq("program_id", programId).eq("phase_id", phase.id).order("week_number");
          for (const week of (weeks || [])) {
            const { data: newWeek } = await supabase.from("program_weeks")
              .insert({ program_id: newProg.id, phase_id: newPhase.id, week_number: week.week_number, name: week.name })
              .select().single();
            if (newWeek) {
              const { data: workouts } = await supabase.from("program_workouts")
                .select("workout_id, day_of_week, day_label, sort_order").eq("week_id", week.id);
              if (workouts && workouts.length > 0) {
                await supabase.from("program_workouts").insert(workouts.map(w => ({ ...w, week_id: newWeek.id })));
              }
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
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Program deleted" }); loadPrograms(); }
  };

  const markAsMaster = async (programId: string, isMaster: boolean) => {
    await supabase.from("programs").update({ is_master: isMaster } as any).eq("id", programId);
    toast({ title: isMaster ? "Marked as Master Program" : "Removed Master status" });
    loadPrograms();
  };

  // Drill-down view into a program
  if (drillProgramId) {
    return (
      <ProgramDetailView
        programId={drillProgramId}
        programName={drillProgramName}
        onBack={() => { setDrillProgramId(null); loadPrograms(); }}
      />
    );
  }

  if (showBuilder) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">{editingId ? "Edit Program" : "Create Program"}</h3>
          <Button variant="outline" size="sm" onClick={() => { setShowBuilder(false); setEditingId(undefined); }}>Back</Button>
        </div>
        <ProgramBuilder editProgramId={editingId} onSave={() => { setShowBuilder(false); setEditingId(undefined); loadPrograms(); }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Create master programs and assign to clients via Subscribe or Import.</p>
        <Button size="sm" onClick={() => setShowBuilder(true)}><Plus className="h-3.5 w-3.5 mr-1" /> New Program</Button>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
        </div>
      ) : programs.length === 0 ? (
        <Card><CardContent className="pt-6"><p className="text-center text-muted-foreground text-sm">No programs yet. Create your first training program.</p></CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {programs.map((program) => (
            <Card
              key={program.id}
              className="flex flex-col cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => { setDrillProgramId(program.id); setDrillProgramName(program.name); }}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1.5">
                    <CardTitle className="text-base">{program.name}</CardTitle>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="secondary" className="text-[10px]">{GOAL_LABELS[program.goal_type] || program.goal_type || "General"}</Badge>
                      {program.is_master && <Badge className="text-[10px] gap-1 bg-primary/20 text-primary"><Link2 className="h-2.5 w-2.5" /> Master</Badge>}
                      {!program.is_master && <Badge variant="outline" className="text-[10px]">Template</Badge>}
                      {phaseCounts[program.id] > 0 && <Badge variant="outline" className="text-[10px] gap-1"><Layers className="h-2.5 w-2.5" /> {phaseCounts[program.id]} phases</Badge>}
                      {program.duration_weeks && <Badge variant="outline" className="text-[10px]">{program.duration_weeks}w</Badge>}
                      <Badge variant="outline" className="text-[10px]">v{program.version_number || 1}</Badge>
                      {linkedCounts[program.id] > 0 && (
                        <Badge className="text-[10px] gap-1 bg-accent/50 text-accent-foreground">
                          <Users className="h-2.5 w-2.5" /> {linkedCounts[program.id]} linked
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-3" onClick={(e) => e.stopPropagation()}>
                {program.description && <p className="text-xs text-muted-foreground line-clamp-2">{program.description}</p>}

                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => { setDrillProgramId(program.id); setDrillProgramName(program.name); }}>
                    <Edit className="h-3.5 w-3.5 mr-1" /> Open
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => {
                    setAssignProgramId(program.id);
                    setAssignMode("subscribe");
                    setShowAssignDialog(true);
                  }} title="Subscribe / Import">
                    <Users className="h-3.5 w-3.5" />
                  </Button>
                  {linkedCounts[program.id] > 0 && (
                    <Button variant="outline" size="sm" onClick={() => openPushDialog(program.id)} title="Push update">
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openVersionHistory(program.id)} title="Version history">
                    <History className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => markAsMaster(program.id, !program.is_master)} title={program.is_master ? "Unmark master" : "Mark as master"}>
                    {program.is_master ? <Unlink className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
                  </Button>
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

      {/* ── Subscribe / Import Dialog ── */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Program to Client</DialogTitle>
            <DialogDescription>Choose how to assign this program.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Mode selector */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setAssignMode("subscribe")}
                className={`p-3 rounded-lg border text-left transition-colors ${assignMode === "subscribe" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50"}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Link2 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Subscribe</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Stays linked. Future updates sync automatically.</p>
              </button>
              <button
                onClick={() => setAssignMode("import")}
                className={`p-3 rounded-lg border text-left transition-colors ${assignMode === "import" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50"}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Unlink className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">Import</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Independent copy. No future sync.</p>
              </button>
            </div>

            <div className="space-y-2">
              <Label>Select Client</Label>
              <SearchableClientSelect
                clients={clients}
                value={selectedClientId}
                onValueChange={setSelectedClientId}
              />
            </div>

            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Auto-Advance Phases</Label>
                <p className="text-[11px] text-muted-foreground">Move to next phase when complete</p>
              </div>
              <Switch checked={autoAdvance} onCheckedChange={setAutoAdvance} />
            </div>

            <div className="p-3 rounded-lg bg-muted/30 border">
              <p className="text-[11px] text-muted-foreground">
                {assignMode === "subscribe"
                  ? "⚡ Subscribe: Client will receive automatic updates when you modify the master program."
                  : "📋 Import: Client gets a fully independent copy. Master changes won't affect their program."}
              </p>
            </div>

            <Button onClick={assignToClient} disabled={assigning || !selectedClientId} className="w-full">
              {assigning && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
              {assignMode === "subscribe" ? "Subscribe Client" : "Import to Client"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Push Update Dialog ── */}
      <Dialog open={showPushDialog} onOpenChange={setShowPushDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Push Master Update</DialogTitle>
            <DialogDescription>Sync the latest structure to linked clients. Logged workout history is preserved.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Change Log (optional)</Label>
              <Textarea value={changeLog} onChange={e => setChangeLog(e.target.value)} placeholder="What changed in this version..." className="h-20" />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">{linkedClients.length} linked client(s)</Label>
              {linkedClients.map(c => (
                <label key={c.assignmentId} className="flex items-center gap-2 p-2 rounded border hover:bg-muted/30 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedPushClients.includes(c.assignmentId)}
                    onChange={(e) => {
                      setSelectedPushClients(prev =>
                        e.target.checked ? [...prev, c.assignmentId] : prev.filter(id => id !== c.assignmentId)
                      );
                    }}
                    className="rounded"
                  />
                  <span className="text-sm flex-1">{c.name}</span>
                  <Badge variant="outline" className="text-[10px]">v{c.currentVersion}</Badge>
                </label>
              ))}
            </div>

            <Button onClick={pushUpdate} disabled={pushing || selectedPushClients.length === 0} className="w-full">
              {pushing && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
              Push to {selectedPushClients.length} Client(s)
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Version History Dialog ── */}
      <Dialog open={showVersions} onOpenChange={setShowVersions}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {versions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No version history yet. Push an update to start tracking versions.</p>
            ) : versions.map(v => (
              <div key={v.id} className="p-3 rounded-lg border space-y-1">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-[10px]">v{v.version_number}</Badge>
                  <span className="text-[10px] text-muted-foreground">{format(new Date(v.created_at), "MMM d, yyyy h:mm a")}</span>
                </div>
                <p className="text-sm">{v.change_log || "No description"}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProgramList;
