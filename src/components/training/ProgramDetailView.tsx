import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  ArrowLeft, Plus, Trash2, Copy, ChevronDown, ChevronRight, Dumbbell, Layers, ArrowUp, ArrowDown,
  MoreHorizontal, Pencil, Download, Upload, GripVertical, Save, Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import WorkoutBuilderModal from "./WorkoutBuilderModal";

const TRAINING_STYLES = [
  { label: "Hypertrophy", value: "hypertrophy" },
  { label: "Strength", value: "strength" },
  { label: "Deload", value: "deload" },
  { label: "Power", value: "power" },
  { label: "Endurance", value: "endurance" },
  { label: "Metabolite", value: "metabolite" },
];

const INTENSITY_SYSTEMS = [
  { label: "Straight Sets", value: "straight_sets" },
  { label: "Drop Sets", value: "drop_sets" },
  { label: "Rest Pause", value: "rest_pause" },
  { label: "Cluster Sets", value: "cluster_sets" },
  { label: "Myo-Reps", value: "myo_reps" },
  { label: "Giant Sets", value: "giant_sets" },
];

const PROGRESSION_RULES = [
  { label: "Add Weight", value: "add_weight" },
  { label: "Add Reps", value: "add_reps" },
  { label: "RPE-Based", value: "rpe_based" },
  { label: "Percentage-Based", value: "percentage" },
  { label: "AMRAP", value: "amrap" },
  { label: "Double Progression", value: "double" },
  { label: "Manual", value: "manual" },
];

const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface WorkoutExercise {
  id?: string;
  exerciseId: string;
  exerciseName: string;
  exerciseOrder: number;
  sets: number;
  reps: string;
  tempo: string;
  restSeconds: number;
  rir: number | null;
  rpe: number | null;
  notes: string;
  supersetGroup: string | null;
}

interface ProgramWorkout {
  id?: string;
  workoutId: string;
  workoutName: string;
  dayOfWeek: number;
  dayLabel: string;
  sortOrder: number;
  exercises: WorkoutExercise[];
}

interface ProgramWeek {
  id?: string;
  weekNumber: number;
  name: string;
  workouts: ProgramWorkout[];
  collapsed: boolean;
}

interface ProgramPhase {
  id?: string;
  name: string;
  description: string;
  phaseOrder: number;
  durationWeeks: number;
  trainingStyle: string;
  intensitySystem: string;
  progressionRule: string;
  weeks: ProgramWeek[];
  collapsed: boolean;
}

interface ProgramDetailViewProps {
  programId: string;
  programName: string;
  onBack: () => void;
}

