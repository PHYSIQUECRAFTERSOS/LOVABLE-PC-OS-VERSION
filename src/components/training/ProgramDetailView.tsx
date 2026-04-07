import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import SearchableClientSelect from "@/components/ui/searchable-client-select";
import {
  ArrowLeft, Plus, Trash2, Copy, ChevronDown, ChevronRight, Dumbbell, Layers, ArrowUp, ArrowDown,
  MoreHorizontal, Pencil, Download, Save, Loader2, GripVertical, Clock, Play, Check, AlertCircle,
  Users, CalendarIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cloneWorkoutWithExercises, buildImportSummary, formatImportSummary } from "@/lib/cloneWorkoutHelpers";
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
  onCopyDayToClient?: (pw: ProgramWorkout) => void;
}

const SortableWorkoutCard = ({ pw, pwIdx, phaseIdx, displayPosition, meta, openWorkoutBuilder, removeWorkoutFromPhase, onToggleCustomTag, onCopyDayToClient }: SortableWorkoutCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: pw.id || pw.workoutId + pwIdx });
  const [tagInput, setTagInput] = useState(pw.customTag || "");
  const [showTagInput, setShowTagInput] = useState(pw.excludeFromNumbering || false);
  const [tagError, setTagError] = useState("");

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const handleToggleCustomTag = (checked: boolean) => {
    setShowTagInput(checked);
    if (!checked) {
      setTagInput("");
      setTagError("");
      onToggleCustomTag(phaseIdx, pwIdx, false, null);
    }
  };

  const handleTagBlur = () => {
    const trimmed = tagInput.trim();
    if (showTagInput && !trimmed) {
      setTagError("Please enter a tag name");
      return;
    }
    setTagError("");
    if (showTagInput) {
      onToggleCustomTag(phaseIdx, pwIdx, true, trimmed);
    }
  };

  return (
    <div ref={setNodeRef} style={style} className="flex flex-col gap-2 p-3 border rounded-lg bg-background group hover:ring-1 hover:ring-primary/20 transition-all">
      <div className="flex items-start gap-3">
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
            {pw.excludeFromNumbering && pw.customTag ? (
              <Badge className="text-[10px] px-1.5 bg-slate-600/30 text-slate-300 border-slate-500/30">
                {pw.customTag}
              </Badge>
            ) : displayPosition != null ? (
              <Badge variant="secondary" className="text-[10px] px-1.5">
                Day {displayPosition}
              </Badge>
            ) : null}
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
            {onCopyDayToClient && (
              <DropdownMenuItem onClick={() => onCopyDayToClient(pw)}><Users className="h-3 w-3 mr-2" /> Copy to Client</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => removeWorkoutFromPhase(phaseIdx, pwIdx)}><Trash2 className="h-3 w-3 mr-2" /> Remove</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Custom Tag Toggle */}
      <div className="flex items-center gap-2 pl-7">
        <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={showTagInput}
            onChange={(e) => handleToggleCustomTag(e.target.checked)}
            className="h-3 w-3 rounded border-muted-foreground/30"
          />
          Custom Tag
        </label>
        {showTagInput && (
          <div className="flex items-center gap-1.5 flex-1">
            <Input
              value={tagInput}
              onChange={(e) => {
                const val = e.target.value.slice(0, 20);
                setTagInput(val);
                if (val.trim()) setTagError("");
              }}
              onBlur={handleTagBlur}
              placeholder="e.g. Core, Bonus, Daily"
              className="h-6 text-[11px] max-w-[160px]"
            />
            <span className="text-[9px] text-muted-foreground shrink-0">{tagInput.length}/20</span>
            {tagError && <span className="text-[9px] text-destructive shrink-0">{tagError}</span>}
          </div>
        )}
      </div>
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
  const userId = user?.id;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const saveStatusTimeout = useRef<NodeJS.Timeout | null>(null);
  const [phases, setPhases] = useState<ProgramPhase[]>([]);
  const [programDetails, setProgramDetails] = useState<any>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Workout builder modal
  const [showWorkoutBuilder, setShowWorkoutBuilder] = useState(false);
  const [builderTargetPhase, setBuilderTargetPhase] = useState(0);
  const [editingWorkout, setEditingWorkout] = useState<ProgramWorkout | null>(null);
  const scrollToPhaseRef = useRef<number | null>(null);

  // Workout metadata (exercise counts, durations, thumbnails)
  const [workoutMeta, setWorkoutMeta] = useState<Record<string, WorkoutMeta>>({});

  // Rename phase
  const [renamingPhase, setRenamingPhase] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Import dialog
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importTargetPhase, setImportTargetPhase] = useState(0);
  const [importableWorkouts, setImportableWorkouts] = useState<any[]>([]);

  // Copy to client dialog
  const [showCopyToClientDialog, setShowCopyToClientDialog] = useState(false);
  const [copyPhaseIdx, setCopyPhaseIdx] = useState(0);
  const [copyClients, setCopyClients] = useState<{ id: string; name: string }[]>([]);
  const [selectedCopyClient, setSelectedCopyClient] = useState("");
  const [copyStartOption, setCopyStartOption] = useState<"after_last" | "specific_date">("after_last");
  const [copyStartDate, setCopyStartDate] = useState<Date | undefined>(new Date());
  const [copying, setCopying] = useState(false);
  const [copyClientsLoading, setCopyClientsLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);

  // Copy Day to Client dialog
  const [showCopyDayDialog, setShowCopyDayDialog] = useState(false);
  const [copyDayWorkout, setCopyDayWorkout] = useState<ProgramWorkout | null>(null);
  const [copyDayExercises, setCopyDayExercises] = useState<any[]>([]);
  const [copyDayExercisesLoading, setCopyDayExercisesLoading] = useState(false);
  const [copyDaySelectedClient, setCopyDaySelectedClient] = useState("");
  const [copyDayClientProgram, setCopyDayClientProgram] = useState<{ id: string; name: string; phaseId: string } | null>(null);
  const [copyDayConflict, setCopyDayConflict] = useState<{ existingId: string; existingName: string } | null>(null);
  const [copyDayConflictChoice, setCopyDayConflictChoice] = useState<"replace" | "add_new">("replace");
  const [copyDayStep, setCopyDayStep] = useState<"select_client" | "preview" | "conflict" | "copying">("select_client");
  const [copyDayCopying, setCopyDayCopying] = useState(false);

  // Scroll to phase after save + reload
  useEffect(() => {
    if (scrollToPhaseRef.current !== null && !loading && phases.length > 0) {
      const idx = scrollToPhaseRef.current;
      scrollToPhaseRef.current = null;
      requestAnimationFrame(() => {
        setTimeout(() => {
          const el = document.querySelector(`[data-phase-index="${idx}"]`);
          el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      });
    }
  }, [loading, phases]);

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
    if (!userId) return;
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
  }, [programId, userId, toast]);

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

  // ── Debounced auto-persist of phase settings (1500ms) ──
  const phaseAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPersistedPhaseSnapshotRef = useRef<Record<string, string>>({});

  const buildPhaseSettingsSnapshot = useCallback((phase: ProgramPhase) => JSON.stringify({
    name: phase.name, description: phase.description, durationWeeks: phase.durationWeeks,
    trainingStyle: phase.trainingStyle, intensitySystem: phase.intensitySystem,
    customIntensity: phase.customIntensity, progressionRule: phase.progressionRule,
  }), []);

  // Initialize snapshots after load
  useEffect(() => {
    if (!loading && phases.length > 0) {
      const snaps: Record<string, string> = {};
      phases.forEach(p => { if (p.id) snaps[p.id] = buildPhaseSettingsSnapshot(p); });
      lastPersistedPhaseSnapshotRef.current = snaps;
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (loading || saving) return;
    if (phaseAutoSaveTimerRef.current) clearTimeout(phaseAutoSaveTimerRef.current);
    phaseAutoSaveTimerRef.current = setTimeout(async () => {
      for (const phase of phases) {
        if (!phase.id) continue;
        const snapshot = buildPhaseSettingsSnapshot(phase);
        if (snapshot === lastPersistedPhaseSnapshotRef.current[phase.id]) continue;

        showSaveStatus("saving");
        try {
          const { error } = await supabase.from("program_phases").update({
            name: phase.name,
            description: phase.description || null,
            duration_weeks: phase.durationWeeks,
            training_style: phase.trainingStyle,
            intensity_system: phase.intensitySystem,
            custom_intensity: phase.customIntensity || null,
            progression_rule: phase.progressionRule,
          }).eq("id", phase.id);
          if (error) throw error;
          lastPersistedPhaseSnapshotRef.current[phase.id] = snapshot;

          // Also update program total duration
          const totalDuration = phases.reduce((s, p) => s + p.durationWeeks, 0);
          await supabase.from("programs").update({ duration_weeks: totalDuration } as any).eq("id", programId);

          showSaveStatus("saved");
        } catch (err) {
          console.error("[ProgramDetailView] Phase autosave failed:", err);
          showSaveStatus("failed");
        }
      }
    }, 1500);
    return () => { if (phaseAutoSaveTimerRef.current) clearTimeout(phaseAutoSaveTimerRef.current); };
  }, [phases, loading, saving, buildPhaseSettingsSnapshot, programId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush phase settings on visibilitychange
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden" && phaseAutoSaveTimerRef.current) {
        clearTimeout(phaseAutoSaveTimerRef.current);
        phaseAutoSaveTimerRef.current = null;
        // Fire synchronously-queued saves
        for (const phase of phases) {
          if (!phase.id) continue;
          const snapshot = buildPhaseSettingsSnapshot(phase);
          if (snapshot === lastPersistedPhaseSnapshotRef.current[phase.id]) continue;
          supabase.from("program_phases").update({
            name: phase.name, description: phase.description || null,
            duration_weeks: phase.durationWeeks, training_style: phase.trainingStyle,
            intensity_system: phase.intensitySystem, custom_intensity: phase.customIntensity || null,
            progression_rule: phase.progressionRule,
          }).eq("id", phase.id).then(() => {
            lastPersistedPhaseSnapshotRef.current[phase.id!] = snapshot;
          });
        }
      }
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [phases, buildPhaseSettingsSnapshot]);

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
    const wasEditing = !!editingWorkout;
    const newPhases = [...phases];
    const phase = newPhases[builderTargetPhase];

    if (!phase) {
      throw new Error("Selected phase not found");
    }

    if (wasEditing) {
      const idx = phase.workouts.findIndex(w => w.workoutId === editingWorkout!.workoutId);
      if (idx >= 0) phase.workouts[idx] = { ...phase.workouts[idx], workoutId, workoutName };
    } else {
      const existingCount = phase.workouts.length;
      phase.workouts.push({
        workoutId,
        workoutName,
        dayOfWeek: existingCount,
        dayLabel: DAY_LABELS[Math.min(existingCount, 6)],
        sortOrder: existingCount,
      });
    }

    setPhases(newPhases);
    loadWorkoutMeta(newPhases);
    showSaveStatus("saving");

    try {
      const phaseExistedBeforeSave = !!phase.id;

      if (!phase.id) {
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
          .select("id")
          .single();

        if (phaseErr) throw phaseErr;
        phase.id = phaseRow.id;

        const totalDuration = newPhases.reduce((sum, p) => sum + p.durationWeeks, 0);
        const { error: durationErr } = await supabase
          .from("programs")
          .update({ duration_weeks: totalDuration } as any)
          .eq("id", programId);
        if (durationErr) throw durationErr;
      }

      if (!wasEditing) {
        const newWorkout = phase.workouts[phase.workouts.length - 1];
        if (!newWorkout) throw new Error("Workout could not be linked to phase");

        const insertPayload = {
          phase_id: phase.id,
          workout_id: newWorkout.workoutId,
          day_of_week: newWorkout.dayOfWeek,
          day_label: newWorkout.dayLabel,
          sort_order: newWorkout.sortOrder,
          exclude_from_numbering: newWorkout.excludeFromNumbering || false,
          custom_tag: newWorkout.customTag || null,
        };

        let { data: linkedWorkout, error: linkErr } = await supabase
          .from("program_workouts")
          .insert(insertPayload)
          .select("id")
          .single();

        if (linkErr && phaseExistedBeforeSave) {
          const { data: freshPhases } = await supabase
            .from("program_phases")
            .select("id, name, phase_order")
            .eq("program_id", programId)
            .order("phase_order");

          const refreshedPhase =
            freshPhases?.find((p) => p.id === phase.id) ||
            freshPhases?.find((p) => p.phase_order === phase.phaseOrder && p.name === phase.name) ||
            freshPhases?.[builderTargetPhase];

          if (refreshedPhase?.id && refreshedPhase.id !== phase.id) {
            phase.id = refreshedPhase.id;
            ({ data: linkedWorkout, error: linkErr } = await supabase
              .from("program_workouts")
              .insert({ ...insertPayload, phase_id: refreshedPhase.id })
              .select("id")
              .single());
          }
        }

        if (linkErr) throw linkErr;
        newWorkout.id = linkedWorkout.id;
      }

      setPhases([...newPhases]);
      setShowWorkoutBuilder(false);
      setEditingWorkout(null);
      showSaveStatus("saved");
      scrollToPhaseRef.current = builderTargetPhase;
      await loadProgram();
    } catch (err: any) {
      console.error("[ProgramSave] Failed to save workout link:", err);
      toast({ title: "Failed to save workout — please try again.", description: err.message, variant: "destructive" });
      showSaveStatus("failed");
      await loadProgram();
      throw err;
    }
  };

  const removeWorkoutFromPhase = async (phaseIdx: number, workoutIdx: number) => {
    const newPhases = [...phases];
    const removed = newPhases[phaseIdx].workouts[workoutIdx];
    newPhases[phaseIdx].workouts.splice(workoutIdx, 1);
    setPhases(newPhases);

    // Also delete from DB if it has an ID
    if (removed.id) {
      const { error } = await supabase.from("program_workouts").delete().eq("id", removed.id);
      if (error) {
        console.error("[ProgramSave] Failed to delete workout from phase:", error);
        toast({ title: "Failed to remove workout — please try again.", variant: "destructive" });
      }
    }
  };

  const handleToggleCustomTag = useCallback(async (phaseIdx: number, pwIdx: number, exclude: boolean, tag: string | null) => {
    const newPhases = [...phases];
    const pw = newPhases[phaseIdx].workouts[pwIdx];
    pw.excludeFromNumbering = exclude;
    pw.customTag = tag;
    setPhases(newPhases);

    // Persist to DB if saved
    if (pw.id) {
      const { error } = await supabase.from("program_workouts").update({
        exclude_from_numbering: exclude,
        custom_tag: tag,
      } as any).eq("id", pw.id);
      if (error) {
        console.error("[ProgramSave] Failed to update custom tag:", error);
        toast({ title: "Failed to save tag — please try again.", variant: "destructive" });
      }
    }
  }, [phases]);

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
    const { workout: newW } = await cloneWorkoutWithExercises(sourceWorkout.id, user.id, undefined, true);
    if (!newW) return;

    const { data: origW } = await supabase.from("workouts")
      .select("name").eq("id", sourceWorkout.id).single();

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


  // ── Copy Phase to Client ──
  const loadCopyClients = useCallback(async () => {
    if (!userId) return;
    setCopyClientsLoading(true);
    try {
      const { data: ccRows } = await supabase
        .from("coach_clients")
        .select("client_id")
        .eq("coach_id", userId)
        .eq("status", "active");
      const clientIds = (ccRows || []).map(r => r.client_id);
      if (clientIds.length === 0) { setCopyClients([]); return; }
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", clientIds);
      setCopyClients(
        (profiles || []).map(p => ({ id: p.user_id, name: p.full_name || "Unknown" })).sort((a, b) => a.name.localeCompare(b.name))
      );
    } finally {
      setCopyClientsLoading(false);
    }
  }, [userId]);

  const openCopyToClientDialog = (phaseIdx: number) => {
    setCopyPhaseIdx(phaseIdx);
    setSelectedCopyClient("");
    setCopyStartOption("after_last");
    setCopyStartDate(new Date());
    setShowCopyToClientDialog(true);
    loadCopyClients();
  };

  const handleCopyPhaseToClient = async () => {
    if (!userId || !selectedCopyClient) return;
    const phase = phases[copyPhaseIdx];
    if (!phase || !phase.id) {
      toast({ title: "Phase must be saved first", description: "Save the program, then try again.", variant: "destructive" });
      return;
    }
    setCopying(true);
    try {
      // 1. Determine start date
      let startDate: string;
      if (copyStartOption === "specific_date" && copyStartDate) {
        startDate = format(copyStartDate, "yyyy-MM-dd");
      } else {
        // Find latest active assignment end date
        const { data: assignments } = await supabase
          .from("client_program_assignments")
          .select("start_date, program_id, programs(duration_weeks)")
          .eq("client_id", selectedCopyClient)
          .eq("status", "active")
          .order("start_date", { ascending: false })
          .limit(1);
        const latest = assignments?.[0];
        if (latest && (latest as any).programs?.duration_weeks) {
          const endMs = new Date(latest.start_date).getTime() + ((latest as any).programs.duration_weeks * 7 * 86400000);
          startDate = format(new Date(endMs), "yyyy-MM-dd");
        } else {
          startDate = format(new Date(), "yyyy-MM-dd");
        }
      }

      // 2. Create new program for client
      const phaseProgramName = `${phase.name} — ${programDetails?.name || programName}`;
      const { data: newProg, error: progErr } = await supabase
        .from("programs")
        .insert({
          coach_id: userId,
          name: phaseProgramName,
          description: programDetails?.description || null,
          duration_weeks: phase.durationWeeks,
          is_template: false,
          is_master: false,
        } as any)
        .select("id")
        .single();
      if (progErr) throw progErr;

      // 3. Clone the phase
      const { data: newPhase, error: phaseErr } = await supabase
        .from("program_phases")
        .insert({
          program_id: newProg.id,
          name: phase.name,
          description: phase.description || null,
          phase_order: 1,
          duration_weeks: phase.durationWeeks,
          training_style: phase.trainingStyle,
          intensity_system: phase.intensitySystem,
          custom_intensity: phase.customIntensity || null,
          progression_rule: phase.progressionRule,
        })
        .select("id")
        .single();
      if (phaseErr) throw phaseErr;

      // 4. Clone workouts + exercises (sequential)
      const allCloneResults: import("@/lib/cloneWorkoutHelpers").CloneWorkoutResult[] = [];
      for (const pw of phase.workouts) {
        const { workout: clonedW, result } = await cloneWorkoutWithExercises(
          pw.workoutId, userId, selectedCopyClient, false
        );
        allCloneResults.push(result);
        if (!clonedW) continue;

        // Link to phase
        await supabase.from("program_workouts").insert({
          phase_id: newPhase.id,
          workout_id: clonedW.id,
          day_of_week: pw.dayOfWeek,
          day_label: pw.dayLabel,
          sort_order: pw.sortOrder,
          exclude_from_numbering: pw.excludeFromNumbering || false,
          custom_tag: pw.customTag || null,
        });
      }

      // 5. Create assignment
      const { error: assignErr } = await supabase
        .from("client_program_assignments")
        .insert({
          client_id: selectedCopyClient,
          coach_id: userId,
          program_id: newProg.id,
          current_phase_id: newPhase.id,
          start_date: startDate,
          status: "active",
          current_week_number: 1,
          is_linked_to_master: false,
          master_version_number: 1,
        });
      if (assignErr) throw assignErr;

      const summary = buildImportSummary(allCloneResults);
      const msg = formatImportSummary(summary);
      toast({ title: msg.isWarning ? msg.title : "Phase copied to client", description: msg.isWarning ? msg.description : `${phase.name} assigned with ${summary.totalExercises} exercises.`, variant: msg.isWarning ? "destructive" : undefined });
      setShowCopyToClientDialog(false);
    } catch (err: any) {
      console.error("[CopyToClient] Error:", err);
      toast({ title: "Failed to copy phase", description: err.message, variant: "destructive" });
    } finally {
      setCopying(false);
    }
  };

  // ── Copy Day to Client ──
  const openCopyDayToClient = async (pw: ProgramWorkout) => {
    setCopyDayWorkout(pw);
    setCopyDaySelectedClient("");
    setCopyDayClientProgram(null);
    setCopyDayConflict(null);
    setCopyDayConflictChoice("replace");
    setCopyDayStep("select_client");
    setCopyDayExercises([]);
    setShowCopyDayDialog(true);
    loadCopyClients();

    // Load exercises for preview
    setCopyDayExercisesLoading(true);
    const { data: exes } = await supabase
      .from("workout_exercises")
      .select("exercise_id, exercise_order, sets, reps, tempo, rest_seconds, rir, notes, rpe_target, exercises(name)")
      .eq("workout_id", pw.workoutId)
      .order("exercise_order");
    setCopyDayExercises(exes || []);
    setCopyDayExercisesLoading(false);
  };

  const handleCopyDaySelectClient = async (clientId: string) => {
    setCopyDaySelectedClient(clientId);
    // Find the client's active program
    const { data: assignments } = await supabase
      .from("client_program_assignments")
      .select("program_id, current_phase_id, programs(name)")
      .eq("client_id", clientId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1);
    
    const assignment = assignments?.[0];
    if (assignment) {
      setCopyDayClientProgram({
        id: assignment.program_id,
        name: (assignment as any).programs?.name || "Current Program",
        phaseId: assignment.current_phase_id || "",
      });
    } else {
      setCopyDayClientProgram(null);
    }
  };

  const handleCopyDayProceedToPreview = async () => {
    setCopyDayStep("preview");
  };

  const handleCopyDayConfirm = async () => {
    if (!copyDayClientProgram || !copyDayWorkout) return;

    // Check for conflicts — does this phase already have a day with same sort_order or name?
    const { data: existingPws } = await supabase
      .from("program_workouts")
      .select("id, workout_id, sort_order, day_label, workouts(name)")
      .eq("phase_id", copyDayClientProgram.phaseId);

    const conflict = (existingPws || []).find((epw: any) =>
      epw.sort_order === copyDayWorkout.sortOrder ||
      (epw.workouts as any)?.name === copyDayWorkout.workoutName
    );

    if (conflict) {
      setCopyDayConflict({
        existingId: conflict.id,
        existingName: `${conflict.day_label || "Day"}: ${(conflict.workouts as any)?.name || "Workout"}`,
      });
      setCopyDayStep("conflict");
      return;
    }

    // No conflict — proceed with add
    await executeCopyDay("add_new");
  };

  const executeCopyDay = async (mode: "replace" | "add_new") => {
    if (!userId || !copyDayWorkout || !copyDayClientProgram) return;
    setCopyDayCopying(true);
    setCopyDayStep("copying");
    try {
      const { workout: clonedW, result } = await cloneWorkoutWithExercises(
        copyDayWorkout.workoutId, userId, copyDaySelectedClient, false
      );
      if (!clonedW) throw new Error(result.errors.join(", ") || "Failed to clone workout");

      if (mode === "replace" && copyDayConflict) {
        // Delete existing program_workout and its workout
        const { data: existingPw } = await supabase
          .from("program_workouts")
          .select("workout_id")
          .eq("id", copyDayConflict.existingId)
          .single();
        await supabase.from("program_workouts").delete().eq("id", copyDayConflict.existingId);
        if (existingPw) {
          await supabase.from("workout_exercises").delete().eq("workout_id", existingPw.workout_id);
          await supabase.from("workouts").delete().eq("id", existingPw.workout_id);
        }
      }

      // Determine sort_order
      let sortOrder = copyDayWorkout.sortOrder;
      if (mode === "add_new") {
        const { data: existingPws } = await supabase
          .from("program_workouts")
          .select("sort_order")
          .eq("phase_id", copyDayClientProgram.phaseId)
          .order("sort_order", { ascending: false })
          .limit(1);
        sortOrder = ((existingPws?.[0]?.sort_order ?? -1) + 1);
      }

      await supabase.from("program_workouts").insert({
        phase_id: copyDayClientProgram.phaseId,
        workout_id: clonedW.id,
        day_of_week: copyDayWorkout.dayOfWeek,
        day_label: copyDayWorkout.dayLabel,
        sort_order: sortOrder,
        exclude_from_numbering: copyDayWorkout.excludeFromNumbering || false,
        custom_tag: copyDayWorkout.customTag || null,
      });

      const clientName = copyClients.find(c => c.id === copyDaySelectedClient)?.name || "client";
      if (result.exercisesCopied === result.exercisesExpected) {
        toast({
          title: `Day copied to ${clientName}`,
          description: `${copyDayWorkout.workoutName} with ${result.exercisesCopied} exercises.`,
        });
      } else {
        toast({
          title: `Day copied with warnings`,
          description: `${result.exercisesCopied}/${result.exercisesExpected} exercises copied. Check ${clientName}'s program.`,
          variant: "destructive",
        });
      }

      setShowCopyDayDialog(false);
    } catch (err: any) {
      console.error("[CopyDayToClient] Error:", err);
      toast({ title: "Failed to copy day", description: err.message, variant: "destructive" });
      setCopyDayStep("preview");
    } finally {
      setCopyDayCopying(false);
    }
  };

  const showSaveStatus = (status: "saving" | "saved" | "failed") => {
    if (saveStatusTimeout.current) clearTimeout(saveStatusTimeout.current);
    setSaveStatus(status);
    if (status === "saved") {
      saveStatusTimeout.current = setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  // ── Save (uses provided phases or falls back to current state) ──
  const saveProgramWithPhases = async (phasesToSave: ProgramPhase[]) => {
    if (!user) return;
    setSaving(true);
    showSaveStatus("saving");
    try {
      const totalDuration = phasesToSave.reduce((s, p) => s + p.durationWeeks, 0);

      const updatedName = programDetails?.name || programName;
      const { error: updateErr } = await supabase.from("programs").update({ duration_weeks: totalDuration, name: updatedName } as any).eq("id", programId);
      if (updateErr) throw updateErr;

      // Delete existing program_workouts linked to this program's phases
      const { data: existingPhases } = await supabase.from("program_phases").select("id").eq("program_id", programId);
      if (existingPhases && existingPhases.length > 0) {
        const { error: delPwErr } = await supabase.from("program_workouts").delete().in("phase_id", existingPhases.map(p => p.id));
        if (delPwErr) { console.error("[ProgramSave] Failed to delete program_workouts:", delPwErr); throw delPwErr; }
      }
      // Delete existing phases and orphan weeks
      const { error: delPhaseErr } = await supabase.from("program_phases").delete().eq("program_id", programId);
      if (delPhaseErr) { console.error("[ProgramSave] Failed to delete phases:", delPhaseErr); throw delPhaseErr; }
      const { error: delWeekErr } = await supabase.from("program_weeks").delete().eq("program_id", programId);
      if (delWeekErr) { console.error("[ProgramSave] Failed to delete weeks:", delWeekErr); throw delWeekErr; }

      // Insert phases with direct workout links
      for (const phase of phasesToSave) {
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
        if (phaseErr) { console.error("[ProgramSave] Failed to insert phase:", phase.name, phaseErr); throw phaseErr; }

        if (phase.workouts.length > 0) {
          const { data: pwData, error: pwErr } = await supabase.from("program_workouts").insert(
            phase.workouts.map((w, i) => ({
              phase_id: phaseRow.id,
              workout_id: w.workoutId,
              day_of_week: w.dayOfWeek,
              day_label: w.dayLabel,
              sort_order: i,
              exclude_from_numbering: w.excludeFromNumbering || false,
              custom_tag: w.customTag || null,
            }))
          ).select();
          if (pwErr) { console.error("[ProgramSave] Failed to insert program_workouts:", pwErr); throw pwErr; }
          if (!pwData || pwData.length === 0) console.warn("[ProgramSave] program_workouts insert returned no data");
        }
      }

      toast({ title: "Program saved" });
      showSaveStatus("saved");
      // Re-fetch from database to ensure UI matches persisted state
      await loadProgram();
    } catch (err: any) {
      console.error("[ProgramSave] Error:", err);
      toast({ title: "Failed to save program — please try again.", description: err.message, variant: "destructive" });
      showSaveStatus("failed");
    } finally {
      setSaving(false);
    }
  };

  const saveProgram = () => saveProgramWithPhases(phases);

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
        <div className="flex items-center gap-3 group">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            {editingName ? (
              <Input
                ref={nameInputRef}
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                onBlur={() => {
                  const trimmed = nameValue.trim();
                  if (trimmed && trimmed !== (programDetails?.name || programName)) {
                    setProgramDetails((prev: any) => prev ? { ...prev, name: trimmed } : prev);
                  } else {
                    setNameValue(programDetails?.name || programName);
                  }
                  setEditingName(false);
                }}
                onKeyDown={e => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") { setNameValue(programDetails?.name || programName); setEditingName(false); }
                }}
                className="text-xl font-bold h-9 px-2 bg-secondary border-primary/40"
                autoFocus
              />
            ) : (
              <h2
                className="text-xl font-bold text-foreground cursor-pointer hover:text-primary transition-colors flex items-center gap-1.5"
                onClick={() => { setNameValue(programDetails?.name || programName); setEditingName(true); setTimeout(() => nameInputRef.current?.select(), 50); }}
                title="Click to rename"
              >
                {programDetails?.name || programName}
                <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </h2>
            )}
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
        <div className="flex items-center gap-3">
          {/* Save status indicator */}
          {saveStatus === "saving" && (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5 animate-pulse">
              <Loader2 className="h-3 w-3 animate-spin" /> Saving...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5 animate-in fade-in duration-300">
              <Check className="h-3 w-3 text-green-500" /> Saved
            </span>
          )}
          {saveStatus === "failed" && (
            <span className="text-xs text-destructive flex items-center gap-1.5">
              <AlertCircle className="h-3 w-3" /> Save failed
            </span>
          )}
          <Button onClick={saveProgram} disabled={saving} size="sm">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Save
          </Button>
        </div>
      </div>

      {/* Phases */}
      <div className="space-y-3">
        {phases.map((phase, phaseIdx) => (
          <Card key={phaseIdx} data-phase-index={phaseIdx} className="border-l-4 border-l-primary/40">
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
                        <DropdownMenuItem onClick={() => openCopyToClientDialog(phaseIdx)}><Users className="h-3.5 w-3.5 mr-2" /> Copy to Client</DropdownMenuItem>
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
                          {(() => {
                            let dayCounter = 1;
                            return phase.workouts.map((pw, pwIdx) => {
                              const isExcluded = pw.excludeFromNumbering;
                              const pos = isExcluded ? null : dayCounter++;
                              return (
                                <SortableWorkoutCard
                                  key={pw.id || pw.workoutId + pwIdx}
                                  pw={pw}
                                  pwIdx={pwIdx}
                                  phaseIdx={phaseIdx}
                                  displayPosition={pos}
                                  meta={workoutMeta[pw.workoutId]}
                                  openWorkoutBuilder={openWorkoutBuilder}
                                  removeWorkoutFromPhase={removeWorkoutFromPhase}
                                  onToggleCustomTag={handleToggleCustomTag}
                                  onCopyDayToClient={openCopyDayToClient}
                                />
                              );
                            });
                          })()}
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

      {/* Copy Phase to Client Dialog */}
      <Dialog open={showCopyToClientDialog} onOpenChange={setShowCopyToClientDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Copy Phase to Client</DialogTitle>
            <DialogDescription>
              Clone "{phases[copyPhaseIdx]?.name}" and assign it to a client's program.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Select Client</Label>
              {copyClientsLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <SearchableClientSelect
                  clients={copyClients}
                  value={selectedCopyClient}
                  onValueChange={setSelectedCopyClient}
                  placeholder="Search clients..."
                />
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Schedule</Label>
              <RadioGroup value={copyStartOption} onValueChange={(v) => setCopyStartOption(v as any)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="after_last" id="after_last" />
                  <Label htmlFor="after_last" className="text-sm font-normal cursor-pointer">
                    Immediately after last scheduled training phase
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="specific_date" id="specific_date" />
                  <Label htmlFor="specific_date" className="text-sm font-normal cursor-pointer">
                    Start on a specific date
                  </Label>
                </div>
              </RadioGroup>

              {copyStartOption === "specific_date" && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !copyStartDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {copyStartDate ? format(copyStartDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={copyStartDate}
                      onSelect={setCopyStartDate}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                      classNames={copyStartDate ? { day_today: "text-muted-foreground" } : undefined}
                    />
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCopyToClientDialog(false)}>Cancel</Button>
            <Button onClick={handleCopyPhaseToClient} disabled={copying || !selectedCopyClient}>
              {copying ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Users className="h-3.5 w-3.5 mr-1" />}
              Copy to Client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
