import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cloneWorkoutWithExercises, buildImportSummary, formatImportSummary } from "@/lib/cloneWorkoutHelpers";
import { useAuth } from "@/hooks/useAuth";
import { useClientProgram } from "@/hooks/useClientProgram";
import { useIsMobile } from "@/hooks/use-mobile";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Dumbbell, Plus, Trash2, Copy, ChevronDown, ChevronRight,
  ArrowUp, ArrowDown, Edit2, Link2, Unlink, Search, Pencil,
  Download, Loader2
} from "lucide-react";
import ClientWorkoutEditorModal from "@/components/training/ClientWorkoutEditorModal";
import MobileWorkoutEditor from "@/components/training/MobileWorkoutEditor";
import WorkoutPreviewModal from "@/components/training/WorkoutPreviewModal";
import WorkoutBuilderModal from "@/components/training/WorkoutBuilderModal";
import SearchableClientSelect from "@/components/ui/searchable-client-select";
import ClientProgramTwoPane from "./training/ClientProgramTwoPane";
import ChangeDurationDialog from "./training/ChangeDurationDialog";
import CopyPhaseToMasterDialog from "./training/CopyPhaseToMasterDialog";
import CopyPhaseToClientDialog from "./training/CopyPhaseToClientDialog";
import { copyPhaseToMasterProgram, copyPhaseToClientProgram } from "@/lib/copyPhaseHelpers";

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
  const { user, role } = useAuth();
  const userId = user?.id;
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // Shared hook — single source of truth for client program data
  const {
    assignment, program, phases: hookPhases, weeks: hookWeeks,
    loading, reload: loadClientProgram,
  } = useClientProgram(clientId);

  const [phases, setPhases] = useState<Phase[]>([]);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);

  // Workout editor modal
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorWorkoutId, setEditorWorkoutId] = useState("");
  const [editorWorkoutName, setEditorWorkoutName] = useState("");

  // Workout preview modal
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewWorkoutId, setPreviewWorkoutId] = useState<string | null>(null);
  const [previewWorkoutName, setPreviewWorkoutName] = useState("");

  // Workout builder modal (New workout)
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderPhaseId, setBuilderPhaseId] = useState<string | null>(null);

  // Mobile workout editor
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);
  const [mobileEditorWorkoutId, setMobileEditorWorkoutId] = useState("");
  const [mobileEditorWorkoutName, setMobileEditorWorkoutName] = useState("");

  // Import dialog
  const [importOpen, setImportOpen] = useState(false);
  const [importPhaseId, setImportPhaseId] = useState<string | null>(null);
  const [importSource, setImportSource] = useState<"master" | "client">("master");
  const [importWorkouts, setImportWorkouts] = useState<any[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importSelectedClient, setImportSelectedClient] = useState("");
  const [importClients, setImportClients] = useState<{ id: string; name: string }[]>([]);
  const [importSelectedWorkout, setImportSelectedWorkout] = useState("");
  const [importing, setImporting] = useState(false);

  // Workout selection for bulk actions
  const [selectedWorkouts, setSelectedWorkouts] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);

  // Phase editing
  const [editingPhase, setEditingPhase] = useState<string | null>(null);
  const [phaseNameEdit, setPhaseNameEdit] = useState("");
  const [editingProgramName, setEditingProgramName] = useState(false);
  const [programNameEdit, setProgramNameEdit] = useState("");

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

  // Two-pane phase action dialogs
  const [changeDurationPhase, setChangeDurationPhase] = useState<Phase | null>(null);
  const [copyToMasterPhase, setCopyToMasterPhase] = useState<Phase | null>(null);
  const [copyToClientPhase, setCopyToClientPhase] = useState<Phase | null>(null);
  const [deletePhaseTarget, setDeletePhaseTarget] = useState<Phase | null>(null);
  const [aiCreateOpen, setAiCreateOpen] = useState(false);
  const [clientDisplayName, setClientDisplayName] = useState<string>("Client");

  useEffect(() => {
    if (!clientId) return;
    supabase.from("profiles")
      .select("full_name")
      .eq("user_id", clientId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.full_name) setClientDisplayName(data.full_name);
      });
  }, [clientId]);

  // Sync hook data into local state (needed for editor mutations)
  useEffect(() => {
    setPhases(hookPhases as Phase[]);
    setWeeks(hookWeeks as Week[]);
    if (assignment?.current_phase_id) setExpandedPhase(assignment.current_phase_id);
    else if (hookPhases.length > 0) setExpandedPhase(hookPhases[0].id);
  }, [hookPhases, hookWeeks, assignment]);

  const openWorkoutEditor = (pw: ProgramWorkout) => {
    if (assignment?.is_linked_to_master) { setShowDetach(true); return; }
    if (isMobile) {
      setMobileEditorWorkoutId(pw.workout_id);
      setMobileEditorWorkoutName(pw.workout_name);
      setMobileEditorOpen(true);
    } else {
      setEditorWorkoutId(pw.workout_id);
      setEditorWorkoutName(pw.workout_name);
      setEditorOpen(true);
    }
  };

  const openWorkoutPreview = (pw: ProgramWorkout) => {
    setPreviewWorkoutId(pw.workout_id);
    setPreviewWorkoutName(pw.workout_name);
    setPreviewOpen(true);
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

  // ── Clone workout helper (uses shared sequential logic) ──
  const cloneWorkoutToClientTracked = async (sourceWorkoutId: string) => {
    if (!user) return { workout: null, result: { workoutId: sourceWorkoutId, workoutName: "Unknown", exercisesExpected: 0, exercisesCopied: 0, errors: ["Not authenticated"] } as import("@/lib/cloneWorkoutHelpers").CloneWorkoutResult };
    return cloneWorkoutWithExercises(sourceWorkoutId, user.id, clientId, false);
  };

  const cloneWorkoutToClient = async (sourceWorkoutId: string): Promise<any | null> => {
    const { workout } = await cloneWorkoutToClientTracked(sourceWorkoutId);
    return workout;
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
      const allCloneResults: import("@/lib/cloneWorkoutHelpers").CloneWorkoutResult[] = [];

      for (const phase of (masterPhases || [])) {
        const { data: newPhase } = await supabase.from("program_phases").insert({
          program_id: clientProg.id, name: phase.name, description: phase.description,
          phase_order: phase.phase_order, duration_weeks: phase.duration_weeks,
          training_style: phase.training_style, intensity_system: phase.intensity_system,
          progression_rule: phase.progression_rule,
        }).select().single();
        if (!firstPhaseId) firstPhaseId = newPhase?.id || null;

        const { data: phaseDirectPWs } = await supabase.from("program_workouts")
          .select("*").eq("phase_id", phase.id).order("sort_order");

        if (phaseDirectPWs && phaseDirectPWs.length > 0) {
          for (const pw of phaseDirectPWs) {
            const { workout: clientW, result } = await cloneWorkoutToClientTracked(pw.workout_id);
            allCloneResults.push(result);
            if (!clientW) continue;
            await supabase.from("program_workouts").insert({
              phase_id: newPhase!.id, workout_id: clientW.id,
              day_of_week: pw.day_of_week, day_label: pw.day_label, sort_order: pw.sort_order,
              exclude_from_numbering: pw.exclude_from_numbering || false,
              custom_tag: pw.custom_tag || null,
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
              const { workout: clientW, result } = await cloneWorkoutToClientTracked(pw.workout_id);
              allCloneResults.push(result);
              if (!clientW) continue;
              await supabase.from("program_workouts").insert({
                week_id: newWeek!.id, workout_id: clientW.id,
                day_of_week: pw.day_of_week, day_label: pw.day_label, sort_order: pw.sort_order,
                exclude_from_numbering: pw.exclude_from_numbering || false,
                custom_tag: pw.custom_tag || null,
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

      const summary = buildImportSummary(allCloneResults);
      const msg = formatImportSummary(summary);
      toast({ title: isLinked ? "Client subscribed" : msg.title, description: isLinked ? "Future updates will sync." : msg.description, variant: msg.isWarning ? "destructive" : undefined });
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

  const changePhaseDuration = async (phaseId: string, weeks: number) => {
    await supabase.from("program_phases").update({ duration_weeks: weeks }).eq("id", phaseId);
    toast({ title: "Duration updated", description: `Phase set to ${weeks} week${weeks !== 1 ? "s" : ""}.` });
    loadClientProgram();
  };

  const handleAddPhase = async () => {
    if (!program) return;
    await supabase.from("program_phases").insert({
      program_id: program.id,
      name: `Phase ${phases.length + 1}`,
      phase_order: phases.length + 1,
      duration_weeks: 4,
    });
    toast({ title: "Phase added" });
    loadClientProgram();
  };

  const handleCopyPhaseToMaster = async (phase: Phase, targetMasterProgramId: string) => {
    if (!user) return;
    const result = await copyPhaseToMasterProgram({
      coachId: user.id,
      sourcePhase: phase,
      targetMasterProgramId,
    });
    if (!result.ok) {
      toast({ title: "Copy failed", description: result.error || "Unknown error", variant: "destructive" });
      return;
    }
    toast({
      title: result.message.title,
      description: result.message.description,
      variant: result.message.isWarning ? "destructive" : undefined,
    });
  };

  const handleCopyPhaseToClient = async (phase: Phase, targetClientId: string) => {
    if (!user) return;
    const result = await copyPhaseToClientProgram({
      coachId: user.id,
      sourcePhase: phase,
      targetClientId,
    });
    if (!result.ok) {
      toast({ title: "Copy failed", description: result.error || "Unknown error", variant: "destructive" });
      return;
    }
    toast({
      title: result.message.title,
      description: result.message.description,
      variant: result.message.isWarning ? "destructive" : undefined,
    });
  };

  const renameProgram = async (newName: string) => {
    if (!program || !newName.trim()) { setEditingProgramName(false); return; }
    await supabase.from("programs").update({ name: newName.trim() }).eq("id", program.id);
    setEditingProgramName(false);
    toast({ title: "Program renamed" });
    loadClientProgram();
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

  // ── New workout created via builder ──
  const handleNewWorkoutCreated = async (workoutId: string, workoutName: string) => {
    if (!builderPhaseId) return;
    const phase = phases.find(p => p.id === builderPhaseId);
    const sortOrder = phase ? phase.directWorkouts.length + 1 : 1;
    await supabase.from("program_workouts").insert({
      phase_id: builderPhaseId, workout_id: workoutId,
      day_of_week: 0, day_label: workoutName, sort_order: sortOrder,
    });
    toast({ title: "Workout added to phase" });
    setBuilderOpen(false);
    setBuilderPhaseId(null);
    loadClientProgram();
  };

  // ── Import flow ──
  const openImportDialog = async (phaseId: string) => {
    setImportPhaseId(phaseId);
    setImportSource("master");
    setImportSelectedWorkout("");
    setImportSelectedClient("");
    setImportOpen(true);
    // Load master workouts
    loadMasterWorkouts();
    // Load clients for client import
    loadImportClients();
  };

  const loadMasterWorkouts = async () => {
    if (!user) return;
    setImportLoading(true);
    const { data } = await supabase.from("workouts")
      .select("id, name, description, workout_type")
      .eq("coach_id", user.id).eq("is_template", true)
      .order("name");
    setImportWorkouts(data || []);
    setImportLoading(false);
  };

  const loadImportClients = async () => {
    if (!user) return;
    const { data } = await supabase.from("coach_clients")
      .select("client_id, profiles!coach_clients_client_id_fkey(full_name)")
      .eq("coach_id", user.id).eq("status", "active");
    setImportClients((data || []).filter((c: any) => c.client_id !== clientId).map((c: any) => ({
      id: c.client_id,
      name: (c.profiles as any)?.full_name || "Client",
    })));
  };

  const loadClientWorkouts = async (selectedClientId: string) => {
    setImportLoading(true);
    // Get the client's active program workouts
    const { data: assignData } = await supabase.from("client_program_assignments")
      .select("program_id").eq("client_id", selectedClientId).eq("status", "active")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!assignData) {
      setImportWorkouts([]);
      setImportLoading(false);
      return;
    }
    const { data: phasesData } = await supabase.from("program_phases")
      .select("id").eq("program_id", assignData.program_id);
    const phaseIds = (phasesData || []).map(p => p.id);
    if (phaseIds.length === 0) {
      setImportWorkouts([]);
      setImportLoading(false);
      return;
    }
    const { data: pws } = await supabase.from("program_workouts")
      .select("workout_id, workouts(id, name, description, workout_type)")
      .in("phase_id", phaseIds);
    const unique = new Map<string, any>();
    for (const pw of (pws || [])) {
      const w = (pw as any).workouts;
      if (w && !unique.has(w.id)) unique.set(w.id, w);
    }
    setImportWorkouts(Array.from(unique.values()));
    setImportLoading(false);
  };

  const handleImportWorkout = async () => {
    if (!importSelectedWorkout || !importPhaseId || !user) return;
    setImporting(true);
    try {
      const clientW = await cloneWorkoutToClient(importSelectedWorkout);
      if (!clientW) throw new Error("Failed to clone workout");
      const phase = phases.find(p => p.id === importPhaseId);
      const sortOrder = phase ? phase.directWorkouts.length + 1 : 1;
      await supabase.from("program_workouts").insert({
        phase_id: importPhaseId, workout_id: clientW.id,
        day_of_week: 0, day_label: clientW.name, sort_order: sortOrder,
      });
      toast({ title: "Workout imported" });
      setImportOpen(false);
      loadClientProgram();
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const allWorkouts = phases.flatMap(p => p.directWorkouts);

  // ── Workout card ──
  const renderWorkoutCard = (pw: ProgramWorkout, phaseId: string, displayDayNumber?: number | null, customTag?: string | null) => (
    <div key={pw.id} className="flex items-center gap-2 p-3 border rounded-lg bg-card/50 hover:bg-muted/30 transition-colors group cursor-pointer"
      onClick={() => openWorkoutPreview(pw)}>
      {selectionMode && (
        <Checkbox checked={selectedWorkouts.has(pw.id)} onCheckedChange={() => toggleWorkoutSelection(pw.id)} className="shrink-0" onClick={e => e.stopPropagation()} />
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
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
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
    const handleBuildFromScratch = async () => {
      if (!user) return;
      setAssigning(true);
      try {
        const { data: newProg, error: progErr } = await supabase.from("programs").insert({
          coach_id: user.id, client_id: clientId, name: "Custom Program",
          is_template: false, is_master: false,
        } as any).select().single();
        if (progErr || !newProg) throw progErr || new Error("Failed to create program");

        const { data: newPhase } = await supabase.from("program_phases").insert({
          program_id: newProg.id, name: "Phase 1", phase_order: 1, duration_weeks: 4,
        }).select().single();

        await supabase.from("client_program_assignments").update({ status: "completed" })
          .eq("client_id", clientId).eq("status", "active");

        await supabase.from("client_program_assignments").insert({
          client_id: clientId, coach_id: user.id, program_id: newProg.id,
          current_phase_id: newPhase?.id || null, status: "active",
          is_linked_to_master: false, master_version_number: 1,
        });

        toast({ title: "Program created", description: "Start adding workouts to your new program." });
        loadClientProgram();
      } catch (err: any) {
        toast({ title: "Error", description: err?.message || "Failed to create program", variant: "destructive" });
      } finally {
        setAssigning(false);
      }
    };

    return (
      <Card>
        <CardContent className="pt-6 text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto"><Dumbbell className="h-8 w-8 text-muted-foreground" /></div>
          <p className="text-muted-foreground">No training program assigned yet.</p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Button onClick={openAssignDialog}><Plus className="h-4 w-4 mr-2" /> Assign Program</Button>
            <Button variant="outline" onClick={handleBuildFromScratch} disabled={assigning}>
              <Dumbbell className="h-4 w-4 mr-2" /> Build from Scratch
            </Button>
          </div>
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
      {/* Two-pane Trainerize-style layout (replaces stacked phase Cards) */}
      <ClientProgramTwoPane
        programName={program.name}
        programGoalType={program.goal_type}
        isLinkedToMaster={isLinked}
        currentPhaseId={assignment.current_phase_id}
        currentWeekNumber={assignment.current_week_number}
        phases={phases}
        loading={loading}
        onNewWorkout={(phaseId) => guardEdit(() => { setBuilderPhaseId(phaseId); setBuilderOpen(true); })}
        onImport={(phaseId) => guardEdit(() => openImportDialog(phaseId))}
        onOpenWorkout={(pw) => openWorkoutPreview(pw)}
        onEditWorkout={(pw) => openWorkoutEditor(pw)}
        onDuplicateWorkout={(pw, phaseId) => guardEdit(() => duplicateWorkout(pw, phaseId))}
        onDeleteWorkout={(pwId, name) => guardEdit(() => setDeleteTarget({ ids: [pwId], names: [name] }))}
        onAddPhase={() => guardEdit(handleAddPhase)}
        onRenamePhase={renamePhase}
        onChangeDuration={(phaseId) => {
          const target = phases.find(p => p.id === phaseId);
          if (target) setChangeDurationPhase(target);
        }}
        onDuplicatePhase={(phase) => guardEdit(() => duplicatePhase(phase))}
        onDeletePhase={(phase) => guardEdit(() => setDeletePhaseTarget(phase))}
        onCopyPhaseToMaster={(phase) => setCopyToMasterPhase(phase)}
        onCopyPhaseToClient={(phase) => setCopyToClientPhase(phase)}
        onAICreatePhase={() => guardEdit(() => setAiCreateOpen(true))}
        onChangeProgram={openAssignDialog}
        onDetach={isLinked ? () => setShowDetach(true) : undefined}
      />


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

      {/* Workout Preview Modal (coach — edit instead of start) */}
      <WorkoutPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        workoutId={previewWorkoutId}
        workoutName={previewWorkoutName}
        actionLabel="Edit Workout"
        actionIcon={<Pencil className="h-4 w-4 mr-2" />}
        isCoach={role === "coach" || role === "admin"}
        onEdit={(wId) => {
          if (assignment?.is_linked_to_master) { setShowDetach(true); return; }
          if (isMobile) {
            setMobileEditorWorkoutId(wId);
            setMobileEditorWorkoutName(previewWorkoutName);
            setMobileEditorOpen(true);
          } else {
            setEditorWorkoutId(wId);
            setEditorWorkoutName(previewWorkoutName);
            setEditorOpen(true);
          }
        }}
        onDuplicate={(wId) => {
          const pw = allWorkouts.find(w => w.workout_id === wId);
          const phase = phases.find(p => p.directWorkouts.some(dw => dw.workout_id === wId));
          if (pw && phase) { setPreviewOpen(false); duplicateWorkout(pw, phase.id); }
        }}
        onDelete={(wId) => {
          const pw = allWorkouts.find(w => w.workout_id === wId);
          if (pw) { setPreviewOpen(false); setDeleteTarget({ ids: [pw.id], names: [pw.workout_name] }); }
        }}
        onRename={async (wId, newName) => {
          await supabase.from("workouts").update({ name: newName }).eq("id", wId);
          toast({ title: "Workout renamed" });
          setPreviewWorkoutName(newName);
          loadClientProgram();
        }}
        onStartWorkout={() => {
          if (previewWorkoutId) {
            setPreviewOpen(false);
            if (assignment?.is_linked_to_master) {
              setShowDetach(true);
            } else if (isMobile) {
              setMobileEditorWorkoutId(previewWorkoutId);
              setMobileEditorWorkoutName(previewWorkoutName);
              setMobileEditorOpen(true);
            } else {
              setEditorWorkoutId(previewWorkoutId);
              setEditorWorkoutName(previewWorkoutName);
              setEditorOpen(true);
            }
          }
        }}
      />

      {/* Full-screen Workout Editor Modal (desktop) */}
      <ClientWorkoutEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaved={() => loadClientProgram()}
        workoutId={editorWorkoutId}
        workoutName={editorWorkoutName}
        clientId={clientId}
      />

      {/* Mobile Workout Editor (mobile only) */}
      <MobileWorkoutEditor
        open={mobileEditorOpen}
        onClose={() => setMobileEditorOpen(false)}
        onSaved={() => loadClientProgram()}
        workoutId={mobileEditorWorkoutId}
        workoutName={mobileEditorWorkoutName}
        clientId={clientId}
      />

      {/* Workout Builder Modal (New workout) */}
      {user && (
        <WorkoutBuilderModal
          open={builderOpen}
          onClose={() => { setBuilderOpen(false); setBuilderPhaseId(null); }}
          onSave={handleNewWorkoutCreated}
          coachId={user.id}
        />
      )}

      {/* Import Workout Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import Workout</DialogTitle>
            <DialogDescription>Import a workout from your template library or another client's program.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Source toggle */}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => { setImportSource("master"); loadMasterWorkouts(); setImportSelectedWorkout(""); }}
                className={`p-3 rounded-lg border text-left transition-colors ${importSource === "master" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Dumbbell className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Master Library</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Your template workouts</p>
              </button>
              <button onClick={() => { setImportSource("client"); setImportSelectedWorkout(""); setImportWorkouts([]); }}
                className={`p-3 rounded-lg border text-left transition-colors ${importSource === "client" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Copy className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">From Client</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Copy from another client</p>
              </button>
            </div>

            {/* Client selector for client import */}
            {importSource === "client" && (
              <div className="space-y-2">
                <Label className="text-sm">Select Client</Label>
                <SearchableClientSelect
                  clients={importClients}
                  value={importSelectedClient}
                  onValueChange={(v) => {
                    setImportSelectedClient(v);
                    setImportSelectedWorkout("");
                    if (v) loadClientWorkouts(v);
                  }}
                  placeholder="Choose a client..."
                />
              </div>
            )}

            {/* Workout list */}
            <div className="space-y-2">
              <Label className="text-sm">Select Workout</Label>
              {importLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              ) : importWorkouts.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  {importSource === "client" && !importSelectedClient ? "Select a client first" : "No workouts found"}
                </p>
              ) : (
                <ScrollArea className="max-h-60">
                  <div className="space-y-1">
                    {importWorkouts.map(w => (
                      <button key={w.id} onClick={() => setImportSelectedWorkout(w.id)}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors ${
                          importSelectedWorkout === w.id ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50 border border-transparent"
                        }`}>
                        <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                          <Dumbbell className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{w.name}</p>
                          {w.workout_type && w.workout_type !== "regular" && (
                            <span className="text-[10px] text-muted-foreground">{w.workout_type}</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>

            <Button className="w-full" disabled={!importSelectedWorkout || importing} onClick={handleImportWorkout}>
              {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Import Workout
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Change phase duration */}
      {changeDurationPhase && (
        <ChangeDurationDialog
          open={!!changeDurationPhase}
          onOpenChange={(o) => { if (!o) setChangeDurationPhase(null); }}
          initialWeeks={changeDurationPhase.duration_weeks}
          phaseName={changeDurationPhase.name}
          onSave={async (weeks) => {
            await changePhaseDuration(changeDurationPhase.id, weeks);
            setChangeDurationPhase(null);
          }}
        />
      )}

      {/* Copy phase to master program */}
      {copyToMasterPhase && user && (
        <CopyPhaseToMasterDialog
          open={!!copyToMasterPhase}
          onOpenChange={(o) => { if (!o) setCopyToMasterPhase(null); }}
          coachId={user.id}
          phaseName={copyToMasterPhase.name}
          onConfirm={async (targetMasterProgramId) => {
            await handleCopyPhaseToMaster(copyToMasterPhase, targetMasterProgramId);
            setCopyToMasterPhase(null);
          }}
        />
      )}

      {/* Copy phase to another client */}
      {copyToClientPhase && user && (
        <CopyPhaseToClientDialog
          open={!!copyToClientPhase}
          onOpenChange={(o) => { if (!o) setCopyToClientPhase(null); }}
          coachId={user.id}
          excludeClientId={clientId}
          phaseName={copyToClientPhase.name}
          onConfirm={async (targetClientId) => {
            await handleCopyPhaseToClient(copyToClientPhase, targetClientId);
            setCopyToClientPhase(null);
          }}
        />
      )}

      {/* AI Create New Phase */}
      {aiCreateOpen && program && (
        <AICreateProgramModal
          open={aiCreateOpen}
          onOpenChange={setAiCreateOpen}
          clientId={clientId}
          clientName={clientDisplayName}
          programId={program.id}
          currentPhaseId={assignment?.current_phase_id || phases[0]?.id || ""}
          onSaved={() => loadClientProgram()}
        />
      )}
      <AlertDialog open={!!deletePhaseTarget} onOpenChange={(o) => { if (!o) setDeletePhaseTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete phase?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deletePhaseTarget?.name}" and all its workouts will be removed from this client's program. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deletePhaseTarget) {
                  await deletePhase(deletePhaseTarget.id);
                  setDeletePhaseTarget(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
              <Copy className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Import</span>
            </div>
            <p className="text-[11px] text-muted-foreground">Independent copy. Edit freely.</p>
          </button>
        </div>
        <div className="space-y-2">
          <Label className="text-sm">Master Program</Label>
          {programs.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3 text-center">No template programs found. Create one in Master Libraries first.</p>
          ) : (
            <Select value={selected} onValueChange={onSelect}>
              <SelectTrigger><SelectValue placeholder="Choose a program..." /></SelectTrigger>
              <SelectContent>
                {programs.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <Button className="w-full" disabled={!selected || loading} onClick={onAssign}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {mode === "subscribe" ? "Subscribe Client" : "Import Program"}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

export default ClientWorkspaceTraining;
