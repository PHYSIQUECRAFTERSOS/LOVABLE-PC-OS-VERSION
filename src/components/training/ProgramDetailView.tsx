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
  MoreHorizontal, Pencil, Download, Save, Loader2, GripVertical, Clock, Play,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import WorkoutBuilderModal from "./WorkoutBuilderModal";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  { label: "Other", value: "other" },
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

const DAY_LABELS = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"];

interface WorkoutMeta {
  exerciseCount: number;
  estimatedMinutes: number;
  thumbnailUrl: string | null;
}

interface ProgramWorkout {
  id?: string;
  workoutId: string;
  workoutName: string;
  dayOfWeek: number;
  dayLabel: string;
  sortOrder: number;
  excludeFromNumbering?: boolean;
  customTag?: string | null;
}

interface ProgramPhase {
  id?: string;
  name: string;
  description: string;
  phaseOrder: number;
  durationWeeks: number;
  trainingStyle: string;
  intensitySystem: string;
  customIntensity: string;
  progressionRule: string;
  workouts: ProgramWorkout[];
  collapsed: boolean;
}

// ── Duration Estimator ──
function getYouTubeThumbnail(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^?&/]+)/);
  return match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : null;
}

function estimateWorkoutMinutes(exercises: { sets: number; rest_seconds: number }[]): number {
  if (exercises.length === 0) return 0;
  const AVG_SET_DURATION = 35; // seconds (hypertrophy default)
  let totalSeconds = 0;
  for (const ex of exercises) {
    const sets = ex.sets || 3;
    const rest = ex.rest_seconds || 60;
    totalSeconds += sets * AVG_SET_DURATION + Math.max(0, sets - 1) * rest;
  }
  // Transition + setup buffer: 50s per exercise transition
  totalSeconds += Math.max(0, exercises.length - 1) * 50;
  return Math.round(totalSeconds / 60);
}

// ── Sortable Workout Card ──
interface SortableWorkoutCardProps {
  pw: ProgramWorkout;
  pwIdx: number;
  phaseIdx: number;
  displayPosition: number | null;
  meta: WorkoutMeta | undefined;
  openWorkoutBuilder: (phaseIdx: number, workout?: ProgramWorkout) => void;
  removeWorkoutFromPhase: (phaseIdx: number, workoutIdx: number) => void;
  onToggleCustomTag: (phaseIdx: number, pwIdx: number, exclude: boolean, tag: string | null) => void;
}

