import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, Search, Dumbbell, Trash2, Save, Loader2, GripVertical, ChevronUp, ChevronDown,
  Link, Unlink, Copy, Play, X, Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import AddCustomExerciseModal from "./AddCustomExerciseModal";

/** Rest (s) input that uses local string state to avoid stuck-zero bug */
const RestSecondsInput = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => {
  const [localVal, setLocalVal] = useState(String(value ?? 0));
  // Sync external value changes (e.g. loading workout)
  useEffect(() => { setLocalVal(String(value ?? 0)); }, [value]);
  return (
    <div className="space-y-0.5">
      <Label className="text-[9px] text-muted-foreground">Rest (s)</Label>
      <Input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={localVal}
        onChange={(e) => setLocalVal(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={() => {
          const parsed = parseInt(localVal, 10);
          const final = isNaN(parsed) ? 0 : parsed;
          setLocalVal(String(final));
          onChange(final);
        }}
        className="h-7 text-xs text-center"
        placeholder="0"
      />
    </div>
  );
};

const MUSCLE_GROUPS = [
  "Chest", "Back", "Shoulders", "Biceps", "Triceps", "Forearms",
  "Quads", "Hamstrings", "Glutes", "Calves", "Abs", "Obliques",
  "Traps", "Lats", "Rear Delts", "Core", "Full Body",
];

const EQUIPMENT_OPTIONS = [
  "Barbell", "Dumbbell", "Cable", "Machine", "Bodyweight", "Bands",
  "Kettlebell", "Smith Machine", "EZ Bar",
];

interface WorkoutExercise {
  id?: string;
  exerciseId: string;
  exerciseName: string;
  thumbnail: string | null;
  youtubeUrl: string | null;
  exerciseOrder: number;
  sets: number;
  reps: string;
  tempo: string;
  restSeconds: number;
  rir: string;
  rpe: string;
  notes: string;
  groupingType: string | null;
  groupingId: string | null;
  selected?: boolean;
}

interface Exercise {
  id: string;
  name: string;
  primary_muscle: string | null;
  equipment: string | null;
  youtube_thumbnail: string | null;
  youtube_url: string | null;
  tags: string[];
}

interface WorkoutBuilderModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (workoutId: string, workoutName: string) => void | Promise<void>;
  editWorkoutId?: string;
  coachId: string;
}

function estimateWorkoutMinutes(exercises: WorkoutExercise[]): number {
  if (exercises.length === 0) return 0;
  let totalSeconds = 0;
  for (const ex of exercises) {
    const sets = ex.sets || 3;
    const rest = ex.restSeconds || 60;
    totalSeconds += sets * 35 + Math.max(0, sets - 1) * rest;
  }
  totalSeconds += Math.max(0, exercises.length - 1) * 50;
  return Math.round(totalSeconds / 60);
}

function getYouTubeEmbedUrl(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^?&/]+)/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : null;
}

