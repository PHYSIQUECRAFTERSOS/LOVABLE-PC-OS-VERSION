import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  Dumbbell, Save, Loader2, GripVertical, X, ChevronUp, ChevronDown,
  Link, Unlink, Trash2, Plus, Pencil, Check, Timer,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import MobileExercisePickerSheet from "./MobileExercisePickerSheet";
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface WorkoutExercise {
  id?: string;
  /** Stable client-side id used for drag-and-drop tracking. Survives saves. */
  dndId: string;
  exerciseId: string;
  exerciseName: string;
  thumbnail: string | null;
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

interface MobileWorkoutEditorProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  workoutId: string;
  workoutName: string;
  clientId: string;
}

const MobileWorkoutEditor = ({ open, onClose, onSaved, workoutId, workoutName: initialName, clientId }: MobileWorkoutEditorProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [workoutName, setWorkoutName] = useState(initialName);
  const [instructions, setInstructions] = useState("");
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const [showInstructions, setShowInstructions] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Toolbar modes
  const [toolbarMode, setToolbarMode] = useState<"default" | "superset" | "delete">("default");

  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const initialStateRef = useRef<string>("");
  const savedSuccessfullyRef = useRef(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Editing exercise inline
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  // ── Autosave state ──
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autoSaveStatusTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveInFlightRef = useRef(false);
  const queuedAutoSaveRef = useRef(false);
  const lastPersistedSnapshotRef = useRef("");

  useEffect(() => {
    if (!workoutId || !open) return;
    const load = async () => {
      setLoading(true);
      const { data: workout } = await supabase.from("workouts").select("name, instructions").eq("id", workoutId).single();
      if (workout) { setWorkoutName(workout.name); setInstructions(workout.instructions || ""); }

      const { data: exRows } = await supabase.from("workout_exercises")
        .select("id, exercise_id, exercise_order, sets, reps, tempo, rest_seconds, rir, notes, rpe_target, grouping_type, grouping_id, exercises(name, youtube_thumbnail)")
        .eq("workout_id", workoutId).order("exercise_order");

      if (exRows) {
        const loaded: WorkoutExercise[] = exRows.map((ex: any) => ({
          id: ex.id,
          dndId: ex.id || crypto.randomUUID(),
          exerciseId: ex.exercise_id, exerciseName: ex.exercises?.name || "Unknown",
          thumbnail: ex.exercises?.youtube_thumbnail || null, exerciseOrder: ex.exercise_order,
          sets: ex.sets || 3, reps: ex.reps || "10", tempo: ex.tempo || "", restSeconds: ex.rest_seconds || 60,
          rir: ex.rir?.toString() || "", rpe: ex.rpe_target?.toString() || "", notes: ex.notes || "",
          groupingType: (ex as any).grouping_type || null, groupingId: (ex as any).grouping_id || null, selected: false,
        }));
        setExercises(loaded);
        initialStateRef.current = JSON.stringify({ name: workout?.name, instructions: workout?.instructions || "", exercises: loaded });
      }
      setLoading(false);
      setHasChanges(false);
    };
    load();
  }, [workoutId, open]);

  // Reset on close after save
  useEffect(() => {
    if (!open && savedSuccessfullyRef.current) {
      setWorkoutName(""); setInstructions(""); setExercises([]);
      setToolbarMode("default"); setEditingIdx(null);
      setHasChanges(false);
      savedSuccessfullyRef.current = false;
    }
  }, [open]);

  // Track changes
  useEffect(() => {
    if (!initialStateRef.current || loading) return;
    const current = JSON.stringify({ name: workoutName, instructions, exercises: exercises.map(e => ({ ...e, selected: false })) });
    setHasChanges(current !== initialStateRef.current);
  }, [workoutName, instructions, exercises, loading]);

  // ── Autosave helpers ──
  const buildSnapshot = useCallback(() => JSON.stringify({
    name: workoutName, instructions, exercises: exercises.map(e => ({ ...e, selected: false })),
  }), [workoutName, instructions, exercises]);

  const setTransientAutoSaveState = useCallback((state: "idle" | "saving" | "saved" | "error") => {
    if (autoSaveStatusTimeout.current) clearTimeout(autoSaveStatusTimeout.current);
    setAutoSaveStatus(state);
    if (state === "saved") {
      autoSaveStatusTimeout.current = setTimeout(() => setAutoSaveStatus("idle"), 1800);
    }
  }, []);

  const persistWorkoutChanges = useCallback(async () => {
    if (!workoutName.trim()) return false;
    await supabase.from("workouts").update({ name: workoutName.trim(), instructions: instructions || null }).eq("id", workoutId);
    await supabase.from("workout_exercises").delete().eq("workout_id", workoutId);

    if (exercises.length > 0) {
      const { data: insertedExercises } = await supabase.from("workout_exercises").insert(
        exercises.map((ex, i) => ({
          workout_id: workoutId, exercise_id: ex.exerciseId, exercise_order: i + 1,
          sets: ex.sets, reps: ex.reps || null, tempo: ex.tempo || null,
          rest_seconds: ex.restSeconds || null, rir: ex.rir ? parseInt(ex.rir) : null,
          rpe_target: ex.rpe ? parseFloat(ex.rpe) : null,
          notes: ex.notes || null, grouping_type: ex.groupingType || null, grouping_id: ex.groupingId || null,
        }))
      ).select("id");

      if (insertedExercises) {
        const setRows: any[] = [];
        insertedExercises.forEach((we, idx) => {
          const ex = exercises[idx];
          for (let s = 1; s <= ex.sets; s++) {
            setRows.push({
              workout_exercise_id: we.id, set_number: s, rep_target: ex.reps || null,
              rpe_target: ex.rpe ? parseFloat(ex.rpe) : null, set_type: "working",
            });
          }
        });
        if (setRows.length > 0) await supabase.from("workout_sets").insert(setRows);
      }
    }
    return true;
  }, [workoutId, workoutName, instructions, exercises]);

  const triggerAutoSave = useCallback(async () => {
    if (!open || loading || saving) return;
    if (!workoutName.trim()) return;

    const snapshot = buildSnapshot();
    if (snapshot === lastPersistedSnapshotRef.current) return;

    if (autoSaveInFlightRef.current) {
      queuedAutoSaveRef.current = true;
      return;
    }

    autoSaveInFlightRef.current = true;
    setTransientAutoSaveState("saving");

    try {
      await persistWorkoutChanges();
      lastPersistedSnapshotRef.current = buildSnapshot();
      setTransientAutoSaveState("saved");
    } catch (err) {
      console.error("[MobileWorkoutEditor] Autosave failed:", err);
      setTransientAutoSaveState("error");
    } finally {
      autoSaveInFlightRef.current = false;
      if (queuedAutoSaveRef.current) {
        queuedAutoSaveRef.current = false;
        if (buildSnapshot() !== lastPersistedSnapshotRef.current) {
          void triggerAutoSave();
        }
      }
    }
  }, [open, loading, saving, workoutName, buildSnapshot, persistWorkoutChanges, setTransientAutoSaveState]);

  // Debounced autosave trigger (1200ms)
  useEffect(() => {
    if (!open || loading) return;
    if (!initialStateRef.current) return; // Not loaded yet
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => { void triggerAutoSave(); }, 1200);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [workoutName, instructions, exercises, open, loading, triggerAutoSave]);

  // Set initial persisted snapshot after load
  useEffect(() => {
    if (initialStateRef.current && !loading) {
      lastPersistedSnapshotRef.current = buildSnapshot();
    }
  }, [initialStateRef.current, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush on visibilitychange
  useEffect(() => {
    if (!open) return;
    const flush = () => {
      if (document.visibilityState === "hidden") {
        if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null; }
        void triggerAutoSave();
      }
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [open, triggerAutoSave]);

  const handleCancel = () => {
    if (hasChanges) setShowDiscardDialog(true);
    else onClose();
  };

  const discardAndClose = () => {
    savedSuccessfullyRef.current = true;
    onClose();
  };

  const selectedCount = exercises.filter(e => e.selected).length;

  const toggleSelection = (idx: number) => {
    const newExs = [...exercises];
    newExs[idx].selected = !newExs[idx].selected;
    setExercises(newExs);
  };

  const clearSelection = () => {
    setExercises(exercises.map(e => ({ ...e, selected: false })));
    setToolbarMode("default");
  };

  // Superset
  const createSuperset = () => {
    const groupId = `superset_${Date.now()}`;
    setExercises(exercises.map(e => e.selected ? { ...e, groupingType: "superset", groupingId: groupId, selected: false } : e));
    setToolbarMode("default");
    toast({ title: "Superset created" });
  };

  // Delete selected
  const deleteSelected = () => {
    setExercises(prev => prev.filter(e => !e.selected).map((e, i) => ({ ...e, exerciseOrder: i + 1 })));
    setToolbarMode("default");
  };

  // Move exercise
  const moveExercise = (idx: number, direction: "up" | "down") => {
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= exercises.length) return;
    const newExs = [...exercises];
    [newExs[idx], newExs[newIdx]] = [newExs[newIdx], newExs[idx]];
    setExercises(newExs.map((e, i) => ({ ...e, exerciseOrder: i + 1 })));
  };

  // ── Drag-and-drop ──
  // PointerSensor handles desktop; TouchSensor needs a long-press to
  // not break vertical scroll on mobile.
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setExercises((prev) => {
      const oldIdx = prev.findIndex((e) => e.dndId === active.id);
      const newIdx = prev.findIndex((e) => e.dndId === over.id);
      if (oldIdx < 0 || newIdx < 0) return prev;
      return arrayMove(prev, oldIdx, newIdx).map((e, i) => ({ ...e, exerciseOrder: i + 1 }));
    });
  };

  // Reset all rest timers to 0 (clean up legacy AI imports)
  const resetAllRests = () => {
    setExercises(prev => prev.map(e => ({ ...e, restSeconds: 0 })));
    toast({ title: "Rest timers reset", description: "All exercises set to 0s rest." });
  };

  const updateExercise = (idx: number, field: keyof WorkoutExercise, value: any) => {
    const newExs = [...exercises];
    (newExs[idx] as any)[field] = value;
    setExercises(newExs);
  };

  // Add exercises from picker
  const handleAddExercises = (exList: { id: string; name: string; youtube_thumbnail: string | null; primary_muscle: string | null; equipment: string | null }[]) => {
    setExercises(prev => {
      const newExs = [...prev];
      exList.forEach(ex => {
        newExs.push({
          dndId: crypto.randomUUID(),
          exerciseId: ex.id, exerciseName: ex.name, thumbnail: ex.youtube_thumbnail,
          exerciseOrder: newExs.length + 1, sets: 3, reps: "10", tempo: "", restSeconds: 120,
          rir: "", rpe: "", notes: "", groupingType: null, groupingId: null, selected: false,
        });
      });
      return newExs.map((e, i) => ({ ...e, exerciseOrder: i + 1 }));
    });
  };

  // Save — same logic as ClientWorkoutEditorModal
  const handleSave = async () => {
    if (!workoutName.trim()) { toast({ title: "Workout name required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await supabase.from("workouts").update({ name: workoutName, instructions: instructions || null }).eq("id", workoutId);
      await supabase.from("workout_exercises").delete().eq("workout_id", workoutId);

      if (exercises.length > 0) {
        const { data: insertedExercises } = await supabase.from("workout_exercises").insert(
          exercises.map((ex, i) => ({
            workout_id: workoutId, exercise_id: ex.exerciseId, exercise_order: i + 1,
            sets: ex.sets, reps: ex.reps || null, tempo: ex.tempo || null,
            rest_seconds: ex.restSeconds || null, rir: ex.rir ? parseInt(ex.rir) : null,
            rpe_target: ex.rpe ? parseFloat(ex.rpe) : null,
            notes: ex.notes || null, grouping_type: ex.groupingType || null, grouping_id: ex.groupingId || null,
          }))
        ).select("id");

        if (insertedExercises) {
          const setRows: any[] = [];
          insertedExercises.forEach((we, idx) => {
            const ex = exercises[idx];
            for (let s = 1; s <= ex.sets; s++) {
              setRows.push({
                workout_exercise_id: we.id, set_number: s, rep_target: ex.reps || null,
                rpe_target: ex.rpe ? parseFloat(ex.rpe) : null, set_type: "working",
              });
            }
          });
          if (setRows.length > 0) await supabase.from("workout_sets").insert(setRows);
        }
      }

      toast({ title: "Workout saved" });
      setHasChanges(false);
      savedSuccessfullyRef.current = true;
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  if (!open) return null;

  return (
    <>
      {/* Fullscreen overlay */}
      <div className="fixed inset-0 z-[60] bg-[hsl(var(--background))] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border safe-top">
          <button onClick={handleCancel} className="text-sm text-muted-foreground">Cancel</button>
          <div className="flex items-center gap-1.5 truncate max-w-[50%]">
            <span className="text-sm font-semibold text-foreground truncate">{workoutName || "Edit Workout"}</span>
            {autoSaveStatus === "saving" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
            {autoSaveStatus === "saved" && <Check className="h-3 w-3 text-green-500 shrink-0" />}
          </div>
          <button onClick={handleSave} disabled={saving} className="text-sm font-semibold text-primary disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pb-24">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-0">
              {/* Workout name input */}
              <div className="px-4 py-3 border-b border-border">
                <Input
                  value={workoutName}
                  onChange={(e) => setWorkoutName(e.target.value)}
                  placeholder="Workout Name"
                  className="h-10 font-semibold text-base bg-[hsl(var(--muted))] border-0"
                />
              </div>

              {/* Instructions bar */}
              <button
                onClick={() => setShowInstructions(!showInstructions)}
                className="w-full px-4 py-3 border-b border-border flex items-center justify-between text-left"
              >
                <span className="text-xs text-muted-foreground truncate flex-1">
                  {instructions ? instructions.slice(0, 60) + (instructions.length > 60 ? "..." : "") : "Add workout instructions..."}
                </span>
                <Pencil className="h-3.5 w-3.5 text-muted-foreground ml-2 shrink-0" />
              </button>

              {showInstructions && (
                <div className="px-4 py-3 border-b border-border">
                  <Textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="Workout instructions..."
                    rows={4}
                    className="text-xs resize-none"
                    autoFocus
                  />
                  <Button size="sm" variant="ghost" className="mt-2 h-7 text-xs" onClick={() => setShowInstructions(false)}>Done</Button>
                </div>
              )}

              {/* Exercise list */}
              {exercises.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                  <Dumbbell className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No exercises yet</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Tap Insert below to add exercises</p>
                </div>
              ) : (
                <DndContext
                  sensors={dndSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={exercises.map((e) => e.dndId)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="divide-y divide-border">
                      {exercises.map((ex, idx) => {
                        const isGroupStart = ex.groupingId && (idx === 0 || exercises[idx - 1].groupingId !== ex.groupingId);
                        const isSelectionMode = toolbarMode === "superset" || toolbarMode === "delete";
                        return (
                          <SortableMobileRow
                            key={ex.dndId}
                            ex={ex}
                            idx={idx}
                            total={exercises.length}
                            isGroupStart={!!isGroupStart}
                            isSelectionMode={isSelectionMode}
                            isEditing={editingIdx === idx}
                            onTap={() => {
                              if (isSelectionMode) toggleSelection(idx);
                              else setEditingIdx(editingIdx === idx ? null : idx);
                            }}
                            onMoveUp={() => moveExercise(idx, "up")}
                            onMoveDown={() => moveExercise(idx, "down")}
                            onUpdate={(field, value) => updateExercise(idx, field, value)}
                          />
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          )}
        </div>

        {/* Bottom toolbar */}
        <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-[hsl(var(--background))] px-4 py-3 safe-bottom z-[61]">
          {toolbarMode === "default" ? (
            <div className="flex items-center justify-around">
              <button
                onClick={() => { setToolbarMode("superset"); setEditingIdx(null); }}
                className="flex flex-col items-center gap-1 text-muted-foreground"
                disabled={exercises.length < 2}
              >
                <Link className="h-5 w-5" />
                <span className="text-[10px]">Superset</span>
              </button>
              <button
                onClick={resetAllRests}
                className="flex flex-col items-center gap-1 text-muted-foreground"
                disabled={exercises.length === 0}
                title="Reset all rest timers to 0s"
              >
                <Timer className="h-5 w-5" />
                <span className="text-[10px]">Rest 0s</span>
              </button>
              <button
                onClick={() => { setToolbarMode("delete"); setEditingIdx(null); }}
                className="flex flex-col items-center gap-1 text-muted-foreground"
                disabled={exercises.length === 0}
              >
                <Trash2 className="h-5 w-5" />
                <span className="text-[10px]">Delete</span>
              </button>
              <button
                onClick={() => setPickerOpen(true)}
                className="flex flex-col items-center gap-1 text-primary"
              >
                <Plus className="h-5 w-5" />
                <span className="text-[10px] font-medium">Insert</span>
              </button>
            </div>
          ) : toolbarMode === "superset" ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{selectedCount} selected — pick 2+ for superset</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={clearSelection}>Cancel</Button>
                <Button size="sm" className="h-8 text-xs" disabled={selectedCount < 2} onClick={createSuperset}>
                  <Link className="h-3.5 w-3.5 mr-1" /> Superset
                </Button>
              </div>
            </div>
          ) : toolbarMode === "delete" ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{selectedCount} selected</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={clearSelection}>Cancel</Button>
                <Button size="sm" variant="destructive" className="h-8 text-xs" disabled={selectedCount === 0}
                  onClick={() => setShowDeleteConfirm(true)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Exercise picker */}
      <MobileExercisePickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onAdd={handleAddExercises}
      />

      {/* Delete confirm */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedCount} exercise{selectedCount !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { deleteSelected(); setShowDeleteConfirm(false); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Discard confirm */}
      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>All unsaved changes will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowDiscardDialog(false); discardAndClose(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

// ── Sortable row used inside DndContext above ──
interface SortableMobileRowProps {
  ex: WorkoutExercise;
  idx: number;
  total: number;
  isGroupStart: boolean;
  isSelectionMode: boolean;
  isEditing: boolean;
  onTap: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUpdate: (field: keyof WorkoutExercise, value: any) => void;
}

const SortableMobileRow = ({
  ex, idx, total, isGroupStart, isSelectionMode, isEditing, onTap, onMoveUp, onMoveDown, onUpdate,
}: SortableMobileRowProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: ex.dndId });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  const isInGroup = !!ex.groupingId;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative bg-[hsl(var(--background))] ${isInGroup ? "border-l-2 border-l-primary ml-2" : ""}`}
    >
      {isGroupStart && (
        <div className="px-4 pt-2 pb-1">
          <Badge className="text-[9px] bg-primary/20 text-primary border-primary/30">
            {ex.groupingType === "superset" ? "Superset" : ex.groupingType}
          </Badge>
        </div>
      )}
      <div
        className={`flex items-center gap-3 px-4 py-3 ${ex.selected ? "bg-primary/10" : ""}`}
        onClick={onTap}
      >
        {isSelectionMode && (
          <Checkbox checked={ex.selected} className="shrink-0" />
        )}

        {/* Drag handle (long-press to drag on mobile) */}
        {!isSelectionMode && (
          <div
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className="touch-none flex-shrink-0 -ml-1 p-1 rounded cursor-grab active:cursor-grabbing"
            title="Long-press to drag"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground/60" />
          </div>
        )}

        {/* Thumbnail */}
        <div className="h-12 w-16 rounded-lg overflow-hidden bg-[hsl(var(--muted))] flex-shrink-0 flex items-center justify-center">
          {ex.thumbnail ? (
            <img src={ex.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <Dumbbell className="h-5 w-5 text-muted-foreground/50" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{ex.exerciseName}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className="text-[9px] h-4 border-primary/30 text-primary">
              {ex.sets} × {ex.reps || "—"}
            </Badge>
            {ex.restSeconds > 0 && (
              <span className="text-[10px] text-muted-foreground">{ex.restSeconds}s rest</span>
            )}
            {ex.rpe && <span className="text-[10px] text-muted-foreground">RPE {ex.rpe}</span>}
          </div>
        </div>

        {/* Reorder chevrons (fallback for fine adjustments) */}
        {!isSelectionMode && (
          <div className="flex flex-col gap-0.5 shrink-0">
            <button onClick={(e) => { e.stopPropagation(); onMoveUp(); }} disabled={idx === 0}
              className="p-1 rounded disabled:opacity-20">
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onMoveDown(); }} disabled={idx === total - 1}
              className="p-1 rounded disabled:opacity-20">
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        )}
      </div>

      {/* Inline edit row */}
      {isEditing && !isSelectionMode && (
        <div className="px-4 pb-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <span className="text-[10px] text-muted-foreground">Sets</span>
              <Input className="h-8 text-xs mt-0.5" type="number" value={ex.sets}
                onChange={(e) => onUpdate("sets", parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground">Reps</span>
              <Input className="h-8 text-xs mt-0.5" value={ex.reps}
                onChange={(e) => onUpdate("reps", e.target.value)} />
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground">Rest (s)</span>
              <Input className="h-8 text-xs mt-0.5" type="number" value={ex.restSeconds}
                onChange={(e) => onUpdate("restSeconds", parseInt(e.target.value) || 0)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <span className="text-[10px] text-muted-foreground">RPE</span>
              <Input className="h-8 text-xs mt-0.5" value={ex.rpe}
                onChange={(e) => onUpdate("rpe", e.target.value)} />
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground">RIR</span>
              <Input className="h-8 text-xs mt-0.5" value={ex.rir}
                onChange={(e) => onUpdate("rir", e.target.value)} />
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground">Tempo</span>
              <Input className="h-8 text-xs mt-0.5" value={ex.tempo} placeholder="3-1-2"
                onChange={(e) => onUpdate("tempo", e.target.value)} />
            </div>
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground">Notes</span>
            <Input className="h-8 text-xs mt-0.5" value={ex.notes} placeholder="Exercise notes..."
              onChange={(e) => onUpdate("notes", e.target.value)} />
          </div>
          {ex.groupingId && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => {
              onUpdate("groupingType", null);
              onUpdate("groupingId", null);
            }}>
              <Unlink className="h-3 w-3" /> Ungroup
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default MobileWorkoutEditor;