const SortableWorkoutCard = ({ pw, pwIdx, phaseIdx, meta, openWorkoutBuilder, removeWorkoutFromPhase }: SortableWorkoutCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: pw.id || pw.workoutId + pwIdx });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-3 p-3 border rounded-lg bg-background group hover:ring-1 hover:ring-primary/20 transition-all">
      <div {...attributes} {...listeners} className="touch-none">
        <GripVertical className="h-4 w-4 text-muted-foreground/40 flex-shrink-0 cursor-grab active:cursor-grabbing mt-1" />
      </div>

      {/* Thumbnail */}
      <div className="w-20 h-14 rounded-md overflow-hidden bg-muted flex-shrink-0">
        {meta?.thumbnailUrl ? (
          <div className="relative w-full h-full group/thumb">
            <img src={meta.thumbnailUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover/thumb:opacity-100 transition-opacity">
              <Play className="h-5 w-5 text-white" />
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Dumbbell className="h-5 w-5 text-muted-foreground/30" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <Badge variant="secondary" className="text-[10px] px-1.5">
            {DAY_LABELS[Math.min(pwIdx, 6)]}
          </Badge>
        </div>
        <button
          className="text-sm font-semibold truncate text-left hover:text-primary transition-colors block w-full"
          onClick={() => openWorkoutBuilder(phaseIdx, pw)}
        >
          {pw.workoutName}
        </button>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
          {meta && meta.exerciseCount > 0 && (
            <>
              <span className="flex items-center gap-1">
                <Dumbbell className="h-3 w-3" />
                {meta.exerciseCount} exercise{meta.exerciseCount !== 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Est. {meta.estimatedMinutes} min
              </span>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => openWorkoutBuilder(phaseIdx, pw)}><Pencil className="h-3 w-3 mr-2" /> Edit</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={() => removeWorkoutFromPhase(phaseIdx, pwIdx)}><Trash2 className="h-3 w-3 mr-2" /> Remove</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

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
  const [editingWorkout, setEditingWorkout] = useState<ProgramWorkout | null>(null);

  // Workout metadata (exercise counts, durations, thumbnails)
  const [workoutMeta, setWorkoutMeta] = useState<Record<string, WorkoutMeta>>({});

  // Rename phase
  const [renamingPhase, setRenamingPhase] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Import dialog
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importTargetPhase, setImportTargetPhase] = useState(0);
  const [importableWorkouts, setImportableWorkouts] = useState<any[]>([]);
  const [importLoading, setImportLoading] = useState(false);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback((phaseIdx: number) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setPhases(prev => {
      const newPhases = [...prev];
      const phase = { ...newPhases[phaseIdx] };
      const workouts = [...phase.workouts];
      const oldIndex = workouts.findIndex(w => (w.id || w.workoutId + workouts.indexOf(w)) === active.id);
      const newIndex = workouts.findIndex(w => (w.id || w.workoutId + workouts.indexOf(w)) === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;

      const reordered = arrayMove(workouts, oldIndex, newIndex).map((w, i) => ({ ...w, sortOrder: i }));
      phase.workouts = reordered;
      newPhases[phaseIdx] = phase;

      // Persist to DB if phase has an ID
      if (phase.id) {
        const updates = reordered.filter(w => w.id).map(w => 
          supabase.from("program_workouts").update({ sort_order: w.sortOrder }).eq("id", w.id!)
        );
        Promise.all(updates).catch(() => {
          toast({ title: "Failed to save new order", description: "Please try again.", variant: "destructive" });
          // Revert
          setPhases(p => {
            const reverted = [...p];
            reverted[phaseIdx] = { ...reverted[phaseIdx], workouts: arrayMove(reordered, newIndex, oldIndex) };
            return reverted;
          });
        });
      }

      return newPhases;
    });
  }, [toast]);

  const loadProgram = useCallback(async () => {
    if (!user) return;
    setLoading(true);

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
        // Load workouts directly linked to phase (new structure)
        const { data: pwRows } = await supabase
          .from("program_workouts")
          .select("id, workout_id, day_of_week, day_label, sort_order, exclude_from_numbering, custom_tag, workouts(name)")
          .eq("phase_id", phase.id)
          .order("sort_order");

        let workouts: ProgramWorkout[] = (pwRows || []).map((pw: any) => ({
          id: pw.id,
          workoutId: pw.workout_id,
          workoutName: (pw.workouts as any)?.name || "Workout",
          dayOfWeek: pw.day_of_week ?? 0,
          dayLabel: pw.day_label || DAY_LABELS[pw.day_of_week ?? 0],
          sortOrder: pw.sort_order ?? 0,
          excludeFromNumbering: pw.exclude_from_numbering || false,
          customTag: pw.custom_tag || null,
        }));

        // Fallback: load from weeks if no direct phase workouts found (legacy data)
        if (workouts.length === 0) {
          const { data: weekRows } = await supabase
            .from("program_weeks")
            .select("id")
            .eq("program_id", programId)
            .eq("phase_id", phase.id);

          if (weekRows && weekRows.length > 0) {
            const { data: legacyPws } = await supabase
              .from("program_workouts")
              .select("id, workout_id, day_of_week, day_label, sort_order, exclude_from_numbering, custom_tag, workouts(name)")
              .in("week_id", weekRows.map(w => w.id))
              .order("sort_order");

            const seen = new Set<string>();
            workouts = (legacyPws || [])
              .filter((pw: any) => { if (seen.has(pw.workout_id)) return false; seen.add(pw.workout_id); return true; })
              .map((pw: any) => ({
                id: pw.id,
                workoutId: pw.workout_id,
                workoutName: (pw.workouts as any)?.name || "Workout",
                dayOfWeek: pw.day_of_week ?? 0,
                dayLabel: pw.day_label || DAY_LABELS[pw.day_of_week ?? 0],
                sortOrder: pw.sort_order ?? 0,
                excludeFromNumbering: pw.exclude_from_numbering || false,
                customTag: pw.custom_tag || null,
              }));
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
          customIntensity: (phase as any).custom_intensity || "",
          progressionRule: phase.progression_rule || "add_weight",
          workouts,
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
          customIntensity: "",
          progressionRule: "add_weight",
          workouts: [],
          collapsed: false,
        });
      }

      setPhases(loadedPhases);
    } catch (err: any) {
      toast({ title: "Load failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [programId, user]);

  useEffect(() => { loadProgram(); }, [loadProgram]);

  // Load workout metadata (exercise counts, durations, thumbnails)
  const loadWorkoutMeta = useCallback(async (allPhases: ProgramPhase[]) => {
    const workoutIds = allPhases.flatMap(p => p.workouts.map(w => w.workoutId));
    if (workoutIds.length === 0) return;

    const { data: exerciseRows } = await supabase
      .from("workout_exercises")
      .select("workout_id, sets, rest_seconds, exercise_id, exercises(youtube_url, youtube_thumbnail)")
      .in("workout_id", workoutIds)
      .order("exercise_order");

    const meta: Record<string, WorkoutMeta> = {};
    for (const wId of workoutIds) {
      const exes = (exerciseRows || []).filter((r: any) => r.workout_id === wId);
      const firstEx = exes[0];
      const thumb = firstEx
        ? ((firstEx as any).exercises?.youtube_thumbnail || getYouTubeThumbnail((firstEx as any).exercises?.youtube_url))
        : null;
      meta[wId] = {
        exerciseCount: exes.length,
        estimatedMinutes: estimateWorkoutMinutes(exes.map((e: any) => ({ sets: e.sets || 3, rest_seconds: e.rest_seconds || 60 }))),
        thumbnailUrl: thumb,
      };
    }
    setWorkoutMeta(meta);
  }, []);

  useEffect(() => {
    if (phases.length > 0 && phases.some(p => p.workouts.length > 0)) {
      loadWorkoutMeta(phases);
    }
  }, [phases, loadWorkoutMeta]);

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
      customIntensity: "",
      progressionRule: "add_weight",
      workouts: [],
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
      ...source, id: undefined, name: `${source.name} (Copy)`, phaseOrder: phases.length + 1,
      workouts: source.workouts.map(w => ({ ...w, id: undefined })), collapsed: false,
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

  const startRenamePhase = (idx: number) => { setRenamingPhase(idx); setRenameValue(phases[idx].name); };
  const confirmRenamePhase = () => {
    if (renamingPhase !== null && renameValue.trim()) updatePhase(renamingPhase, { name: renameValue.trim() });
    setRenamingPhase(null);
  };

  // ── Workout Operations ──
  const openWorkoutBuilder = (phaseIdx: number, workout?: ProgramWorkout) => {
    setBuilderTargetPhase(phaseIdx);
    setEditingWorkout(workout || null);
    setShowWorkoutBuilder(true);
  };

  const handleWorkoutSaved = async (workoutId: string, workoutName: string) => {
    const newPhases = [...phases];
    const phase = newPhases[builderTargetPhase];

    if (editingWorkout) {
      const idx = phase.workouts.findIndex(w => w.workoutId === editingWorkout.workoutId);
      if (idx >= 0) phase.workouts[idx] = { ...phase.workouts[idx], workoutId, workoutName };
    } else {
      const existingCount = phase.workouts.length;
      phase.workouts.push({
        workoutId, workoutName,
        dayOfWeek: existingCount,
        dayLabel: DAY_LABELS[Math.min(existingCount, 6)],
        sortOrder: existingCount,
      });
    }

    setPhases(newPhases);
    setShowWorkoutBuilder(false);
    setEditingWorkout(null);
    // Refresh metadata for updated workout
    loadWorkoutMeta(newPhases);

    // Auto-save the phase-workout link to database immediately
    if (phase.id) {
      // Phase already exists in DB - insert the link directly
      await supabase.from("program_workouts").insert({
        phase_id: phase.id,
        workout_id: workoutId,
        day_of_week: phase.workouts.length - 1,
        day_label: DAY_LABELS[Math.min(phase.workouts.length - 1, 6)],
        sort_order: phase.workouts.length - 1,
      });
    }
  };

  const removeWorkoutFromPhase = (phaseIdx: number, workoutIdx: number) => {
    const newPhases = [...phases];
    newPhases[phaseIdx].workouts.splice(workoutIdx, 1);
    setPhases(newPhases);
  };

  // ── Import ──
  const openImportDialog = async (phaseIdx: number) => {
    setImportTargetPhase(phaseIdx);
    setShowImportDialog(true);
    setImportLoading(true);
    if (!user) return;
    const { data } = await supabase
      .from("workouts")
      .select("id, name, description")
      .eq("coach_id", user.id)
      .eq("is_template", true)
      .order("name");
    setImportableWorkouts(data || []);
    setImportLoading(false);
  };

  const importWorkout = async (sourceWorkout: any) => {
    if (!user) return;
    const { data: origW } = await supabase.from("workouts")
      .select("name, description, instructions, phase, workout_type").eq("id", sourceWorkout.id).single();
    if (!origW) return;

    const { data: newW } = await supabase.from("workouts").insert({
      coach_id: user.id, name: origW.name, description: origW.description, instructions: origW.instructions,
      phase: origW.phase, is_template: true, workout_type: (origW as any).workout_type || "regular",
      source_workout_id: sourceWorkout.id,
    } as any).select().single();
    if (!newW) return;

    // Clone exercises
    const { data: exes } = await supabase.from("workout_exercises")
      .select("exercise_id, exercise_order, sets, reps, tempo, rest_seconds, rir, notes, rpe_target, grouping_type, grouping_id")
      .eq("workout_id", sourceWorkout.id);
    if (exes && exes.length > 0) {
      await supabase.from("workout_exercises").insert(exes.map((ex: any) => ({ ...ex, workout_id: newW.id })));
    }

    const newPhases = [...phases];
    const phase = newPhases[importTargetPhase];
    const count = phase.workouts.length;
    phase.workouts.push({
      workoutId: newW.id, workoutName: origW.name,
      dayOfWeek: count, dayLabel: DAY_LABELS[Math.min(count, 6)], sortOrder: count,
    });
    setPhases(newPhases);
    toast({ title: "Workout imported" });
    setShowImportDialog(false);
  };

  // ── Save ──
  const saveProgram = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const totalDuration = phases.reduce((s, p) => s + p.durationWeeks, 0);

      await supabase.from("programs").update({ duration_weeks: totalDuration } as any).eq("id", programId);

      // Delete existing program_workouts linked to this program's phases
      const { data: existingPhases } = await supabase.from("program_phases").select("id").eq("program_id", programId);
      if (existingPhases && existingPhases.length > 0) {
        await supabase.from("program_workouts").delete().in("phase_id", existingPhases.map(p => p.id));
      }
      // Delete existing phases and orphan weeks
      await supabase.from("program_phases").delete().eq("program_id", programId);
      await supabase.from("program_weeks").delete().eq("program_id", programId);

      // Insert phases with direct workout links (week_id is now nullable)
      for (const phase of phases) {
        const { data: phaseRow, error: phaseErr } = await supabase
          .from("program_phases")
          .insert({
            program_id: programId,
            name: phase.name,
            description: phase.description || null,
            phase_order: phase.phaseOrder,
            duration_weeks: phase.durationWeeks,
            training_style: phase.trainingStyle,
            intensity_system: phase.intensitySystem,
            custom_intensity: phase.customIntensity || null,
            progression_rule: phase.progressionRule,
          })
          .select().single();
        if (phaseErr) throw phaseErr;

        if (phase.workouts.length > 0) {
          const { error: pwErr } = await supabase.from("program_workouts").insert(
            phase.workouts.map((w, i) => ({
              phase_id: phaseRow.id,
              workout_id: w.workoutId,
              day_of_week: w.dayOfWeek,
              day_label: w.dayLabel,
              sort_order: i,
            }))
          );
          if (pwErr) throw pwErr;
        }
      }

      toast({ title: "Program saved" });
      // Re-fetch from database to ensure UI matches persisted state
      await loadProgram();
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
                {phases.length} phase{phases.length !== 1 ? "s" : ""} ·{" "}
                {phases.reduce((s, p) => s + p.durationWeeks, 0)} weeks ·{" "}
                {phases.reduce((s, p) => s + p.workouts.length, 0)} workouts
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
                    <span className="text-xs text-muted-foreground">{phase.durationWeeks}w</span>
                    {phase.intensitySystem === "other" && phase.customIntensity && (
                      <Badge variant="outline" className="text-[10px]">{phase.customIntensity}</Badge>
                    )}
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
                  {/* Phase settings */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3 border rounded-lg bg-muted/20">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Duration (weeks)</Label>
                      <Input
                        type="number"
                        value={phase.durationWeeks}
                        onChange={(e) => updatePhase(phaseIdx, { durationWeeks: parseInt(e.target.value) || 1 })}
                        className="h-7 text-xs"
                        min={1}
                      />
                    </div>
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
                    {phase.intensitySystem === "other" && (
                      <div className="col-span-2 md:col-span-4 space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Custom Intensity</Label>
                        <Input
                          value={phase.customIntensity}
                          onChange={(e) => updatePhase(phaseIdx, { customIntensity: e.target.value })}
                          className="h-7 text-xs"
                          placeholder="e.g. Mechanical Drop Set, 1.5 Reps, Wave Loading..."
                        />
                      </div>
                    )}
                  </div>

                  {/* Workouts (flat list, no weeks) */}
                  <div className="space-y-2">
                    {phase.workouts.length === 0 ? (
                      <div className="text-center py-6 border rounded-lg border-dashed">
                        <Dumbbell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">No workouts added yet.</p>
                        <p className="text-[10px] text-muted-foreground/70 mt-0.5">Click "Build Workout" to create one.</p>
                      </div>
                    ) : (
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd(phaseIdx)}>
                        <SortableContext
                          items={phase.workouts.map((w, i) => w.id || w.workoutId + i)}
                          strategy={verticalListSortingStrategy}
                        >
                          {phase.workouts.map((pw, pwIdx) => (
                            <SortableWorkoutCard
                              key={pw.id || pw.workoutId + pwIdx}
                              pw={pw}
                              pwIdx={pwIdx}
                              phaseIdx={phaseIdx}
                              meta={workoutMeta[pw.workoutId]}
                              openWorkoutBuilder={openWorkoutBuilder}
                              removeWorkoutFromPhase={removeWorkoutFromPhase}
                            />
                          ))}
                        </SortableContext>
                      </DndContext>
                    )}

                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => openWorkoutBuilder(phaseIdx)}>
                        <Plus className="h-3 w-3 mr-1" /> Build Workout
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openImportDialog(phaseIdx)}>
                        <Download className="h-3 w-3 mr-1" /> Import
                      </Button>
                    </div>
                  </div>
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
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {importLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : importableWorkouts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No workouts available.</p>
            ) : (
              importableWorkouts.map(w => (
                <button key={w.id} onClick={() => importWorkout(w)} className="w-full text-left p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                  <p className="font-medium text-sm">{w.name}</p>
                  {w.description && <p className="text-xs text-muted-foreground truncate">{w.description}</p>}
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Workout Builder Modal */}
      {user && (
        <WorkoutBuilderModal
          open={showWorkoutBuilder}
          onClose={() => { setShowWorkoutBuilder(false); setEditingWorkout(null); }}
          onSave={handleWorkoutSaved}
          editWorkoutId={editingWorkout?.workoutId}
          coachId={user.id}
        />
      )}
    </div>
  );
};

export default ProgramDetailView;
