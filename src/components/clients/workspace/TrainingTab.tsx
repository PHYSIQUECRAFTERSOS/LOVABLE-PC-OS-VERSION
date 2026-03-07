import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  Dumbbell, Plus, Trash2, Copy, ChevronDown, ChevronRight,
  ArrowUp, ArrowDown, Edit2, Link2, Unlink, Search, Pencil
} from "lucide-react";
import ClientWorkoutEditorModal from "@/components/training/ClientWorkoutEditorModal";

interface Phase {
  id: string; name: string; description: string | null; phase_order: number;
  duration_weeks: number; training_style: string | null; intensity_system: string | null; progression_rule: string | null;
  directWorkouts: ProgramWorkout[];
}

interface Week {
  id: string; week_number: number; name: string; phase_id: string | null;
  workouts: ProgramWorkout[];
}

interface ProgramWorkout {
  id: string; workout_id: string; workout_name: string; day_of_week: number; day_label: string; exercises?: any[];
  sort_order?: number | null; exclude_from_numbering?: boolean; custom_tag?: string | null;
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

  // Workout editor modal
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorWorkoutId, setEditorWorkoutId] = useState("");
  const [editorWorkoutName, setEditorWorkoutName] = useState("");

  // Workout selection for bulk actions
  const [selectedWorkouts, setSelectedWorkouts] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);

  // Phase editing
  const [editingPhase, setEditingPhase] = useState<string | null>(null);
  const [phaseNameEdit, setPhaseNameEdit] = useState("");

  // Assign dialog
  const [showAssign, setShowAssign] = useState(false);
  const [assignMode, setAssignMode] = useState<"subscribe" | "import">("subscribe");
  const [masterPrograms, setMasterPrograms] = useState<any[]>([]);
  const [selectedMaster, setSelectedMaster] = useState("");
  const [assigning, setAssigning] = useState(false);

  // Detach confirm
  const [showDetach, setShowDetach] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; names: string[] } | null>(null);

  useEffect(() => { loadClientProgram(); }, [clientId, user]);

  const loadClientProgram = async () => {
    if (!clientId || !user) return;
    setLoading(true);

    const { data: assignData } = await supabase
      .from("client_program_assignments").select("*")
      .eq("client_id", clientId).eq("status", "active")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    if (!assignData) {
      setAssignment(null); setProgram(null); setPhases([]); setWeeks([]);
      setLoading(false); return;
    }

    const { data: prog } = await supabase.from("programs")
      .select("id, name, description, goal_type, version_number, is_master")
      .eq("id", assignData.program_id).maybeSingle();

    if (!prog) {
      setAssignment(null); setProgram(null); setPhases([]); setWeeks([]);
      setLoading(false); return;
    }

    setAssignment(assignData);
    setProgram(prog);

    const { data: phaseData } = await supabase.from("program_phases").select("*").eq("program_id", prog.id).order("phase_order");
    const phaseIds = (phaseData || []).map(p => p.id);
    let phaseDirectMap: Record<string, ProgramWorkout[]> = {};
    if (phaseIds.length > 0) {
      const { data: directPWs } = await supabase.from("program_workouts")
        .select("id, phase_id, workout_id, day_of_week, day_label, sort_order, exclude_from_numbering, custom_tag, workouts(id, name)")
        .in("phase_id", phaseIds).order("sort_order");
      for (const pw of (directPWs || [])) {
        const pid = (pw as any).phase_id;
        if (!phaseDirectMap[pid]) phaseDirectMap[pid] = [];
        phaseDirectMap[pid].push({
          id: pw.id, workout_id: pw.workout_id,
          workout_name: (pw.workouts as any)?.name || "Workout",
          day_of_week: pw.day_of_week ?? 0, day_label: pw.day_label || DAY_LABELS[pw.day_of_week ?? 0],
          sort_order: pw.sort_order, exclude_from_numbering: (pw as any).exclude_from_numbering || false,
          custom_tag: (pw as any).custom_tag || null,
        });
      }
    }
    setPhases((phaseData || []).map(p => ({ ...p, directWorkouts: phaseDirectMap[p.id] || [] })) as Phase[]);

    const { data: weekData } = await supabase.from("program_weeks").select("id, week_number, name, phase_id").eq("program_id", prog.id).order("week_number");
    if (weekData && weekData.length > 0) {
      const weekIds = weekData.map(w => w.id);
      const { data: pwData } = await supabase.from("program_workouts")
        .select("id, week_id, workout_id, day_of_week, day_label, sort_order, workouts(id, name)")
        .in("week_id", weekIds).order("sort_order");
      setWeeks(weekData.map(w => ({
        ...w,
        workouts: (pwData || []).filter((pw: any) => pw.week_id === w.id).map((pw: any) => ({
          id: pw.id, workout_id: pw.workout_id,
          workout_name: (pw.workouts as any)?.name || "Workout",
          day_of_week: pw.day_of_week ?? 0, day_label: pw.day_label || DAY_LABELS[pw.day_of_week ?? 0],
        })),
      })));
    } else { setWeeks([]); }

    if (assignData.current_phase_id) setExpandedPhase(assignData.current_phase_id);
    else if (phaseData && phaseData.length > 0) setExpandedPhase(phaseData[0].id);
    setLoading(false);
  };

  const openWorkoutEditor = (pw: ProgramWorkout) => {
    if (assignment?.is_linked_to_master) { setShowDetach(true); return; }
    setEditorWorkoutId(pw.workout_id);
    setEditorWorkoutName(pw.workout_name);
    setEditorOpen(true);
  };

  // ── Duplicate workout day ──
  const duplicateWorkout = async (pw: ProgramWorkout, phaseId: string) => {
    if (assignment?.is_linked_to_master) { setShowDetach(true); return; }
    if (!user) return;
    const { data: origW } = await supabase.from("workouts")
      .select("name, description, instructions, phase, workout_type").eq("id", pw.workout_id).single();
    if (!origW) return;
    const { data: newW } = await supabase.from("workouts").insert({
      coach_id: user.id, client_id: clientId, name: `${origW.name} (Copy)`,
      description: origW.description, instructions: origW.instructions, phase: origW.phase,
      is_template: false, workout_type: (origW as any).workout_type || "regular",
    } as any).select().single();
    if (!newW) return;
    const { data: exes } = await supabase.from("workout_exercises")
      .select("exercise_id, exercise_order, sets, reps, tempo, rest_seconds, rir, notes, superset_group, intensity_type, loading_type, loading_percentage, rpe_target, is_amrap, grouping_type, grouping_id")
      .eq("workout_id", pw.workout_id);
    if (exes && exes.length > 0) {
      await supabase.from("workout_exercises").insert(exes.map((ex: any) => ({ ...ex, workout_id: newW.id })));
    }
    await supabase.from("program_workouts").insert({
      phase_id: phaseId, workout_id: newW.id, day_of_week: pw.day_of_week,
      day_label: `${pw.day_label} (Copy)`, sort_order: 99,
    });
    toast({ title: "Workout duplicated" });
    loadClientProgram();
  };

  // ── Delete workouts ──
  const deleteWorkouts = async (programWorkoutIds: string[]) => {
    for (const pwId of programWorkoutIds) {
      await supabase.from("program_workouts").delete().eq("id", pwId);
    }
    toast({ title: `${programWorkoutIds.length} workout(s) deleted` });
    setSelectedWorkouts(new Set());
    setSelectionMode(false);
    setDeleteTarget(null);
    loadClientProgram();
  };

  // ── Move workout to different phase ──
  const moveWorkoutToPhase = async (programWorkoutId: string, targetPhaseId: string) => {
    if (assignment?.is_linked_to_master) { setShowDetach(true); return; }
    await supabase.from("program_workouts").update({ phase_id: targetPhaseId, week_id: null } as any).eq("id", programWorkoutId);
    toast({ title: "Workout moved" });
    loadClientProgram();
  };

  // ── Assign (Subscribe / Import) ──
  const openAssignDialog = async () => {
    const { data } = await supabase.from("programs").select("id, name, goal_type, duration_weeks, is_master, version_number")
      .eq("coach_id", user!.id).eq("is_template", true).order("name");
    setMasterPrograms(data || []);
    setShowAssign(true);
  };

  const handleAssignProgram = async () => {
    if (!selectedMaster || !user) return;
    setAssigning(true);
    try {
      const master = masterPrograms.find(p => p.id === selectedMaster);
      if (!master) throw new Error("Program not found");
      const isLinked = assignMode === "subscribe";

      const { data: clientProg, error: progErr } = await supabase.from("programs").insert({
        coach_id: user.id, client_id: clientId, name: master.name, description: null,
        goal_type: master.goal_type, is_template: false, is_master: false,
        duration_weeks: master.duration_weeks, version_number: master.version_number || 1,
      } as any).select().single();
      if (progErr) throw progErr;

      const { data: masterPhases } = await supabase.from("program_phases").select("*")
        .eq("program_id", selectedMaster).order("phase_order");
      let firstPhaseId: string | null = null;

      for (const phase of (masterPhases || [])) {
        const { data: newPhase } = await supabase.from("program_phases").insert({
          program_id: clientProg.id, name: phase.name, description: phase.description,
          phase_order: phase.phase_order, duration_weeks: phase.duration_weeks,
          training_style: phase.training_style, intensity_system: phase.intensity_system,
          progression_rule: phase.progression_rule,
        }).select().single();
        if (!firstPhaseId) firstPhaseId = newPhase?.id || null;

        const cloneWorkout = async (sourceWorkoutId: string) => {
          const { data: origW } = await supabase.from("workouts")
            .select("name, description, instructions, phase, workout_type").eq("id", sourceWorkoutId).single();
          if (!origW) return null;
          const { data: clientW } = await supabase.from("workouts").insert({
            coach_id: user.id, client_id: clientId, name: origW.name, description: origW.description,
            instructions: origW.instructions, phase: origW.phase, is_template: false,
            workout_type: (origW as any).workout_type || "regular",
          } as any).select().single();
          if (!clientW) return null;
          const { data: exes } = await supabase.from("workout_exercises")
            .select("exercise_id, exercise_order, sets, reps, tempo, rest_seconds, rir, notes, video_override, progression_type, weight_increment, increment_type, rpe_threshold, progression_mode, superset_group, intensity_type, loading_type, loading_percentage, rpe_target, is_amrap, grouping_type, grouping_id")
            .eq("workout_id", sourceWorkoutId);
          if (exes && exes.length > 0) {
            await supabase.from("workout_exercises").insert(exes.map((ex: any) => ({ ...ex, workout_id: clientW.id })));
          }
          return clientW;
        };

        const { data: phaseDirectPWs } = await supabase.from("program_workouts")
          .select("*").eq("phase_id", phase.id).order("sort_order");

        if (phaseDirectPWs && phaseDirectPWs.length > 0) {
          for (const pw of phaseDirectPWs) {
            const clientW = await cloneWorkout(pw.workout_id);
            if (!clientW) continue;
            await supabase.from("program_workouts").insert({
              phase_id: newPhase!.id, workout_id: clientW.id,
              day_of_week: pw.day_of_week, day_label: pw.day_label, sort_order: pw.sort_order,
            });
          }
        } else {
          const { data: masterWeeks } = await supabase.from("program_weeks").select("*")
            .eq("program_id", selectedMaster).eq("phase_id", phase.id).order("week_number");
          for (const week of (masterWeeks || [])) {
            const { data: newWeek } = await supabase.from("program_weeks")
              .insert({ program_id: clientProg.id, phase_id: newPhase!.id, week_number: week.week_number, name: week.name })
              .select().single();
            const { data: masterPW } = await supabase.from("program_workouts").select("*").eq("week_id", week.id).order("sort_order");
            for (const pw of (masterPW || [])) {
              const clientW = await cloneWorkout(pw.workout_id);
              if (!clientW) continue;
              await supabase.from("program_workouts").insert({
                week_id: newWeek!.id, workout_id: clientW.id,
                day_of_week: pw.day_of_week, day_label: pw.day_label, sort_order: pw.sort_order,
              });
            }
          }
        }
      }

      await supabase.from("client_program_assignments").update({ status: "completed" })
        .eq("client_id", clientId).eq("status", "active");

      await supabase.from("client_program_assignments").insert({
        client_id: clientId, coach_id: user.id, program_id: clientProg.id,
        current_phase_id: firstPhaseId, current_week_number: 1,
        forked_from_program_id: selectedMaster, status: "active",
        is_linked_to_master: isLinked, master_version_number: master.version_number || 1,
        last_synced_at: new Date().toISOString(),
      });

      toast({ title: isLinked ? "Client subscribed" : "Program imported" });
      setShowAssign(false); setSelectedMaster("");
      loadClientProgram();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setAssigning(false); }
  };

  const detachFromMaster = async () => {
    if (!assignment) return;
    await supabase.from("client_program_assignments").update({ is_linked_to_master: false } as any).eq("id", assignment.id);
    toast({ title: "Detached from master", description: "This program is now fully independent." });
    setShowDetach(false);
    loadClientProgram();
  };

  const renamePhase = async (phaseId: string, newName: string) => {
    await supabase.from("program_phases").update({ name: newName }).eq("id", phaseId);
    setPhases(prev => prev.map(p => p.id === phaseId ? { ...p, name: newName } : p));
    setEditingPhase(null);
  };

  const duplicatePhase = async (phase: Phase) => {
    if (!program) return;
    await supabase.from("program_phases").insert({
      program_id: program.id, name: `${phase.name} (Copy)`, description: phase.description,
      phase_order: phases.length + 1, duration_weeks: phase.duration_weeks,
      training_style: phase.training_style, intensity_system: phase.intensity_system,
      progression_rule: phase.progression_rule,
    });
    toast({ title: "Phase duplicated" }); loadClientProgram();
  };

  const deletePhase = async (phaseId: string) => {
    const phaseWeekIds = weeks.filter(w => w.phase_id === phaseId).map(w => w.id);
    if (phaseWeekIds.length > 0) {
      await supabase.from("program_workouts").delete().in("week_id", phaseWeekIds);
      await supabase.from("program_weeks").delete().in("id", phaseWeekIds);
    }
    await supabase.from("program_workouts").delete().eq("phase_id", phaseId);
    await supabase.from("program_phases").delete().eq("id", phaseId);
    toast({ title: "Phase deleted" }); loadClientProgram();
  };

  const movePhase = async (phaseId: string, direction: "up" | "down") => {
    const idx = phases.findIndex(p => p.id === phaseId);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= phases.length) return;
    await Promise.all([
      supabase.from("program_phases").update({ phase_order: swapIdx + 1 }).eq("id", phases[idx].id),
      supabase.from("program_phases").update({ phase_order: idx + 1 }).eq("id", phases[swapIdx].id),
    ]);
    loadClientProgram();
  };

  const guardEdit = (action: () => void) => {
    if (assignment?.is_linked_to_master) setShowDetach(true);
    else action();
  };

  const toggleWorkoutSelection = (pwId: string) => {
    setSelectedWorkouts(prev => {
      const next = new Set(prev);
      if (next.has(pwId)) next.delete(pwId);
      else next.add(pwId);
      return next;
    });
  };

  const allWorkouts = phases.flatMap(p => p.directWorkouts);

  // ── Workout card ──
  const renderWorkoutCard = (pw: ProgramWorkout, phaseId: string, displayDayNumber?: number | null, customTag?: string | null) => (
    <div key={pw.id} className="flex items-center gap-2 p-3 border rounded-lg bg-card/50 hover:bg-muted/30 transition-colors group">
      {selectionMode && (
        <Checkbox checked={selectedWorkouts.has(pw.id)} onCheckedChange={() => toggleWorkoutSelection(pw.id)} className="shrink-0" />
      )}
      <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
        <Dumbbell className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {customTag ? (
            <Badge className="text-[9px] h-4 shrink-0 bg-slate-600/30 text-slate-300 border-slate-500/30">{customTag}</Badge>
          ) : displayDayNumber != null ? (
            <Badge variant="outline" className="text-[9px] h-4 shrink-0">Day {displayDayNumber}</Badge>
          ) : null}
          <p className="text-sm font-medium truncate">{pw.workout_name}</p>
        </div>
      </div>
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openWorkoutEditor(pw)} title="Edit workout">
          <Pencil className="h-3 w-3" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => guardEdit(() => duplicateWorkout(pw, phaseId))} title="Duplicate">
          <Copy className="h-3 w-3" />
        </Button>
        {phases.length > 1 && (
          <Select onValueChange={v => guardEdit(() => moveWorkoutToPhase(pw.id, v))}>
            <SelectTrigger className="h-7 w-7 p-0 border-0 [&>svg]:hidden" title="Move to phase">
              <ArrowUp className="h-3 w-3" />
            </SelectTrigger>
            <SelectContent>
              {phases.filter(p => p.id !== phaseId).map(p => (
                <SelectItem key={p.id} value={p.id}>Move to {p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
          onClick={() => guardEdit(() => setDeleteTarget({ ids: [pw.id], names: [pw.workout_name] }))} title="Delete">
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );

  if (loading) return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>;

  if (!assignment || !program) {
    return (
      <Card>
        <CardContent className="pt-6 text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto"><Dumbbell className="h-8 w-8 text-muted-foreground" /></div>
          <p className="text-muted-foreground">No training program assigned yet.</p>
          <Button onClick={openAssignDialog}><Plus className="h-4 w-4 mr-2" /> Assign Program</Button>
          <AssignDialog open={showAssign} onOpenChange={setShowAssign} programs={masterPrograms}
            selected={selectedMaster} onSelect={setSelectedMaster} onAssign={handleAssignProgram}
            loading={assigning} mode={assignMode} onModeChange={setAssignMode} />
        </CardContent>
      </Card>
    );
  }

  const isLinked = assignment.is_linked_to_master;

  return (
    <div className="space-y-4">
      {/* Program Header */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-foreground text-lg">{program.name}</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {program.goal_type && <Badge variant="secondary" className="text-[10px]">{program.goal_type}</Badge>}
                <span className="text-xs text-muted-foreground">
                  Week {assignment.current_week_number} · {phases.length} phase{phases.length !== 1 ? "s" : ""}
                </span>
                <Badge variant="outline" className="text-[10px]">v{assignment.master_version_number || 1}</Badge>
                {isLinked ? (
                  <Badge className="text-[10px] gap-1 bg-primary/20 text-primary"><Link2 className="h-2.5 w-2.5" /> Linked to Master</Badge>
                ) : assignment.forked_from_program_id ? (
                  <Badge variant="outline" className="text-[10px] gap-1"><Unlink className="h-2.5 w-2.5" /> Detached</Badge>
                ) : null}
              </div>
            </div>
            <div className="flex gap-2">
              {isLinked && (
                <Button variant="outline" size="sm" onClick={() => setShowDetach(true)}>
                  <Unlink className="h-3.5 w-3.5 mr-1" /> Detach & Edit
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={openAssignDialog}>Change</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Selection toolbar */}
      {selectionMode && selectedWorkouts.size > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <span className="text-sm font-medium">{selectedWorkouts.size} selected</span>
          <div className="flex-1" />
          <Button size="sm" variant="outline" className="h-8 text-xs"
            onClick={() => {
              const names = allWorkouts.filter(w => selectedWorkouts.has(w.id)).map(w => w.workout_name);
              guardEdit(() => setDeleteTarget({ ids: Array.from(selectedWorkouts), names }));
            }}>
            <Trash2 className="h-3 w-3 mr-1" /> Delete
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setSelectionMode(false); setSelectedWorkouts(new Set()); }}>
            Cancel
          </Button>
        </div>
      )}

      {/* Phases */}
      {phases.map((phase, phaseIdx) => {
        const phaseWeeks = weeks.filter(w => w.phase_id === phase.id);
        const totalWorkouts = phase.directWorkouts.length + phaseWeeks.reduce((s, w) => s + w.workouts.length, 0);
        const isExpanded = expandedPhase === phase.id;
        const isCurrent = assignment.current_phase_id === phase.id;

        return (
          <Card key={phase.id} className={`overflow-hidden ${isCurrent ? "ring-1 ring-primary/50" : ""}`}>
            <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => setExpandedPhase(isExpanded ? null : phase.id)}>
              <div className="flex items-center gap-3">
                {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <div>
                  {editingPhase === phase.id ? (
                    <Input autoFocus value={phaseNameEdit} onChange={e => setPhaseNameEdit(e.target.value)}
                      onBlur={() => renamePhase(phase.id, phaseNameEdit)}
                      onKeyDown={e => e.key === "Enter" && renamePhase(phase.id, phaseNameEdit)}
                      onClick={e => e.stopPropagation()} className="h-7 w-48 text-sm" />
                  ) : (
                    <h4 className="font-semibold text-sm text-foreground">{phase.name}</h4>
                  )}
                  <div className="flex items-center gap-2 mt-0.5">
                    {isCurrent && <Badge className="text-[9px] h-4">Current</Badge>}
                    {phase.training_style && <span className="text-[10px] text-muted-foreground">{TRAINING_STYLE_LABELS[phase.training_style] || phase.training_style}</span>}
                    <span className="text-[10px] text-muted-foreground">{phase.duration_weeks}w · {totalWorkouts} workouts</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => movePhase(phase.id, "up")} disabled={phaseIdx === 0}><ArrowUp className="h-3 w-3" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => movePhase(phase.id, "down")} disabled={phaseIdx === phases.length - 1}><ArrowDown className="h-3 w-3" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => guardEdit(() => { setEditingPhase(phase.id); setPhaseNameEdit(phase.name); })}><Edit2 className="h-3 w-3" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => duplicatePhase(phase)}><Copy className="h-3 w-3" /></Button>
                {!selectionMode && (
                  <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2"
                    onClick={() => { setSelectionMode(true); setSelectedWorkouts(new Set()); }}>
                    Select
                  </Button>
                )}
                {phases.length > 1 && (
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => guardEdit(() => deletePhase(phase.id))}><Trash2 className="h-3 w-3" /></Button>
                )}
              </div>
            </div>

            {isExpanded && (
              <CardContent className="pt-0 space-y-2 pb-4">
                {(() => {
                  const sorted = [...phase.directWorkouts].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));
                  let dayCounter = 1;
                  return sorted.map(pw => {
                    const isExcluded = pw.exclude_from_numbering;
                    const pos = isExcluded ? null : dayCounter++;
                    return renderWorkoutCard(pw, phase.id, pos, isExcluded ? pw.custom_tag : null);
                  });
                })()}

                {phaseWeeks.length === 0 && phase.directWorkouts.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No workouts in this phase.</p>
                ) : phaseWeeks.map(week => (
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
                      ) : (() => {
                        const sorted = [...week.workouts].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));
                        let dayCounter = 1;
                        return sorted.map(pw => {
                          const isExcluded = pw.exclude_from_numbering;
                          const pos = isExcluded ? null : dayCounter++;
                          return renderWorkoutCard(pw, phase.id, pos, isExcluded ? pw.custom_tag : null);
                        });
                      })()}
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Add Phase */}
      <Button variant="outline" className="w-full" onClick={() => guardEdit(async () => {
        if (!program) return;
        await supabase.from("program_phases").insert({
          program_id: program.id, name: `Phase ${phases.length + 1}`, phase_order: phases.length + 1, duration_weeks: 4,
        });
        toast({ title: "Phase added" }); loadClientProgram();
      })}>
        <Plus className="h-4 w-4 mr-2" /> Add Phase
      </Button>

      {/* Assign Dialog */}
      <AssignDialog open={showAssign} onOpenChange={setShowAssign} programs={masterPrograms}
        selected={selectedMaster} onSelect={setSelectedMaster} onAssign={handleAssignProgram}
        loading={assigning} mode={assignMode} onModeChange={setAssignMode} />

      {/* Detach Confirmation */}
      <AlertDialog open={showDetach} onOpenChange={setShowDetach}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Detach & Edit Program?</AlertDialogTitle>
            <AlertDialogDescription>
              This client is linked to a master program. Detaching will make this program fully independent — future master updates will no longer sync.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={detachFromMaster}>Detach & Edit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workout{(deleteTarget?.ids.length ?? 0) > 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.names.map((n, i) => <span key={i} className="block text-sm font-medium">{n}</span>)}
              <span className="block mt-2">This cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteWorkouts(deleteTarget.ids)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Full-screen Workout Editor Modal */}
      <ClientWorkoutEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaved={() => loadClientProgram()}
        workoutId={editorWorkoutId}
        workoutName={editorWorkoutName}
        clientId={clientId}
      />
    </div>
  );
};