const WorkoutBuilderModal = ({ open, onClose, onSave, editWorkoutId, coachId }: WorkoutBuilderModalProps) => {
  const { toast } = useToast();
  const [workoutName, setWorkoutName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scheduledCount, setScheduledCount] = useState(0);
  const [autoSaveState, setAutoSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Toggles
  const [useRpe, setUseRpe] = useState(false);
  const [useTempo, setUseTempo] = useState(false);
  const [useRir, setUseRir] = useState(true);

  // Exercise library state
  const [libraryExercises, setLibraryExercises] = useState<Exercise[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Check if this workout has future scheduled calendar events
  useEffect(() => {
    if (!editWorkoutId || !open) { setScheduledCount(0); return; }
    supabase
      .from("calendar_events")
      .select("id", { count: "exact", head: true })
      .eq("linked_workout_id", editWorkoutId)
      .eq("event_type", "workout")
      .gte("event_date", new Date().toISOString().slice(0, 10))
      .then(({ count }) => setScheduledCount(count ?? 0));
  }, [editWorkoutId, open]);
  const [filterMuscle, setFilterMuscle] = useState("all");
  const [filterEquipment, setFilterEquipment] = useState("all");

  // Selection for grouping
  const [selectionMode, setSelectionMode] = useState(false);

  // Custom exercise modal
  const [showCustomExerciseModal, setShowCustomExerciseModal] = useState(false);
  const [highlightExerciseIdx, setHighlightExerciseIdx] = useState<number | null>(null);

  // Video preview
  const [previewExerciseIdx, setPreviewExerciseIdx] = useState<number | null>(null);

  // Drag and drop state
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [isDraggingFromLibrary, setIsDraggingFromLibrary] = useState(false);
  const draggedExerciseRef = useRef<Exercise | null>(null);
  const draggedWorkoutIdx = useRef<number | null>(null);

  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true);
    const { data } = await supabase
      .from("exercises")
      .select("id, name, primary_muscle, equipment, youtube_thumbnail, youtube_url, tags")
      .order("name");
    setLibraryExercises((data as Exercise[]) || []);
    setLibraryLoading(false);
  }, []);

  useEffect(() => { if (open) loadLibrary(); }, [open, loadLibrary]);

  // ── sessionStorage draft persistence + resilient autosave ──
  const draftKey = `workout_draft_${editWorkoutId || "new"}_${coachId}`;
  const savedSuccessfullyRef = useRef(false);
  const hydratedRef = useRef(false);
  const lastPersistedSnapshotRef = useRef("");
  const autoSaveInFlightRef = useRef(false);
  const queuedAutoSaveRef = useRef(false);
  const syncedDuringSessionRef = useRef(false);
  const autoSaveStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildDraftSnapshot = useCallback(() => JSON.stringify({
    workoutName,
    instructions,
    exercises: exercises.map(({ selected, ...exercise }) => ({ ...exercise, selected: false })),
    useRpe,
    useTempo,
    useRir,
  }), [workoutName, instructions, exercises, useRpe, useTempo, useRir]);

  const applyDraftState = useCallback((draft: any) => {
    setWorkoutName(draft.workoutName || "");
    setInstructions(draft.instructions || "");
    setExercises(Array.isArray(draft.exercises)
      ? draft.exercises.map((exercise: WorkoutExercise, index: number) => ({
          ...exercise,
          exerciseOrder: exercise.exerciseOrder || index + 1,
          selected: false,
        }))
      : []);
    setUseRpe(Boolean(draft.useRpe));
    setUseTempo(Boolean(draft.useTempo));
    setUseRir(draft.useRir !== undefined ? Boolean(draft.useRir) : true);
  }, []);

  const persistDraftToSession = useCallback(() => {
    if (!open) return;
    try {
      const snapshot = buildDraftSnapshot();
      const hasContent = workoutName.trim() || instructions.trim() || exercises.length > 0;
      if (hasContent) {
        sessionStorage.setItem(draftKey, snapshot);
      } else {
        sessionStorage.removeItem(draftKey);
      }
    } catch {
      // Ignore storage quota / serialization failures and keep in-memory state intact.
    }
  }, [open, buildDraftSnapshot, draftKey, workoutName, instructions, exercises.length]);

  const setTransientAutoSaveState = useCallback((state: "idle" | "saving" | "saved" | "error") => {
    if (autoSaveStatusTimeoutRef.current) clearTimeout(autoSaveStatusTimeoutRef.current);
    setAutoSaveState(state);
    if (state === "saved") {
      autoSaveStatusTimeoutRef.current = setTimeout(() => setAutoSaveState("idle"), 1800);
    }
  }, []);

  const persistExistingWorkoutChanges = useCallback(async () => {
    if (!editWorkoutId) return false;
    const trimmedName = workoutName.trim();
    if (!trimmedName) return false;

    const { error: updateErr } = await supabase
      .from("workouts")
      .update({ name: trimmedName, instructions: instructions || null })
      .eq("id", editWorkoutId);
    if (updateErr) throw updateErr;

    const { error: deleteErr } = await supabase
      .from("workout_exercises")
      .delete()
      .eq("workout_id", editWorkoutId);
    if (deleteErr) throw deleteErr;

    if (exercises.length > 0) {
      const { data: insertedExercises, error: insertErr } = await supabase
        .from("workout_exercises")
        .insert(
          exercises.map((exercise, index) => ({
            workout_id: editWorkoutId,
            exercise_id: exercise.exerciseId,
            exercise_order: index + 1,
            sets: exercise.sets,
            reps: exercise.reps || null,
            tempo: useTempo ? (exercise.tempo || null) : null,
            rest_seconds: exercise.restSeconds || null,
            rir: useRir ? (exercise.rir ? parseInt(exercise.rir, 10) : null) : null,
            rpe_target: useRpe ? (exercise.rpe ? parseFloat(exercise.rpe) : null) : null,
            notes: exercise.notes || null,
            superset_group: null,
            grouping_type: exercise.groupingType || null,
            grouping_id: exercise.groupingId || null,
          }))
        )
        .select("id");
      if (insertErr) throw insertErr;

      const setRows = (insertedExercises || []).flatMap((workoutExercise, index) => {
        const exercise = exercises[index];
        return Array.from({ length: exercise.sets }, (_, setIndex) => ({
          workout_exercise_id: workoutExercise.id,
          set_number: setIndex + 1,
          rep_target: exercise.reps || null,
          rpe_target: useRpe ? (exercise.rpe ? parseFloat(exercise.rpe) : null) : null,
          set_type: "working",
        }));
      });

      if (setRows.length > 0) {
        const { error: setErr } = await supabase.from("workout_sets").insert(setRows);
        if (setErr) throw setErr;
      }
    }

    lastPersistedSnapshotRef.current = buildDraftSnapshot();
    syncedDuringSessionRef.current = true;
    return true;
  }, [editWorkoutId, workoutName, instructions, exercises, useTempo, useRir, useRpe, buildDraftSnapshot]);

  const triggerAutoSave = useCallback(async () => {
    if (!open || !editWorkoutId || !hydratedRef.current || loading) return;
    if (!workoutName.trim()) return;

    const nextSnapshot = buildDraftSnapshot();
    if (nextSnapshot === lastPersistedSnapshotRef.current) return;

    if (autoSaveInFlightRef.current) {
      queuedAutoSaveRef.current = true;
      return;
    }

    autoSaveInFlightRef.current = true;
    setTransientAutoSaveState("saving");

    try {
      await persistExistingWorkoutChanges();
      setTransientAutoSaveState("saved");
    } catch (error) {
      console.error("[WorkoutBuilder] Autosave failed:", error);
      setTransientAutoSaveState("error");
    } finally {
      autoSaveInFlightRef.current = false;
      if (queuedAutoSaveRef.current) {
        queuedAutoSaveRef.current = false;
        if (buildDraftSnapshot() !== lastPersistedSnapshotRef.current) {
          void triggerAutoSave();
        }
      }
    }
  }, [open, editWorkoutId, loading, workoutName, buildDraftSnapshot, persistExistingWorkoutChanges, setTransientAutoSaveState]);

  useEffect(() => {
    if (!open) return;
    hydratedRef.current = false;
    syncedDuringSessionRef.current = false;
    queuedAutoSaveRef.current = false;
    setAutoSaveState("idle");

    let cancelled = false;

    const hydrateBuilder = async () => {
      setLoading(Boolean(editWorkoutId));

      try {
        const rawDraft = sessionStorage.getItem(draftKey);
        if (rawDraft) {
          applyDraftState(JSON.parse(rawDraft));
          lastPersistedSnapshotRef.current = editWorkoutId ? "" : rawDraft;
          return;
        }

        if (!editWorkoutId) {
          setWorkoutName("");
          setInstructions("");
          setExercises([]);
          setUseRpe(false);
          setUseTempo(false);
          setUseRir(true);
          lastPersistedSnapshotRef.current = "";
          return;
        }

        const { data: workout, error: workoutErr } = await supabase
          .from("workouts")
          .select("name, instructions")
          .eq("id", editWorkoutId)
          .single();
        if (workoutErr) throw workoutErr;

        const { data: exRows, error: exerciseErr } = await supabase
          .from("workout_exercises")
          .select("id, exercise_id, exercise_order, sets, reps, tempo, rest_seconds, rir, notes, rpe_target, grouping_type, grouping_id, exercises(name, youtube_thumbnail, youtube_url)")
          .eq("workout_id", editWorkoutId)
          .order("exercise_order");
        if (exerciseErr) throw exerciseErr;

        if (cancelled) return;

        const loadedExercises = (exRows || []).map((exercise: any) => ({
          id: exercise.id,
          exerciseId: exercise.exercise_id,
          exerciseName: exercise.exercises?.name || "Unknown",
          thumbnail: exercise.exercises?.youtube_thumbnail || null,
          youtubeUrl: exercise.exercises?.youtube_url || null,
          exerciseOrder: exercise.exercise_order,
          sets: exercise.sets || 3,
          reps: exercise.reps || "10",
          tempo: exercise.tempo || "",
          restSeconds: exercise.rest_seconds || 60,
          rir: exercise.rir?.toString() || "",
          rpe: exercise.rpe_target?.toString() || "",
          notes: exercise.notes || "",
          groupingType: exercise.grouping_type || null,
          groupingId: exercise.grouping_id || null,
          selected: false,
        }));

        const loadedDraft = {
          workoutName: workout?.name || "",
          instructions: workout?.instructions || "",
          exercises: loadedExercises,
          useRpe: loadedExercises.some((exercise: WorkoutExercise) => Boolean(exercise.rpe)),
          useTempo: loadedExercises.some((exercise: WorkoutExercise) => Boolean(exercise.tempo)),
          useRir: loadedExercises.some((exercise: WorkoutExercise) => Boolean(exercise.rir)),
        };

        applyDraftState(loadedDraft);
        lastPersistedSnapshotRef.current = JSON.stringify({
          workoutName: loadedDraft.workoutName,
          instructions: loadedDraft.instructions,
          exercises: loadedExercises.map(({ selected, ...exercise }) => ({ ...exercise, selected: false })),
          useRpe: loadedDraft.useRpe,
          useTempo: loadedDraft.useTempo,
          useRir: loadedDraft.useRir,
        });
      } catch (error: any) {
        console.error("[WorkoutBuilder] Failed to hydrate builder:", error);
        toast({ title: "Failed to load workout", description: error.message, variant: "destructive" });
      } finally {
        if (!cancelled) {
          hydratedRef.current = true;
          setLoading(false);
        }
      }
    };

    void hydrateBuilder();

    return () => {
      cancelled = true;
    };
  }, [open, editWorkoutId, draftKey, applyDraftState, toast]);

  useEffect(() => {
    if (!open || !hydratedRef.current) return;
    const timer = setTimeout(() => persistDraftToSession(), 250);
    return () => clearTimeout(timer);
  }, [open, workoutName, instructions, exercises, useRpe, useTempo, useRir, persistDraftToSession]);

  useEffect(() => {
    if (!open) return;

    const flushDraft = () => persistDraftToSession();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushDraft();
        if (editWorkoutId) void triggerAutoSave();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", flushDraft);
    window.addEventListener("beforeunload", flushDraft);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", flushDraft);
      window.removeEventListener("beforeunload", flushDraft);
    };
  }, [open, editWorkoutId, persistDraftToSession, triggerAutoSave]);

  useEffect(() => {
    if (!open || !editWorkoutId || !hydratedRef.current || loading) return;
    if (buildDraftSnapshot() === lastPersistedSnapshotRef.current) return;

    const timer = setTimeout(() => {
      void triggerAutoSave();
    }, 1200);

    return () => clearTimeout(timer);
  }, [open, editWorkoutId, loading, workoutName, instructions, exercises, useRpe, useTempo, useRir, buildDraftSnapshot, triggerAutoSave]);

  // Clear state only after a successful save/close — never on tab switch or focus loss.
  useEffect(() => {
    if (!open && savedSuccessfullyRef.current) {
      setWorkoutName(""); setInstructions(""); setExercises([]);
      setSearchQuery(""); setFilterMuscle("all"); setFilterEquipment("all");
      setUseRpe(false); setUseTempo(false); setUseRir(true); setSelectionMode(false);
      setPreviewExerciseIdx(null);
      savedSuccessfullyRef.current = false;
      hydratedRef.current = false;
      lastPersistedSnapshotRef.current = "";
      queuedAutoSaveRef.current = false;
      autoSaveInFlightRef.current = false;
      syncedDuringSessionRef.current = false;
      if (autoSaveStatusTimeoutRef.current) clearTimeout(autoSaveStatusTimeoutRef.current);
      setAutoSaveState("idle");
    }
  }, [open]);

  const handleDialogClose = useCallback(async () => {
    persistDraftToSession();

    if (editWorkoutId && workoutName.trim() && buildDraftSnapshot() !== lastPersistedSnapshotRef.current) {
      try {
        await persistExistingWorkoutChanges();
        setTransientAutoSaveState("saved");
      } catch (error) {
        console.error("[WorkoutBuilder] Final sync before close failed:", error);
        setTransientAutoSaveState("error");
      }
    }

    savedSuccessfullyRef.current = true;

    if (editWorkoutId && syncedDuringSessionRef.current) {
      try {
        await onSave(editWorkoutId, workoutName.trim() || workoutName || "Workout");
      } catch (error) {
        console.error("[WorkoutBuilder] Parent sync after autosave failed:", error);
      }
    }

    onClose();
  }, [persistDraftToSession, editWorkoutId, workoutName, buildDraftSnapshot, persistExistingWorkoutChanges, setTransientAutoSaveState, onSave, onClose]);

  const discardAndClose = () => {
    try { sessionStorage.removeItem(draftKey); } catch {}
    // Reset state immediately since user is intentionally discarding
    setWorkoutName(""); setInstructions(""); setExercises([]);
    setSearchQuery(""); setFilterMuscle("all"); setFilterEquipment("all");
    setUseRpe(false); setUseTempo(false); setUseRir(true); setSelectionMode(false);
    setPreviewExerciseIdx(null);
    savedSuccessfullyRef.current = true;
    onClose();
  };

  const filteredLibrary = libraryExercises.filter((ex) => {
    const matchSearch = !searchQuery || ex.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchMuscle = filterMuscle === "all" || ex.primary_muscle?.toLowerCase() === filterMuscle.toLowerCase();
    const matchEquip = filterEquipment === "all" || ex.equipment?.toLowerCase() === filterEquipment.toLowerCase();
    return matchSearch && matchMuscle && matchEquip;
  });

  const addExerciseFromLibrary = (ex: Exercise, atIndex?: number) => {
    const newEx: WorkoutExercise = {
      exerciseId: ex.id, exerciseName: ex.name, thumbnail: ex.youtube_thumbnail,
      youtubeUrl: ex.youtube_url || null,
      exerciseOrder: 0, sets: 3, reps: "10", tempo: "", restSeconds: 90,
      rir: "2", rpe: "", notes: "", groupingType: null, groupingId: null, selected: false,
    };
    setExercises(prev => {
      const newList = [...prev];
      if (atIndex !== undefined && atIndex >= 0) {
        newList.splice(atIndex, 0, newEx);
      } else {
        newList.push(newEx);
      }
      return newList.map((e, i) => ({ ...e, exerciseOrder: i + 1 }));
    });
  };

  const removeExercise = (idx: number) => {
    if (previewExerciseIdx === idx) setPreviewExerciseIdx(null);
    setExercises(prev => prev.filter((_, i) => i !== idx).map((e, i) => ({ ...e, exerciseOrder: i + 1 })));
  };

  const moveExercise = (idx: number, direction: "up" | "down") => {
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= exercises.length) return;
    const newExs = [...exercises];
    [newExs[idx], newExs[newIdx]] = [newExs[newIdx], newExs[idx]];
    setExercises(newExs.map((e, i) => ({ ...e, exerciseOrder: i + 1 })));
  };

  const updateExercise = (idx: number, field: keyof WorkoutExercise, value: any) => {
    const newExs = [...exercises];
    (newExs[idx] as any)[field] = value;
    setExercises(newExs);
  };

  const duplicateExercise = (idx: number) => {
    const source = exercises[idx];
    setExercises(prev => {
      const newList = [...prev];
      newList.splice(idx + 1, 0, { ...source, id: undefined, exerciseOrder: idx + 2, selected: false });
      return newList.map((e, i) => ({ ...e, exerciseOrder: i + 1 }));
    });
  };

  const toggleSelection = (idx: number) => {
    const newExs = [...exercises];
    newExs[idx].selected = !newExs[idx].selected;
    setExercises(newExs);
  };

  const selectedCount = exercises.filter(e => e.selected).length;

  const createGroup = (type: "superset" | "circuit") => {
    const groupId = `${type}_${Date.now()}`;
    const newExs = exercises.map(e => e.selected ? { ...e, groupingType: type, groupingId: groupId, selected: false } : e);
    setExercises(newExs);
    setSelectionMode(false);
    toast({ title: `${type === "superset" ? "Superset" : "Circuit"} created` });
  };

  const ungroupSelected = () => {
    const newExs = exercises.map(e => e.selected ? { ...e, groupingType: null, groupingId: null, selected: false } : e);
    setExercises(newExs);
    setSelectionMode(false);
    toast({ title: "Exercises ungrouped" });
  };

  const getGroupColor = (groupId: string | null) => {
    if (!groupId) return "";
    const hash = groupId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const colors = [
      "border-l-blue-500", "border-l-green-500", "border-l-amber-500",
      "border-l-purple-500", "border-l-pink-500", "border-l-cyan-500",
    ];
    return colors[hash % colors.length];
  };

  // ── Drag & Drop: Library → Workout ──
  const handleLibraryDragStart = (e: React.DragEvent, ex: Exercise) => {
    draggedExerciseRef.current = ex;
    draggedWorkoutIdx.current = null;
    setIsDraggingFromLibrary(true);
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/plain", ex.id);
  };

  // ── Drag & Drop: Reorder within workout ──
  const handleWorkoutDragStart = (e: React.DragEvent, idx: number) => {
    draggedWorkoutIdx.current = idx;
    draggedExerciseRef.current = null;
    setIsDraggingFromLibrary(false);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = isDraggingFromLibrary ? "copy" : "move";
    setDragOverIdx(idx);
  };

  const handleDropZoneDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = isDraggingFromLibrary ? "copy" : "move";
    setDragOverIdx(exercises.length);
  };

  const handleDrop = (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    setDragOverIdx(null);
    setIsDraggingFromLibrary(false);

    if (draggedExerciseRef.current) {
      // Library → Workout
      addExerciseFromLibrary(draggedExerciseRef.current, dropIdx);
      draggedExerciseRef.current = null;
      return;
    }

    if (draggedWorkoutIdx.current !== null) {
      // Reorder within workout
      const fromIdx = draggedWorkoutIdx.current;
      if (fromIdx === dropIdx) return;
      setExercises(prev => {
        const newList = [...prev];
        const [moved] = newList.splice(fromIdx, 1);
        const adjustedIdx = dropIdx > fromIdx ? dropIdx - 1 : dropIdx;
        newList.splice(adjustedIdx, 0, moved);
        return newList.map((e, i) => ({ ...e, exerciseOrder: i + 1 }));
      });
      draggedWorkoutIdx.current = null;
    }
  };

  const handleDragEnd = () => {
    setDragOverIdx(null);
    setIsDraggingFromLibrary(false);
    draggedExerciseRef.current = null;
    draggedWorkoutIdx.current = null;
  };

  // Save workout
  const handleSave = async () => {
    const trimmedName = workoutName.trim();
    if (!trimmedName) {
      toast({ title: "Workout name required", variant: "destructive" });
      return;
    }

    setSaving(true);

    try {
      let workoutId = editWorkoutId;

      if (editWorkoutId) {
        if (buildDraftSnapshot() !== lastPersistedSnapshotRef.current) {
          await persistExistingWorkoutChanges();
        }
      } else {
        const { data: newWorkout, error: workoutErr } = await supabase
          .from("workouts")
          .insert({
            coach_id: coachId,
            name: trimmedName,
            instructions: instructions || null,
            is_template: true,
            workout_type: "regular",
          })
          .select()
          .single();
        if (workoutErr) throw workoutErr;
        workoutId = newWorkout.id;

        if (exercises.length > 0) {
          const { data: insertedExercises, error: insertErr } = await supabase
            .from("workout_exercises")
            .insert(
              exercises.map((exercise, index) => ({
                workout_id: workoutId,
                exercise_id: exercise.exerciseId,
                exercise_order: index + 1,
                sets: exercise.sets,
                reps: exercise.reps || null,
                tempo: useTempo ? (exercise.tempo || null) : null,
                rest_seconds: exercise.restSeconds || null,
                rir: useRir ? (exercise.rir ? parseInt(exercise.rir, 10) : null) : null,
                rpe_target: useRpe ? (exercise.rpe ? parseFloat(exercise.rpe) : null) : null,
                notes: exercise.notes || null,
                superset_group: null,
                grouping_type: exercise.groupingType || null,
                grouping_id: exercise.groupingId || null,
              }))
            )
            .select("id");
          if (insertErr) throw insertErr;

          const setRows = (insertedExercises || []).flatMap((workoutExercise, index) => {
            const exercise = exercises[index];
            return Array.from({ length: exercise.sets }, (_, setIndex) => ({
              workout_exercise_id: workoutExercise.id,
              set_number: setIndex + 1,
              rep_target: exercise.reps || null,
              rpe_target: useRpe ? (exercise.rpe ? parseFloat(exercise.rpe) : null) : null,
              set_type: "working",
            }));
          });

          if (setRows.length > 0) {
            const { error: setErr } = await supabase.from("workout_sets").insert(setRows);
            if (setErr) throw setErr;
          }
        }
      }

      try { sessionStorage.removeItem(draftKey); } catch {}
      savedSuccessfullyRef.current = true;
      setTransientAutoSaveState("saved");
      await onSave(workoutId!, trimmedName);
      toast({ title: editWorkoutId ? "Workout updated" : "Workout created" });
    } catch (err: any) {
      console.error("[WorkoutBuilder] Save failed:", err);
      toast({ title: "Failed to save workout — please try again.", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const estMinutes = estimateWorkoutMinutes(exercises);
  const previewEx = previewExerciseIdx !== null ? exercises[previewExerciseIdx] : null;
  const previewEmbedUrl = previewEx ? getYouTubeEmbedUrl(previewEx.youtubeUrl) : null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) void handleDialogClose(); }}>
      <DialogContent className="max-w-6xl h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-3 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-base">{editWorkoutId ? "Edit Workout" : "Build Workout"}</DialogTitle>
              <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground min-h-4">
                {exercises.length > 0 && (
                  <>
                    <span className="flex items-center gap-1"><Dumbbell className="h-3 w-3" /> {exercises.length} exercise{exercises.length !== 1 ? "s" : ""}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Est. {estMinutes} min</span>
                  </>
                )}
                {editWorkoutId && autoSaveState !== "idle" && (
                  <span className={autoSaveState === "error" ? "text-destructive" : "text-muted-foreground"}>
                    {autoSaveState === "saving" && "Autosaving..."}
                    {autoSaveState === "saved" && "All changes saved"}
                    {autoSaveState === "error" && "Autosave failed — draft kept locally"}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Switch checked={useRpe} onCheckedChange={setUseRpe} className="scale-75" />
                <span>RPE</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Switch checked={useTempo} onCheckedChange={setUseTempo} className="scale-75" />
                <span>Tempo</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Switch checked={useRir} onCheckedChange={(checked) => {
                  setUseRir(checked);
                  if (!checked) {
                    // Clear all RIR values when toggled off
                    setExercises(prev => prev.map(e => ({ ...e, rir: "" })));
                  }
                }} className="scale-75" />
                <span>RIR</span>
              </div>
              <Button variant="ghost" size="sm" onClick={discardAndClose} className="text-destructive hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Discard
              </Button>
              <Button onClick={handleSave} disabled={saving || !workoutName.trim()} size="sm">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                Save
              </Button>
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* Left Panel — Workout Structure */}
            <div className="flex-1 flex flex-col border-r overflow-hidden">
              <div className="p-4 space-y-3 border-b flex-shrink-0">
                <div className="space-y-1.5">
                  <Label className="text-xs">Workout Name</Label>
                  <Input value={workoutName} onChange={(e) => setWorkoutName(e.target.value)} placeholder="e.g. Upper Body Push A" className="h-9" autoFocus />
                  {scheduledCount > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      This workout is scheduled on {scheduledCount} upcoming calendar date{scheduledCount !== 1 ? "s" : ""}. Calendar labels will update automatically.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Instructions (optional)</Label>
                  <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Warm up notes, focus areas..." rows={2} className="text-xs resize-none" />
                </div>
              </div>

              {/* Grouping toolbar */}
              {exercises.length > 0 && (
                <div className="px-4 py-2 border-b flex items-center gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant={selectionMode ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => {
                      if (selectionMode) setExercises(exercises.map(e => ({ ...e, selected: false })));
                      setSelectionMode(!selectionMode);
                    }}
                  >
                    {selectionMode ? "Cancel" : "Select"}
                  </Button>
                  {selectionMode && selectedCount >= 2 && (
                    <>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => createGroup("superset")}>
                        <Link className="h-3 w-3" /> Superset
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => createGroup("circuit")}>
                        <Link className="h-3 w-3" /> Circuit
                      </Button>
                    </>
                  )}
                  {selectionMode && selectedCount > 0 && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={ungroupSelected}>
                      <Unlink className="h-3 w-3" /> Ungroup
                    </Button>
                  )}
                  {selectionMode && (
                    <span className="text-[10px] text-muted-foreground ml-auto">{selectedCount} selected</span>
                  )}
                </div>
              )}

              <ScrollArea className="flex-1">
                <div
                  className="p-4 space-y-1 min-h-full"
                  onDragOver={handleDropZoneDragOver}
                  onDrop={(e) => handleDrop(e, exercises.length)}
                  onDragLeave={() => setDragOverIdx(null)}
                >
                  {exercises.length === 0 ? (
                    <div className={`flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-lg transition-colors ${isDraggingFromLibrary ? "border-primary bg-primary/5" : "border-transparent"}`}>
                      <Dumbbell className="h-10 w-10 text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground">Drag exercises here from the library</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">Or click exercises on the right to add them.</p>
                    </div>
                  ) : (
                    exercises.map((ex, idx) => {
                      const isGroupStart = ex.groupingId && (idx === 0 || exercises[idx - 1].groupingId !== ex.groupingId);
                      const isGroupEnd = ex.groupingId && (idx === exercises.length - 1 || exercises[idx + 1].groupingId !== ex.groupingId);
                      const isInGroup = !!ex.groupingId;

                      return (
                        <div key={`${ex.exerciseId}-${idx}`}>
                          {/* Drop indicator */}
                          {dragOverIdx === idx && (
                            <div className="h-1 bg-primary rounded-full mx-2 mb-1 transition-all" />
                          )}
                          <div
                            draggable={!selectionMode}
                            onDragStart={(e) => handleWorkoutDragStart(e, idx)}
                            onDragOver={(e) => handleDragOver(e, idx)}
                            onDrop={(e) => { e.stopPropagation(); handleDrop(e, idx); }}
                            onDragEnd={handleDragEnd}
                            className={`border rounded-lg p-3 bg-card space-y-2 group transition-all duration-200 ${
                              isInGroup ? `border-l-4 ${getGroupColor(ex.groupingId)} ${isGroupStart ? "rounded-b-none" : ""} ${isGroupEnd ? "rounded-t-none" : ""} ${!isGroupStart && !isGroupEnd ? "rounded-none" : ""}` : ""
                            } ${ex.selected ? "ring-2 ring-primary bg-primary/5" : ""} ${highlightExerciseIdx === idx ? "ring-2 ring-primary bg-primary/10 animate-pulse" : ""}`}
                          >
                            {isGroupStart && (
                              <div className="flex items-center gap-1.5 -mt-1 mb-1">
                                <Badge variant="secondary" className="text-[9px] px-1.5">
                                  {ex.groupingType === "circuit" ? "Circuit" : "Superset"}
                                </Badge>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              {selectionMode && (
                                <Checkbox checked={ex.selected} onCheckedChange={() => toggleSelection(idx)} className="flex-shrink-0" />
                              )}
                              <GripVertical className="h-4 w-4 text-muted-foreground/30 flex-shrink-0 cursor-grab active:cursor-grabbing" />
                              <Badge variant="secondary" className="text-[10px] px-1.5 min-w-[24px] justify-center">{idx + 1}</Badge>
                              {ex.thumbnail ? (
                                <button onClick={() => setPreviewExerciseIdx(previewExerciseIdx === idx ? null : idx)} className="relative flex-shrink-0">
                                  <img src={ex.thumbnail} alt="" className="w-10 h-7 rounded object-cover bg-secondary" />
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded opacity-0 hover:opacity-100 transition-opacity">
                                    <Play className="h-3 w-3 text-white" />
                                  </div>
                                </button>
                              ) : (
                                <div className="w-10 h-7 rounded bg-secondary flex items-center justify-center flex-shrink-0">
                                  <Dumbbell className="h-3 w-3 text-muted-foreground" />
                                </div>
                              )}
                              <span className="text-sm font-medium flex-1 truncate">{ex.exerciseName}</span>
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                {idx > 0 && <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveExercise(idx, "up")}><ChevronUp className="h-3 w-3" /></Button>}
                                {idx < exercises.length - 1 && <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveExercise(idx, "down")}><ChevronDown className="h-3 w-3" /></Button>}
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => duplicateExercise(idx)} title="Duplicate"><Copy className="h-3 w-3" /></Button>
                                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeExercise(idx)}><Trash2 className="h-3 w-3" /></Button>
                              </div>
                            </div>

                            {/* Video Preview */}
                            {previewExerciseIdx === idx && previewEmbedUrl && (
                              <div className="relative rounded-md overflow-hidden bg-black aspect-video">
                                <iframe
                                  src={previewEmbedUrl}
                                  className="w-full h-full"
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                                  allowFullScreen
                                />
                                <button
                                  onClick={() => setPreviewExerciseIdx(null)}
                                  className="absolute top-2 right-2 bg-black/60 rounded-full p-1 hover:bg-black/80 transition-colors"
                                >
                                  <X className="h-3 w-3 text-white" />
                                </button>
                              </div>
                            )}

                            {/* Set controls */}
                            <div className={`grid gap-1.5`} style={{ gridTemplateColumns: `repeat(${3 + (useRpe ? 1 : 0) + (useTempo ? 1 : 0) + (useRir ? 1 : 0)}, minmax(0, 1fr))` }}>
                              <div className="space-y-0.5">
                                <Label className="text-[9px] text-muted-foreground">Sets</Label>
                                <Input type="number" value={ex.sets} onChange={(e) => updateExercise(idx, "sets", parseInt(e.target.value) || 0)} className="h-7 text-xs text-center" />
                              </div>
                              <div className="space-y-0.5">
                                <Label className="text-[9px] text-muted-foreground">Reps</Label>
                                <Input value={ex.reps} onChange={(e) => updateExercise(idx, "reps", e.target.value)} className="h-7 text-xs text-center" placeholder="8-12" />
                              </div>
                              {useRpe && (
                                <div className="space-y-0.5">
                                  <Label className="text-[9px] text-muted-foreground">RPE</Label>
                                  <Input value={ex.rpe} onChange={(e) => updateExercise(idx, "rpe", e.target.value)} className="h-7 text-xs text-center" placeholder="8" />
                                </div>
                              )}
                              {useTempo && (
                                <div className="space-y-0.5">
                                  <Label className="text-[9px] text-muted-foreground">Tempo</Label>
                                  <Input value={ex.tempo} onChange={(e) => updateExercise(idx, "tempo", e.target.value)} className="h-7 text-xs text-center" placeholder="3010" />
                                </div>
                              )}
                              <RestSecondsInput
                                value={ex.restSeconds}
                                onChange={(val) => updateExercise(idx, "restSeconds", val)}
                              />
                              {useRir && (
                                <div className="space-y-0.5">
                                  <Label className="text-[9px] text-muted-foreground">RIR</Label>
                                  <Input value={ex.rir} onChange={(e) => updateExercise(idx, "rir", e.target.value)} className="h-7 text-xs text-center" placeholder="2" />
                                </div>
                              )}
                            </div>

                            <div className="space-y-0.5">
                              <Label className="text-[9px] text-muted-foreground">Notes</Label>
                              <Input value={ex.notes} onChange={(e) => updateExercise(idx, "notes", e.target.value)} className="h-7 text-xs" placeholder="Client notes..." />
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  {/* Bottom drop zone indicator */}
                  {exercises.length > 0 && dragOverIdx === exercises.length && (
                    <div className="h-1 bg-primary rounded-full mx-2 mt-1" />
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Right Panel — Exercise Library */}
            <div className="w-[340px] flex flex-col overflow-hidden bg-muted/10">
              <div className="p-3 space-y-2 border-b flex-shrink-0">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Search exercises..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 h-8 text-xs" />
                </div>
                <div className="flex gap-2">
                  <Select value={filterMuscle} onValueChange={setFilterMuscle}>
                    <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Muscle" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Muscles</SelectItem>
                      {MUSCLE_GROUPS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filterEquipment} onValueChange={setFilterEquipment}>
                    <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Equipment" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Equipment</SelectItem>
                      {EQUIPMENT_OPTIONS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-8 text-xs text-primary hover:text-primary hover:bg-primary/10 justify-start gap-1.5"
                  onClick={() => setShowCustomExerciseModal(true)}
                >
                  <Plus className="h-3.5 w-3.5" /> Add Custom Exercise
                </Button>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {libraryLoading ? (
                    Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded" />)
                  ) : filteredLibrary.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">No exercises found.</p>
                  ) : (
                    filteredLibrary.map((ex) => (
                      <div
                        key={ex.id}
                        draggable
                        onDragStart={(e) => handleLibraryDragStart(e, ex)}
                        onDragEnd={handleDragEnd}
                        onClick={() => addExerciseFromLibrary(ex)}
                        className="w-full flex items-center gap-2.5 p-2 rounded-lg border border-transparent hover:border-primary/30 hover:bg-primary/5 transition-colors text-left cursor-grab active:cursor-grabbing"
                      >
                        {ex.youtube_thumbnail ? (
                          <img src={ex.youtube_thumbnail} alt="" className="w-10 h-7 rounded object-cover bg-secondary flex-shrink-0 pointer-events-none" />
                        ) : (
                          <div className="w-10 h-7 rounded bg-secondary flex items-center justify-center flex-shrink-0">
                            <Dumbbell className="h-3 w-3 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{ex.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{[ex.primary_muscle, ex.equipment].filter(Boolean).join(" · ")}</p>
                        </div>
                        <Plus className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        )}

        {/* Custom Exercise Modal */}
        <AddCustomExerciseModal
          open={showCustomExerciseModal}
          onClose={() => setShowCustomExerciseModal(false)}
          userId={coachId}
          onExerciseCreated={(newEx) => {
            const newIdx = exercises.length;
            setExercises(prev => [...prev, {
              exerciseId: newEx.id, exerciseName: newEx.name, thumbnail: newEx.youtube_thumbnail,
              youtubeUrl: null,
              exerciseOrder: prev.length + 1, sets: 3, reps: "10", tempo: "", restSeconds: 90,
              rir: "2", rpe: "", notes: "", groupingType: null, groupingId: null, selected: false,
            }]);
            loadLibrary();
            setHighlightExerciseIdx(newIdx);
            setTimeout(() => setHighlightExerciseIdx(null), 2000);
            toast({ title: "Exercise added to workout" });
          }}
        />
      </DialogContent>
    </Dialog>
  );
};

export default WorkoutBuilderModal;