const ProgramDetailView = ({ programId, programName, onBack }: ProgramDetailViewProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [phases, setPhases] = useState<ProgramPhase[]>([]);
  const [programDetails, setProgramDetails] = useState<any>(null);

  // Workout builder modal
  const [showWorkoutBuilder, setShowWorkoutBuilder] = useState(false);
  const [builderTargetPhase, setBuilderTargetPhase] = useState(0);
  const [builderTargetWeek, setBuilderTargetWeek] = useState(0);
  const [editingWorkout, setEditingWorkout] = useState<ProgramWorkout | null>(null);

  // Rename phase
  const [renamingPhase, setRenamingPhase] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Import dialog
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importTargetPhase, setImportTargetPhase] = useState(0);
  const [importTargetWeek, setImportTargetWeek] = useState(0);
  const [importSource, setImportSource] = useState<"master_workouts" | "this_program">("master_workouts");
  const [importableWorkouts, setImportableWorkouts] = useState<any[]>([]);
  const [importLoading, setImportLoading] = useState(false);

  // Copy To dialog
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [copyWorkout, setCopyWorkout] = useState<ProgramWorkout | null>(null);
  const [copyTargetPrograms, setCopyTargetPrograms] = useState<any[]>([]);
  const [copyTargetId, setCopyTargetId] = useState("");

  const loadProgram = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const { data: program } = await supabase
        .from("programs")
        .select("*")
        .eq("id", programId)
        .single();

      if (!program) { setLoading(false); return; }
      setProgramDetails(program);

      const { data: phaseRows } = await supabase
        .from("program_phases")
        .select("*")
        .eq("program_id", programId)
        .order("phase_order");

      const loadedPhases: ProgramPhase[] = [];

      for (const phase of (phaseRows || [])) {
        const { data: weekRows } = await supabase
          .from("program_weeks")
          .select("id, week_number, name")
          .eq("program_id", programId)
          .eq("phase_id", phase.id)
          .order("week_number");

        const weeks: ProgramWeek[] = [];
        if (weekRows && weekRows.length > 0) {
          const weekIds = weekRows.map(w => w.id);
          const { data: pwRows } = await supabase
            .from("program_workouts")
            .select("id, week_id, workout_id, day_of_week, day_label, sort_order, workouts(name)")
            .in("week_id", weekIds)
            .order("sort_order");

          for (const w of weekRows) {
            const weekWorkouts = (pwRows || [])
              .filter((pw: any) => pw.week_id === w.id)
              .map((pw: any) => ({
                id: pw.id,
                workoutId: pw.workout_id,
                workoutName: (pw.workouts as any)?.name || "Workout",
                dayOfWeek: pw.day_of_week ?? 0,
                dayLabel: pw.day_label || DAY_LABELS[pw.day_of_week ?? 0],
                sortOrder: pw.sort_order ?? 0,
                exercises: [],
              }));

            weeks.push({
              id: w.id,
              weekNumber: w.week_number,
              name: w.name || `Week ${w.week_number}`,
              workouts: weekWorkouts,
              collapsed: false,
            });
          }
        }

        loadedPhases.push({
          id: phase.id,
          name: phase.name,
          description: phase.description || "",
          phaseOrder: phase.phase_order,
          durationWeeks: phase.duration_weeks,
          trainingStyle: phase.training_style || "hypertrophy",
          intensitySystem: phase.intensity_system || "straight_sets",
          progressionRule: phase.progression_rule || "add_weight",
          weeks: weeks.length > 0 ? weeks : [{ weekNumber: 1, name: "Week 1", workouts: [], collapsed: false }],
          collapsed: false,
        });
      }

      if (loadedPhases.length === 0) {
        loadedPhases.push({
          name: "Phase 1",
          description: "",
          phaseOrder: 1,
          durationWeeks: 4,
          trainingStyle: "hypertrophy",
          intensitySystem: "straight_sets",
          progressionRule: "add_weight",
          weeks: [{ weekNumber: 1, name: "Week 1", workouts: [], collapsed: false }],
          collapsed: false,
        });
      }

      setPhases(loadedPhases);
    } catch (err: any) {
      if (err.name === "AbortError") {
        toast({ title: "Load timed out", description: "Please try again.", variant: "destructive" });
      }
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [programId, user]);

  useEffect(() => { loadProgram(); }, [loadProgram]);

  // ── Phase Operations ──
  const addPhase = () => {
    const order = phases.length + 1;
    setPhases([...phases, {
      name: `Phase ${order}`,
      description: "",
      phaseOrder: order,
      durationWeeks: 4,
      trainingStyle: "hypertrophy",
      intensitySystem: "straight_sets",
      progressionRule: "add_weight",
      weeks: [{ weekNumber: 1, name: "Week 1", workouts: [], collapsed: false }],
      collapsed: false,
    }]);
  };

  const removePhase = (idx: number) => {
    if (phases.length <= 1) return;
    setPhases(phases.filter((_, i) => i !== idx).map((p, i) => ({ ...p, phaseOrder: i + 1 })));
  };

  const duplicatePhase = (idx: number) => {
    const source = phases[idx];
    setPhases([...phases, {
      ...source,
      id: undefined,
      name: `${source.name} (Copy)`,
      phaseOrder: phases.length + 1,
      weeks: source.weeks.map(w => ({ ...w, id: undefined, workouts: w.workouts.map(wo => ({ ...wo, id: undefined })) })),
      collapsed: false,
    }]);
  };

  const movePhase = (idx: number, direction: "up" | "down") => {
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= phases.length) return;
    const newPhases = [...phases];
    [newPhases[idx], newPhases[newIdx]] = [newPhases[newIdx], newPhases[idx]];
    setPhases(newPhases.map((p, i) => ({ ...p, phaseOrder: i + 1 })));
  };

  const updatePhase = (idx: number, updates: Partial<ProgramPhase>) => {
    const newPhases = [...phases];
    newPhases[idx] = { ...newPhases[idx], ...updates };
    setPhases(newPhases);
  };

  const startRenamePhase = (idx: number) => {
    setRenamingPhase(idx);
    setRenameValue(phases[idx].name);
  };

  const confirmRenamePhase = () => {
    if (renamingPhase !== null && renameValue.trim()) {
      updatePhase(renamingPhase, { name: renameValue.trim() });
    }
    setRenamingPhase(null);
  };

  // ── Week Operations ──
  const addWeekToPhase = (phaseIdx: number) => {
    const newPhases = [...phases];
    const nextNum = newPhases[phaseIdx].weeks.length + 1;
    newPhases[phaseIdx].weeks.push({ weekNumber: nextNum, name: `Week ${nextNum}`, workouts: [], collapsed: false });
    newPhases[phaseIdx].durationWeeks = newPhases[phaseIdx].weeks.length;
    setPhases(newPhases);
  };

  const removeWeekFromPhase = (phaseIdx: number, weekIdx: number) => {
    const newPhases = [...phases];
    if (newPhases[phaseIdx].weeks.length <= 1) return;
    newPhases[phaseIdx].weeks = newPhases[phaseIdx].weeks
      .filter((_, i) => i !== weekIdx)
      .map((w, i) => ({ ...w, weekNumber: i + 1 }));
    newPhases[phaseIdx].durationWeeks = newPhases[phaseIdx].weeks.length;
    setPhases(newPhases);
  };

  const duplicateWeekInPhase = (phaseIdx: number, weekIdx: number) => {
    const newPhases = [...phases];
    const source = newPhases[phaseIdx].weeks[weekIdx];
    const nextNum = newPhases[phaseIdx].weeks.length + 1;
    newPhases[phaseIdx].weeks.push({
      weekNumber: nextNum,
      name: `Week ${nextNum}`,
      workouts: source.workouts.map(w => ({ ...w, id: undefined })),
      collapsed: false,
    });
    newPhases[phaseIdx].durationWeeks = newPhases[phaseIdx].weeks.length;
    setPhases(newPhases);
  };

  // ── Workout Operations ──
  const openWorkoutBuilder = (phaseIdx: number, weekIdx: number, workout?: ProgramWorkout) => {
    setBuilderTargetPhase(phaseIdx);
    setBuilderTargetWeek(weekIdx);
    setEditingWorkout(workout || null);
    setShowWorkoutBuilder(true);
  };

  const handleWorkoutSaved = (workoutId: string, workoutName: string) => {
    const newPhases = [...phases];
    const week = newPhases[builderTargetPhase].weeks[builderTargetWeek];

    if (editingWorkout) {
      const idx = week.workouts.findIndex(w => w.workoutId === editingWorkout.workoutId);
      if (idx >= 0) {
        week.workouts[idx] = { ...week.workouts[idx], workoutId, workoutName };
      }
    } else {
      const existingCount = week.workouts.length;
      week.workouts.push({
        workoutId,
        workoutName,
        dayOfWeek: Math.min(existingCount, 6),
        dayLabel: DAY_LABELS[Math.min(existingCount, 6)],
        sortOrder: existingCount,
        exercises: [],
      });
    }

    setPhases(newPhases);
    setShowWorkoutBuilder(false);
    setEditingWorkout(null);
  };

  const removeWorkoutFromWeek = (phaseIdx: number, weekIdx: number, workoutIdx: number) => {
    const newPhases = [...phases];
    newPhases[phaseIdx].weeks[weekIdx].workouts.splice(workoutIdx, 1);
    setPhases(newPhases);
  };

  const updateWorkoutDay = (phaseIdx: number, weekIdx: number, workoutIdx: number, dayOfWeek: number) => {
    const newPhases = [...phases];
    newPhases[phaseIdx].weeks[weekIdx].workouts[workoutIdx].dayOfWeek = dayOfWeek;
    newPhases[phaseIdx].weeks[weekIdx].workouts[workoutIdx].dayLabel = DAY_LABELS[dayOfWeek];
    setPhases(newPhases);
  };

  // ── Import ──
  const openImportDialog = async (phaseIdx: number, weekIdx: number) => {
    setImportTargetPhase(phaseIdx);
    setImportTargetWeek(weekIdx);
    setImportSource("master_workouts");
    setShowImportDialog(true);
    await loadImportWorkouts("master_workouts");
  };

  const loadImportWorkouts = async (source: "master_workouts" | "this_program") => {
    if (!user) return;
    setImportLoading(true);

    if (source === "master_workouts") {
      const { data } = await supabase
        .from("workouts")
        .select("id, name, description")
        .eq("coach_id", user.id)
        .eq("is_template", true)
        .order("name");
      setImportableWorkouts(data || []);
    } else {
      // All workouts in this program
      const allWorkouts: any[] = [];
      for (const phase of phases) {
        for (const week of phase.weeks) {
          for (const w of week.workouts) {
            if (!allWorkouts.find(aw => aw.id === w.workoutId)) {
              allWorkouts.push({ id: w.workoutId, name: w.workoutName, description: `${phase.name} / ${week.name}` });
            }
          }
        }
      }
      setImportableWorkouts(allWorkouts);
    }
    setImportLoading(false);
  };

  const importWorkout = async (sourceWorkout: any) => {
    if (!user) return;

    // Clone the workout
    const { data: origW } = await supabase
      .from("workouts")
      .select("name, description, instructions, phase, workout_type")
      .eq("id", sourceWorkout.id)
      .single();
    if (!origW) return;

    const { data: newW } = await supabase.from("workouts").insert({
      coach_id: user.id,
      name: origW.name,
      description: origW.description,
      instructions: origW.instructions,
      phase: origW.phase,
      is_template: true,
      workout_type: (origW as any).workout_type || "regular",
      source_workout_id: sourceWorkout.id,
    } as any).select().single();
    if (!newW) return;

    // Clone exercises and their individual workout_sets
    const { data: exes } = await supabase.from("workout_exercises")
      .select("exercise_id, exercise_order, sets, reps, tempo, rest_seconds, rir, notes, superset_group, rpe_target")
      .eq("workout_id", sourceWorkout.id);
    if (exes && exes.length > 0) {
      const { data: insertedExes } = await supabase.from("workout_exercises")
        .insert(exes.map((ex: any) => ({ ...ex, workout_id: newW.id })))
        .select("id");

      if (insertedExes) {
        const { data: origExIds } = await supabase.from("workout_exercises")
          .select("id").eq("workout_id", sourceWorkout.id).order("exercise_order");
        if (origExIds) {
          const allSets: any[] = [];
          for (let i = 0; i < origExIds.length; i++) {
            const { data: sets } = await supabase.from("workout_sets")
              .select("set_number, rep_target, weight_target, rpe_target, set_type")
              .eq("workout_exercise_id", origExIds[i].id);
            if (sets) allSets.push(...sets.map((s: any) => ({ ...s, workout_exercise_id: insertedExes[i].id })));
          }
          if (allSets.length > 0) await supabase.from("workout_sets").insert(allSets);
        }
      }
    }

    // Add to week
    const newPhases = [...phases];
    const week = newPhases[importTargetPhase].weeks[importTargetWeek];
    const existingCount = week.workouts.length;
    week.workouts.push({
      workoutId: newW.id,
      workoutName: origW.name,
      dayOfWeek: Math.min(existingCount, 6),
      dayLabel: DAY_LABELS[Math.min(existingCount, 6)],
      sortOrder: existingCount,
      exercises: [],
    });
    setPhases(newPhases);
    toast({ title: "Workout imported" });
    setShowImportDialog(false);
  };

  // ── Copy To ──
  const openCopyDialog = async (workout: ProgramWorkout) => {
    if (!user) return;
    setCopyWorkout(workout);
    const { data } = await supabase
      .from("programs")
      .select("id, name")
      .eq("coach_id", user.id)
      .eq("is_template", true)
      .order("name");
    setCopyTargetPrograms(data || []);
    setCopyTargetId("");
    setShowCopyDialog(true);
  };

  const executeCopy = async () => {
    if (!copyWorkout || !copyTargetId || !user) return;
    // Clone workout to target program (create as template workout)
    const { data: origW } = await supabase
      .from("workouts")
      .select("name, description, instructions, phase, workout_type")
      .eq("id", copyWorkout.workoutId)
      .single();
    if (!origW) return;

    const { data: newW } = await supabase.from("workouts").insert({
      coach_id: user.id,
      name: origW.name,
      description: origW.description,
      instructions: origW.instructions,
      phase: origW.phase,
      is_template: true,
      workout_type: (origW as any).workout_type || "regular",
      source_workout_id: copyWorkout.workoutId,
    } as any).select().single();
    if (!newW) return;

    const { data: exes } = await supabase.from("workout_exercises")
      .select("exercise_id, exercise_order, sets, reps, tempo, rest_seconds, rir, notes, superset_group, rpe_target")
      .eq("workout_id", copyWorkout.workoutId);
    if (exes && exes.length > 0) {
      await supabase.from("workout_exercises").insert(exes.map((ex: any) => ({ ...ex, workout_id: newW.id })));
    }

    toast({ title: "Workout copied", description: `"${origW.name}" copied to target program.` });
    setShowCopyDialog(false);
  };

  // ── Save All ──
  const saveProgram = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const totalWeeks = phases.reduce((s, p) => s + p.weeks.length, 0);

      await supabase.from("programs").update({
        duration_weeks: totalWeeks,
      } as any).eq("id", programId);

      // Delete existing structure
      await supabase.from("program_phases").delete().eq("program_id", programId);
      await supabase.from("program_weeks").delete().eq("program_id", programId);

      // Re-insert phases → weeks → workouts
      let globalWeekNumber = 0;
      for (const phase of phases) {
        const { data: phaseRow, error: phaseErr } = await supabase
          .from("program_phases")
          .insert({
            program_id: programId,
            name: phase.name,
            description: phase.description || null,
            phase_order: phase.phaseOrder,
            duration_weeks: phase.weeks.length,
            training_style: phase.trainingStyle,
            intensity_system: phase.intensitySystem,
            progression_rule: phase.progressionRule,
          })
          .select().single();
        if (phaseErr) throw phaseErr;

        for (const week of phase.weeks) {
          globalWeekNumber++;
          const { data: weekRow, error: wErr } = await supabase
            .from("program_weeks")
            .insert({
              program_id: programId,
              phase_id: phaseRow.id,
              week_number: globalWeekNumber,
              name: week.name,
            })
            .select().single();
          if (wErr) throw wErr;

          if (week.workouts.length > 0) {
            await supabase.from("program_workouts").insert(
              week.workouts.map((w, i) => ({
                week_id: weekRow.id,
                workout_id: w.workoutId,
                day_of_week: w.dayOfWeek,
                day_label: w.dayLabel,
                sort_order: i,
              }))
            );
          }
        }
      }

      toast({ title: "Program saved" });
    } catch (err: any) {
      toast({ title: "Error saving", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
          <Skeleton className="h-7 w-48" />
        </div>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h2 className="text-xl font-bold text-foreground">{programDetails?.name || programName}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              {programDetails?.is_master && <Badge className="text-[10px] bg-primary/20 text-primary">Master</Badge>}
              <Badge variant="outline" className="text-[10px]">v{programDetails?.version_number || 1}</Badge>
              <span className="text-xs text-muted-foreground">
                {phases.length} phase{phases.length !== 1 ? "s" : ""} · {phases.reduce((s, p) => s + p.weeks.length, 0)} weeks · {phases.reduce((s, p) => s + p.weeks.reduce((ws, w) => ws + w.workouts.length, 0), 0)} workouts
              </span>
            </div>
          </div>
        </div>
        <Button onClick={saveProgram} disabled={saving} size="sm">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
          Save
        </Button>
      </div>

      {/* Phases */}
      <div className="space-y-3">
        {phases.map((phase, phaseIdx) => (
          <Card key={phaseIdx} className="border-l-4 border-l-primary/40">
            <Collapsible open={!phase.collapsed} onOpenChange={(open) => updatePhase(phaseIdx, { collapsed: !open })}>
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2">
                    {phase.collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    <Layers className="h-4 w-4 text-primary" />
                    <h4 className="font-semibold text-sm">{phase.name}</h4>
                    <Badge variant="secondary" className="text-[10px]">{phase.trainingStyle}</Badge>
                    <span className="text-xs text-muted-foreground">{phase.weeks.length}w</span>
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {phaseIdx > 0 && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => movePhase(phaseIdx, "up")}><ArrowUp className="h-3.5 w-3.5" /></Button>}
                    {phaseIdx < phases.length - 1 && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => movePhase(phaseIdx, "down")}><ArrowDown className="h-3.5 w-3.5" /></Button>}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => startRenamePhase(phaseIdx)}><Pencil className="h-3.5 w-3.5 mr-2" /> Rename</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => duplicatePhase(phaseIdx)}><Copy className="h-3.5 w-3.5 mr-2" /> Duplicate</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {phases.length > 1 && <DropdownMenuItem className="text-destructive" onClick={() => removePhase(phaseIdx)}><Trash2 className="h-3.5 w-3.5 mr-2" /> Delete</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <CardContent className="pt-0 space-y-3">
                  {/* Phase settings row */}
                  <div className="grid grid-cols-3 gap-2 p-2 border rounded-lg bg-muted/20">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Style</Label>
                      <Select value={phase.trainingStyle} onValueChange={(v) => updatePhase(phaseIdx, { trainingStyle: v })}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{TRAINING_STYLES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Intensity</Label>
                      <Select value={phase.intensitySystem} onValueChange={(v) => updatePhase(phaseIdx, { intensitySystem: v })}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{INTENSITY_SYSTEMS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Progression</Label>
                      <Select value={phase.progressionRule} onValueChange={(v) => updatePhase(phaseIdx, { progressionRule: v })}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{PROGRESSION_RULES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Weeks */}
                  {phase.weeks.map((week, weekIdx) => (
                    <Card key={weekIdx} className="bg-card/50 overflow-hidden">
                      <Collapsible open={!week.collapsed} onOpenChange={(open) => {
                        const newPhases = [...phases];
                        newPhases[phaseIdx].weeks[weekIdx].collapsed = !open;
                        setPhases(newPhases);
                      }}>
                        <CollapsibleTrigger asChild>
                          <div className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/20 transition-colors">
                            <div className="flex items-center gap-2">
                              {week.collapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                              <span className="text-sm font-medium">{week.name}</span>
                              <span className="text-[11px] text-muted-foreground">{week.workouts.length} workout{week.workouts.length !== 1 ? "s" : ""}</span>
                            </div>
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => duplicateWeekInPhase(phaseIdx, weekIdx)}><Copy className="h-3 w-3" /></Button>
                              {phase.weeks.length > 1 && <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeWeekFromPhase(phaseIdx, weekIdx)}><Trash2 className="h-3 w-3" /></Button>}
                            </div>
                          </div>
                        </CollapsibleTrigger>

                        <CollapsibleContent>
                          <div className="px-3 pb-3 space-y-2">
                            {week.workouts.length === 0 ? (
                              <p className="text-[11px] text-muted-foreground text-center py-2">No workouts yet.</p>
                            ) : (
                              week.workouts.map((pw, pwIdx) => (
                                <div key={pwIdx} className="flex items-center gap-2 p-2 border rounded-md bg-background group">
                                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0 cursor-grab" />
                                  <Dumbbell className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                                  <button
                                    className="text-xs font-medium flex-1 truncate text-left hover:text-primary transition-colors"
                                    onClick={() => openWorkoutBuilder(phaseIdx, weekIdx, pw)}
                                  >
                                    {pw.workoutName}
                                  </button>
                                  <Select value={String(pw.dayOfWeek)} onValueChange={(v) => updateWorkoutDay(phaseIdx, weekIdx, pwIdx, parseInt(v))}>
                                    <SelectTrigger className="w-24 h-7 text-[11px]"><SelectValue /></SelectTrigger>
                                    <SelectContent>{DAY_LABELS.map((day, i) => <SelectItem key={i} value={String(i)}>{day}</SelectItem>)}</SelectContent>
                                  </Select>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <MoreHorizontal className="h-3 w-3" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => openWorkoutBuilder(phaseIdx, weekIdx, pw)}><Pencil className="h-3 w-3 mr-2" /> Edit</DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => openCopyDialog(pw)}><Copy className="h-3 w-3 mr-2" /> Copy To</DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem className="text-destructive" onClick={() => removeWorkoutFromWeek(phaseIdx, weekIdx, pwIdx)}><Trash2 className="h-3 w-3 mr-2" /> Remove</DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              ))
                            )}

                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => openWorkoutBuilder(phaseIdx, weekIdx)}>
                                <Plus className="h-3 w-3 mr-1" /> Build Workout
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="sm" variant="outline" className="h-8 text-xs">
                                    <Download className="h-3 w-3 mr-1" /> Import
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openImportDialog(phaseIdx, weekIdx)}>
                                    <Dumbbell className="h-3 w-3 mr-2" /> Master Workouts
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => { setImportSource("this_program"); openImportDialog(phaseIdx, weekIdx); }}>
                                    <Layers className="h-3 w-3 mr-2" /> Within This Program
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </Card>
                  ))}

                  <Button size="sm" variant="ghost" className="w-full text-xs" onClick={() => addWeekToPhase(phaseIdx)}>
                    <Plus className="h-3 w-3 mr-1" /> Add Week
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        ))}

        <Button size="sm" variant="outline" onClick={addPhase} className="w-full">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Phase
        </Button>
      </div>

      {/* Rename Phase Dialog */}
      <Dialog open={renamingPhase !== null} onOpenChange={(open) => !open && setRenamingPhase(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Rename Phase</DialogTitle></DialogHeader>
          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && confirmRenamePhase()} />
          <DialogFooter><Button onClick={confirmRenamePhase}>Rename</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Import Workout</DialogTitle></DialogHeader>
          <div className="flex gap-2 mb-3">
            <Button size="sm" variant={importSource === "master_workouts" ? "default" : "outline"} onClick={() => { setImportSource("master_workouts"); loadImportWorkouts("master_workouts"); }}>
              Master Workouts
            </Button>
            <Button size="sm" variant={importSource === "this_program" ? "default" : "outline"} onClick={() => { setImportSource("this_program"); loadImportWorkouts("this_program"); }}>
              This Program
            </Button>
          </div>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {importLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : importableWorkouts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No workouts available.</p>
            ) : (
              importableWorkouts.map((w) => (
                <button key={w.id} onClick={() => importWorkout(w)} className="w-full text-left p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                  <p className="font-medium text-sm">{w.name}</p>
                  {w.description && <p className="text-xs text-muted-foreground truncate">{w.description}</p>}
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Copy To Dialog */}
      <Dialog open={showCopyDialog} onOpenChange={setShowCopyDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Copy Workout To</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Copy "{copyWorkout?.workoutName}" to another program as an independent template.</p>
            <Select value={copyTargetId} onValueChange={setCopyTargetId}>
              <SelectTrigger><SelectValue placeholder="Select program..." /></SelectTrigger>
              <SelectContent>
                {copyTargetPrograms.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={executeCopy} disabled={!copyTargetId} className="w-full">Copy</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Workout Builder Modal */}
      {showWorkoutBuilder && (
        <WorkoutBuilderModal
          open={showWorkoutBuilder}
          onClose={() => { setShowWorkoutBuilder(false); setEditingWorkout(null); }}
          onSave={handleWorkoutSaved}
          editWorkoutId={editingWorkout?.workoutId}
          coachId={user?.id || ""}
        />
      )}
    </div>
  );
};

export default ProgramDetailView;