// ── Assign Dialog ──
const AssignDialog = ({ open, onOpenChange, programs, selected, onSelect, onAssign, loading, mode, onModeChange }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  programs: any[]; selected: string; onSelect: (v: string) => void;
  onAssign: () => void; loading: boolean;
  mode: "subscribe" | "import"; onModeChange: (m: "subscribe" | "import") => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Assign Training Program</DialogTitle>
        <DialogDescription>Choose a master program and assignment mode.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => onModeChange("subscribe")}
            className={`p-3 rounded-lg border text-left transition-colors ${mode === "subscribe" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50"}`}>
            <div className="flex items-center gap-2 mb-1">
              <Link2 className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Subscribe</span>
            </div>
            <p className="text-[11px] text-muted-foreground">Stays linked. Future updates sync.</p>
          </button>
          <button onClick={() => onModeChange("import")}
            className={`p-3 rounded-lg border text-left transition-colors ${mode === "import" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50"}`}>
            <div className="flex items-center gap-2 mb-1">
              <Unlink className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Import</span>
            </div>
            <p className="text-[11px] text-muted-foreground">Independent copy. No sync.</p>
          </button>
        </div>
        <div>
          <Label>Select Program</Label>
          <Select value={selected} onValueChange={onSelect}>
            <SelectTrigger><SelectValue placeholder="Choose a program" /></SelectTrigger>
            <SelectContent>
              {programs.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} {p.is_master ? "⭐" : ""} {p.goal_type ? `(${p.goal_type})` : ""} v{p.version_number || 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="p-3 rounded-lg bg-muted/30 border">
          <p className="text-[11px] text-muted-foreground">
            {mode === "subscribe"
              ? "⚡ Subscribe: Client stays linked to master. Push updates will sync automatically."
              : "📋 Import: Client gets an independent copy. Master changes won't affect them."}
          </p>
        </div>
        <Button onClick={onAssign} disabled={!selected || loading} className="w-full">
          {loading ? "Assigning..." : mode === "subscribe" ? "Subscribe Client" : "Import Program"}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

export default ClientWorkspaceTraining;
