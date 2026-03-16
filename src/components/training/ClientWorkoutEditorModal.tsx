import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, Search, Dumbbell, Trash2, Save, Loader2, GripVertical, X, ChevronUp, ChevronDown,
  Link, Unlink, Copy, Replace,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AddCustomExerciseModal from "./AddCustomExerciseModal";

const MUSCLE_GROUPS = [
  "Chest", "Back", "Shoulders", "Biceps", "Triceps", "Forearms",
  "Quads", "Hamstrings", "Glutes", "Calves", "Abs", "Obliques",
  "Traps", "Lats", "Rear Delts",
];

interface WorkoutExercise {
  id?: string;
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

interface Exercise {
  id: string;
  name: string;
  primary_muscle: string | null;
  equipment: string | null;
  youtube_thumbnail: string | null;
  tags: string[];
}

interface ClientWorkoutEditorModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  workoutId: string;
  workoutName: string;
  clientId: string;
}

const ClientWorkoutEditorModal = ({ open, onClose, onSaved, workoutId, workoutName: initialName, clientId }: ClientWorkoutEditorModalProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [workoutName, setWorkoutName] = useState(initialName);
  const [instructions, setInstructions] = useState("");
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scheduledCount, setScheduledCount] = useState(0);

  // Check future scheduled calendar events for this workout
  useEffect(() => {
    if (!workoutId || !open) { setScheduledCount(0); return; }
    supabase
      .from("calendar_events")
      .select("id", { count: "exact", head: true })
      .eq("linked_workout_id", workoutId)
      .eq("event_type", "workout")
      .gte("event_date", new Date().toISOString().slice(0, 10))
      .then(({ count }) => setScheduledCount(count ?? 0));
  }, [workoutId, open]);
  const [hasChanges, setHasChanges] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const initialStateRef = useRef<string>("");
  const savedSuccessfullyRef = useRef(false);

  const [useRpe, setUseRpe] = useState(false);
  const [useTempo, setUseTempo] = useState(false);

  const [libraryExercises, setLibraryExercises] = useState<Exercise[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMuscle, setFilterMuscle] = useState("all");

  const [selectionMode, setSelectionMode] = useState(false);
  const [showCustomExerciseModal, setShowCustomExerciseModal] = useState(false);

  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true);
    const { data } = await supabase.from("exercises")
      .select("id, name, primary_muscle, equipment, youtube_thumbnail, tags").order("name");
    setLibraryExercises((data as Exercise[]) || []);
    setLibraryLoading(false);
  }, []);

  useEffect(() => { if (open) loadLibrary(); }, [open, loadLibrary]);

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
        const loaded = exRows.map((ex: any) => ({
          id: ex.id, exerciseId: ex.exercise_id, exerciseName: ex.exercises?.name || "Unknown",
          thumbnail: ex.exercises?.youtube_thumbnail || null, exerciseOrder: ex.exercise_order,
          sets: ex.sets || 3, reps: ex.reps || "10", tempo: ex.tempo || "", restSeconds: ex.rest_seconds || 60,
          rir: ex.rir?.toString() || "", rpe: ex.rpe_target?.toString() || "", notes: ex.notes || "",
          groupingType: (ex as any).grouping_type || null, groupingId: (ex as any).grouping_id || null, selected: false,
        }));
        setExercises(loaded);
        if (loaded.some((e: WorkoutExercise) => e.rpe)) setUseRpe(true);
        if (loaded.some((e: WorkoutExercise) => e.tempo)) setUseTempo(true);
        initialStateRef.current = JSON.stringify({ name: workout?.name, instructions: workout?.instructions || "", exercises: loaded });
      }
      setLoading(false);
      setHasChanges(false);
    };
    load();
  }, [workoutId, open]);

  // Only reset state after a successful save — never on tab switch / focus loss
  useEffect(() => {
    if (!open && savedSuccessfullyRef.current) {
      setWorkoutName(""); setInstructions(""); setExercises([]);
      setSearchQuery(""); setFilterMuscle("all");
      setUseRpe(false); setUseTempo(false); setSelectionMode(false);
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

  const handleClose = () => {
    if (hasChanges) setShowDiscardDialog(true);
    else { discardAndClose(); }
  };

  const discardAndClose = () => {
    savedSuccessfullyRef.current = true; // allow the reset useEffect to fire
    onClose();
  };

  const filteredLibrary = libraryExercises.filter((ex) => {
    const matchSearch = !searchQuery || (() => {
      const name = ex.name.toLowerCase();
      const tokens = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
      return tokens.every(token => name.includes(token));
    })();
    const matchMuscle = filterMuscle === "all" || ex.primary_muscle === filterMuscle;
    return matchSearch && matchMuscle;
  });

  const addExercise = (ex: Exercise) => {
    setExercises(prev => [...prev, {
      exerciseId: ex.id, exerciseName: ex.name, thumbnail: ex.youtube_thumbnail,
      exerciseOrder: prev.length + 1, sets: 3, reps: "10", tempo: "", restSeconds: 60,
      rir: "", rpe: "", notes: "", groupingType: null, groupingId: null, selected: false,
    }]);
  };

  const removeExercise = (idx: number) => {
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
    setExercises(exercises.map(e => e.selected ? { ...e, groupingType: type, groupingId: groupId, selected: false } : e));
    setSelectionMode(false);
    toast({ title: `${type === "superset" ? "Superset" : "Circuit"} created` });
  };

  const ungroupSelected = () => {
    setExercises(exercises.map(e => e.selected ? { ...e, groupingType: null, groupingId: null, selected: false } : e));
    setSelectionMode(false);
  };

  const getGroupColor = (groupId: string | null) => {
    if (!groupId) return "";
    const hash = groupId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const colors = ["border-l-blue-500", "border-l-green-500", "border-l-amber-500", "border-l-purple-500", "border-l-pink-500", "border-l-cyan-500"];
    return colors[hash % colors.length];
  };

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
            sets: ex.sets, reps: ex.reps || null, tempo: useTempo ? (ex.tempo || null) : null,
            rest_seconds: ex.restSeconds || null, rir: ex.rir ? parseInt(ex.rir) : null,
            rpe_target: useRpe ? (ex.rpe ? parseFloat(ex.rpe) : null) : null,
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
                rpe_target: useRpe ? (ex.rpe ? parseFloat(ex.rpe) : null) : null, set_type: "working",
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

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-3 border-b flex-shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle>Edit Workout</DialogTitle>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Switch checked={useRpe} onCheckedChange={setUseRpe} className="scale-75" /><span>RPE</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Switch checked={useTempo} onCheckedChange={setUseTempo} className="scale-75" /><span>Tempo</span>
                </div>
                <Button onClick={handleSave} disabled={saving || !workoutName.trim()} size="sm">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                  Save
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          {loading ? (
            <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <div className="flex-1 flex overflow-hidden">
              {/* LEFT PANEL — Workout Structure */}
              <div className="flex-1 flex flex-col border-r overflow-hidden">
                <div className="p-4 space-y-3 border-b flex-shrink-0">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Workout Name</Label>
                    <Input value={workoutName} onChange={(e) => setWorkoutName(e.target.value)} placeholder="e.g. DAY 1: Chest Back Arms" className="h-9 font-semibold" autoFocus />
                    {scheduledCount > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        This workout is scheduled on {scheduledCount} upcoming calendar date{scheduledCount !== 1 ? "s" : ""}. Calendar labels will update automatically.
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Workout Instructions</Label>
                    <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)}
                      placeholder="AMRAP = As Many Reps As Possible&#10;Rest Pause Set — Set is taken to failure..." rows={3} className="text-xs resize-none" />
                  </div>
                </div>

                {/* Grouping toolbar */}
                {exercises.length > 0 && (
                  <div className="px-4 py-2 border-b flex items-center gap-2 flex-shrink-0">
                    <Button size="sm" variant={selectionMode ? "default" : "outline"} className="h-7 text-xs"
                      onClick={() => { if (selectionMode) setExercises(exercises.map(e => ({ ...e, selected: false }))); setSelectionMode(!selectionMode); }}>
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
                    {selectionMode && <span className="text-[10px] text-muted-foreground ml-auto">{selectedCount} selected</span>}
                  </div>
                )}

                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-1">
                    {exercises.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Dumbbell className="h-10 w-10 text-muted-foreground/30 mb-3" />
                        <p className="text-sm text-muted-foreground">No exercises yet.</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">Add exercises from the library →</p>
                      </div>
                    ) : exercises.map((ex, idx) => {
                      const isGroupStart = ex.groupingId && (idx === 0 || exercises[idx - 1].groupingId !== ex.groupingId);
                      const isGroupEnd = ex.groupingId && (idx === exercises.length - 1 || exercises[idx + 1].groupingId !== ex.groupingId);
                      const isInGroup = !!ex.groupingId;

                      return (
                        <div key={idx} className={`border rounded-lg p-3 bg-card space-y-2 group transition-all ${
                          isInGroup ? `border-l-4 ${getGroupColor(ex.groupingId)} ${isGroupStart ? "rounded-b-none" : ""} ${isGroupEnd ? "rounded-t-none" : ""} ${!isGroupStart && !isGroupEnd ? "rounded-none" : ""}` : ""
                        } ${ex.selected ? "ring-2 ring-primary bg-primary/5" : ""}`}>
                          {isGroupStart && (
                            <div className="flex items-center gap-1.5 -mt-1 mb-1">
                              <Badge variant="secondary" className="text-[9px] px-1.5">{ex.groupingType === "circuit" ? "Circuit" : "Superset"}</Badge>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            {selectionMode && <Checkbox checked={ex.selected} onCheckedChange={() => toggleSelection(idx)} className="flex-shrink-0" />}
                            <GripVertical className="h-4 w-4 text-muted-foreground/30 flex-shrink-0 cursor-grab" />
                            <Badge variant="secondary" className="text-[10px] px-1.5 min-w-[24px] justify-center">{idx + 1}</Badge>
                            {ex.thumbnail ? (
                              <img src={ex.thumbnail} alt="" className="w-10 h-7 rounded object-cover bg-secondary flex-shrink-0" />
                            ) : (
                              <div className="w-10 h-7 rounded bg-secondary flex items-center justify-center flex-shrink-0">
                                <Dumbbell className="h-3.5 w-3.5 text-muted-foreground" />
                              </div>
                            )}
                            <span className="text-xs font-medium flex-1 truncate">{ex.exerciseName}</span>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveExercise(idx, "up")} disabled={idx === 0}><ChevronUp className="h-3 w-3" /></Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveExercise(idx, "down")} disabled={idx === exercises.length - 1}><ChevronDown className="h-3 w-3" /></Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => duplicateExercise(idx)}><Copy className="h-3 w-3" /></Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeExercise(idx)}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          </div>
                          {/* Inline editing row */}
                          <div className="flex items-center gap-2 flex-wrap pl-8">
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-muted-foreground w-8">Sets</span>
                              <Input className="h-7 w-14 text-xs px-1.5" type="number" value={ex.sets}
                                onChange={(e) => updateExercise(idx, "sets", parseInt(e.target.value) || 0)} />
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-muted-foreground w-8">Reps</span>
                              <Input className="h-7 w-16 text-xs px-1.5" value={ex.reps}
                                onChange={(e) => updateExercise(idx, "reps", e.target.value)} />
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-muted-foreground w-8">Rest</span>
                              <Input className="h-7 w-14 text-xs px-1.5" type="number" value={ex.restSeconds}
                                onChange={(e) => updateExercise(idx, "restSeconds", parseInt(e.target.value) || 0)} />
                              <span className="text-[10px] text-muted-foreground">s</span>
                            </div>
                            {useTempo && (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-muted-foreground w-10">Tempo</span>
                                <Input className="h-7 w-16 text-xs px-1.5" value={ex.tempo}
                                  onChange={(e) => updateExercise(idx, "tempo", e.target.value)} placeholder="3-1-2" />
                              </div>
                            )}
                            {useRpe && (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-muted-foreground w-8">RPE</span>
                                <Input className="h-7 w-14 text-xs px-1.5" value={ex.rpe}
                                  onChange={(e) => updateExercise(idx, "rpe", e.target.value)} />
                              </div>
                            )}
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-muted-foreground w-8">RIR</span>
                              <Input className="h-7 w-14 text-xs px-1.5" value={ex.rir}
                                onChange={(e) => updateExercise(idx, "rir", e.target.value)} />
                            </div>
                          </div>
                          {/* Notes */}
                          <div className="pl-8">
                            <Input className="h-7 text-[10px] px-1.5" value={ex.notes}
                              onChange={(e) => updateExercise(idx, "notes", e.target.value)} placeholder="Notes..." />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>

              {/* RIGHT PANEL — Exercise Library */}
              <div className="w-80 flex flex-col overflow-hidden bg-muted/20">
                <div className="p-3 border-b space-y-2 flex-shrink-0">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input placeholder="Search exercises..." value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 h-9 text-xs" />
                  </div>
                  <div className="flex gap-2">
                    <Select value={filterMuscle} onValueChange={setFilterMuscle}>
                      <SelectTrigger className="h-7 text-[10px] flex-1"><SelectValue placeholder="Muscle" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Muscles</SelectItem>
                        {MUSCLE_GROUPS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" className="h-7 text-[10px] shrink-0" onClick={() => setShowCustomExerciseModal(true)}>
                      <Plus className="h-3 w-3 mr-1" /> Custom
                    </Button>
                  </div>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-2 space-y-0.5">
                    {libraryLoading ? (
                      <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                    ) : filteredLibrary.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-8">No exercises found</p>
                    ) : filteredLibrary.map(ex => (
                      <button key={ex.id} className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 text-left transition-colors"
                        onClick={() => addExercise(ex)}>
                        {ex.youtube_thumbnail ? (
                          <img src={ex.youtube_thumbnail} alt="" className="w-9 h-6 rounded object-cover bg-secondary flex-shrink-0" />
                        ) : (
                          <div className="w-9 h-6 rounded bg-secondary flex items-center justify-center flex-shrink-0">
                            <Dumbbell className="h-3 w-3 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium truncate">{ex.name}</p>
                          <p className="text-[9px] text-muted-foreground">{ex.primary_muscle || ""}{ex.equipment ? ` · ${ex.equipment}` : ""}</p>
                        </div>
                        <Plus className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Discard changes dialog */}
      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone. All unsaved changes will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowDiscardDialog(false); setHasChanges(false); discardAndClose(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddCustomExerciseModal
        open={showCustomExerciseModal}
        onClose={() => setShowCustomExerciseModal(false)}
        userId={user?.id || ""}
        onExerciseCreated={(newEx) => {
          addExercise({ id: newEx.id, name: newEx.name, primary_muscle: newEx.primary_muscle, equipment: newEx.equipment, youtube_thumbnail: newEx.youtube_thumbnail, tags: newEx.tags || [] });
          loadLibrary();
        }}
      />
    </>
  );
};

export default ClientWorkoutEditorModal;
