import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, Plus, Trash2, Copy, ChevronDown, ChevronRight, Dumbbell, Layers, GripVertical, ArrowUp, ArrowDown, Hammer, FileText, Check, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const WorkoutBuilderModal = lazy(() => import("./WorkoutBuilderModal"));

const GOAL_TYPES = [
  { label: "Hypertrophy", value: "hypertrophy" },
  { label: "Strength", value: "strength" },
  { label: "Fat Loss", value: "fat_loss" },
  { label: "Powerbuilding", value: "powerbuilding" },
  { label: "Athletic Performance", value: "athletic" },
  { label: "General Fitness", value: "general" },
  { label: "Recomp", value: "recomp" },
  { label: "Contest Prep", value: "prep" },
];

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

interface WeekWorkout {
  id?: string;
  workoutId: string;
  workoutName: string;
  dayOfWeek: number;
  dayLabel: string;
  sortOrder: number;
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
  workouts: WeekWorkout[];
  collapsed: boolean;
}

interface ProgramBuilderProps {
  onSave?: () => void;
  editProgramId?: string;
}

const ProgramBuilder = ({ onSave, editProgramId }: ProgramBuilderProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [goalType, setGoalType] = useState("hypertrophy");
  const [durationWeeks, setDurationWeeks] = useState<number | "">("");
  const [tags, setTags] = useState("");
  const [phases, setPhases] = useState<ProgramPhase[]>([
    {
      name: "Phase 1",
      description: "",
      phaseOrder: 1,
      durationWeeks: 4,
      trainingStyle: "hypertrophy",
      intensitySystem: "straight_sets",
      progressionRule: "add_weight",
      workouts: [],
      collapsed: false,
    },
  ]);
  const [availableWorkouts, setAvailableWorkouts] = useState<any[]>([]);
  const [showWorkoutPicker, setShowWorkoutPicker] = useState(false);
  const [_showAddChoice, _setShowAddChoice] = useState(false);
  const [showWorkoutBuilder, setShowWorkoutBuilder] = useState(false);
  const [targetPhaseIdx, setTargetPhaseIdx] = useState(0);

  // ── Autosave state ──
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autoSaveStatusTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveInFlightRef = useRef(false);
  const queuedAutoSaveRef = useRef(false);
  const lastPersistedSnapshotRef = useRef("");
  const hydratedRef = useRef(false);
  const draftKey = `program_draft_${editProgramId || "new"}_${user?.id || "anon"}`;
  const [showDraftResume, setShowDraftResume] = useState(false);
  const pendingDraftRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const loadWorkouts = async () => {
      const { data } = await supabase
        .from("workouts")
        .select("id, name, phase, description")
        .eq("coach_id", user.id)
        .eq("is_template", true)
        .order("name");
      setAvailableWorkouts(data || []);
    };
    loadWorkouts();
  }, [user]);

  useEffect(() => {
    if (!editProgramId || !user) return;
    const loadProgram = async () => {
      setLoadingData(true);
      const { data: program } = await supabase
        .from("programs")
        .select("*")
        .eq("id", editProgramId)
        .single();
      if (!program) { setLoadingData(false); return; }

      setName(program.name);
      setDescription(program.description || "");
      setGoalType(program.goal_type || "hypertrophy");
      setDurationWeeks((program as any).duration_weeks || "");
      setTags(((program as any).tags || []).join(", "));

      // Load phases
      const { data: phaseRows } = await supabase
        .from("program_phases")
        .select("*")
        .eq("program_id", editProgramId)
        .order("phase_order");

      if (phaseRows && phaseRows.length > 0) {
        const loadedPhases: ProgramPhase[] = [];

        for (const phase of phaseRows) {
          // Load workouts directly linked to phase
          const { data: directPWs } = await supabase
            .from("program_workouts")
            .select("id, workout_id, day_of_week, day_label, sort_order, workouts(name)")
            .eq("phase_id", phase.id)
            .order("sort_order");

          // Also check legacy week-based workouts
          const { data: weekRows } = await supabase
            .from("program_weeks")
            .select("id")
            .eq("program_id", editProgramId)
            .eq("phase_id", phase.id);

          let legacyWorkouts: WeekWorkout[] = [];
          if (weekRows && weekRows.length > 0) {
            const weekIds = weekRows.map(w => w.id);
            const { data: weekPWs } = await supabase
              .from("program_workouts")
              .select("id, workout_id, day_of_week, day_label, sort_order, workouts(name)")
              .in("week_id", weekIds)
              .order("sort_order");
            legacyWorkouts = (weekPWs || []).map((pw: any) => ({
              id: pw.id,
              workoutId: pw.workout_id,
              workoutName: (pw.workouts as any)?.name || "Workout",
              dayOfWeek: pw.day_of_week ?? 0,
              dayLabel: pw.day_label || DAY_LABELS[pw.day_of_week ?? 0],
              sortOrder: pw.sort_order ?? 0,
            }));
          }

          const phaseWorkouts: WeekWorkout[] = (directPWs || [])
            .filter((pw: any) => pw.workout_id) // filter out any with null workout_id
            .map((pw: any) => ({
              id: pw.id,
              workoutId: pw.workout_id,
              workoutName: (pw.workouts as any)?.name || "Workout",
              dayOfWeek: pw.day_of_week ?? 0,
              dayLabel: pw.day_label || DAY_LABELS[pw.day_of_week ?? 0],
              sortOrder: pw.sort_order ?? 0,
            }));

          // Merge: use direct workouts if any, otherwise fall back to legacy
          const allWorkouts = phaseWorkouts.length > 0 ? phaseWorkouts : legacyWorkouts;

          // Deduplicate by workout_id
          const seen = new Set<string>();
          const deduped = allWorkouts.filter(w => {
            const key = w.workoutId;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

          loadedPhases.push({
            id: phase.id,
            name: phase.name,
            description: phase.description || "",
            phaseOrder: phase.phase_order,
            durationWeeks: phase.duration_weeks,
            trainingStyle: phase.training_style || "hypertrophy",
            intensitySystem: phase.intensity_system || "straight_sets",
            progressionRule: phase.progression_rule || "add_weight",
            workouts: deduped,
            collapsed: false,
          });
        }

        setPhases(loadedPhases);
      } else {
        // Legacy: load weeks without phases
        const { data: weekRows } = await supabase
          .from("program_weeks")
          .select("id, week_number, name")
          .eq("program_id", editProgramId)
          .order("week_number");

        if (weekRows && weekRows.length > 0) {
          const weekIds = weekRows.map(w => w.id);
          const { data: pwRows } = await supabase
            .from("program_workouts")
            .select("id, week_id, workout_id, day_of_week, day_label, sort_order, workouts(name)")
            .in("week_id", weekIds)
            .order("sort_order");

          // Flatten all week workouts into a single phase
          const allWorkouts: WeekWorkout[] = (pwRows || []).map((pw: any) => ({
            id: pw.id,
            workoutId: pw.workout_id,
            workoutName: (pw.workouts as any)?.name || "Workout",
            dayOfWeek: pw.day_of_week ?? 0,
            dayLabel: pw.day_label || DAY_LABELS[pw.day_of_week ?? 0],
            sortOrder: pw.sort_order ?? 0,
          }));

          // Deduplicate
          const seen = new Set<string>();
          const deduped = allWorkouts.filter(w => {
            if (seen.has(w.workoutId)) return false;
            seen.add(w.workoutId);
            return true;
          });

          setPhases([{
            name: "Phase 1",
            description: "",
            phaseOrder: 1,
            durationWeeks: weekRows.length,
            trainingStyle: "hypertrophy",
            intensitySystem: "straight_sets",
            progressionRule: "add_weight",
            workouts: deduped,
            collapsed: false,
          }]);
        }
      }
      setLoadingData(false);
    };
    loadProgram();
  }, [editProgramId, user]);

  // ── Build snapshot for draft/autosave comparison ──
  const buildSnapshot = useCallback(() => JSON.stringify({
    name, description, goalType, tags, phases: phases.map(p => ({ ...p, collapsed: false })),
  }), [name, description, goalType, tags, phases]);

  // ── Draft restore for NEW programs ──
  useEffect(() => {
    if (editProgramId || !user) return;
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw);
        const ts = draft._ts || 0;
        if (Date.now() - ts > 86400000) {
          sessionStorage.removeItem(draftKey);
          return;
        }
        pendingDraftRef.current = raw;
        setShowDraftResume(true);
      }
    } catch { /* ignore parse errors */ }
  }, [editProgramId, user, draftKey]);

  const resumeDraft = () => {
    if (!pendingDraftRef.current) return;
    try {
      const draft = JSON.parse(pendingDraftRef.current);
      setName(draft.name || "");
      setDescription(draft.description || "");
      setGoalType(draft.goalType || "hypertrophy");
      setTags(draft.tags || "");
      if (Array.isArray(draft.phases) && draft.phases.length > 0) setPhases(draft.phases);
    } catch { /* ignore */ }
    setShowDraftResume(false);
    pendingDraftRef.current = null;
  };

  const discardDraft = () => {
    sessionStorage.removeItem(draftKey);
    setShowDraftResume(false);
    pendingDraftRef.current = null;
  };

  // ── sessionStorage draft persistence for NEW programs (debounced 500ms) ──
  useEffect(() => {
    if (editProgramId) return;
    const timer = setTimeout(() => {
      const hasContent = name.trim() || description.trim() || phases.some(p => p.workouts.length > 0);
      if (hasContent) {
        try {
          const snapshot = buildSnapshot();
          const withTimestamp = JSON.parse(snapshot);
          withTimestamp._ts = Date.now();
          sessionStorage.setItem(draftKey, JSON.stringify(withTimestamp));
        } catch { /* ignore quota errors */ }
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [name, description, goalType, tags, phases, editProgramId, draftKey, buildSnapshot]);

  // ── DB autosave for EDIT mode (debounced 2000ms) ──
  const setTransientAutoSaveState = useCallback((state: "idle" | "saving" | "saved" | "error") => {
    if (autoSaveStatusTimeout.current) clearTimeout(autoSaveStatusTimeout.current);
    setAutoSaveStatus(state);
    if (state === "saved") {
      autoSaveStatusTimeout.current = setTimeout(() => setAutoSaveStatus("idle"), 1800);
    }
  }, []);

  const triggerAutoSave = useCallback(async () => {
    if (!editProgramId || !user || loading || loadingData) return;
    if (!name.trim()) return;

    const snapshot = buildSnapshot();
    if (snapshot === lastPersistedSnapshotRef.current) return;

    if (autoSaveInFlightRef.current) {
      queuedAutoSaveRef.current = true;
      return;
    }

    autoSaveInFlightRef.current = true;
    setTransientAutoSaveState("saving");

    try {
      const parsedTags = tags.split(",").map(t => t.trim()).filter(Boolean);
      const totalWeeks = phases.reduce((s, p) => s + p.durationWeeks, 0);

      const { error } = await supabase.from("programs").update({
        name: name.trim(),
        description: description || null,
        goal_type: goalType,
        tags: parsedTags,
        duration_weeks: totalWeeks,
      } as any).eq("id", editProgramId);
      if (error) throw error;

      // Delete old phases (cascades)
      await supabase.from("program_phases").delete().eq("program_id", editProgramId);
      await supabase.from("program_weeks").delete().eq("program_id", editProgramId);

      // Re-insert phases with workouts linked directly to phase_id
      for (const phase of phases) {
        const { data: phaseRow, error: phaseErr } = await supabase
          .from("program_phases")
          .insert({
            program_id: editProgramId,
            name: phase.name,
            description: phase.description || null,
            phase_order: phase.phaseOrder,
            duration_weeks: phase.durationWeeks,
            training_style: phase.trainingStyle,
            intensity_system: phase.intensitySystem,
            progression_rule: phase.progressionRule,
          })
          .select().single();
        if (phaseErr) throw phaseErr;

        if (phase.workouts.length > 0) {
          await supabase.from("program_workouts").insert(
            phase.workouts.map((w, i) => ({
              phase_id: phaseRow.id,
              workout_id: w.workoutId,
              day_of_week: w.dayOfWeek,
              day_label: w.dayLabel,
              sort_order: i,
              week_id: null as any,
            }))
          );
        }
      }

      lastPersistedSnapshotRef.current = snapshot;
      setTransientAutoSaveState("saved");
    } catch (err) {
      console.error("[ProgramBuilder] Autosave failed:", err);
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
  }, [editProgramId, user, loading, loadingData, name, description, goalType, tags, phases, buildSnapshot, setTransientAutoSaveState]);

  // Debounced autosave trigger for edit mode
  useEffect(() => {
    if (!editProgramId || loadingData) return;
    if (!hydratedRef.current) { hydratedRef.current = true; lastPersistedSnapshotRef.current = buildSnapshot(); return; }
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => { void triggerAutoSave(); }, 2000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [name, description, goalType, tags, phases, editProgramId, loadingData, triggerAutoSave, buildSnapshot]);

  // Flush on visibilitychange / pagehide
  useEffect(() => {
    const flush = () => {
      if (editProgramId) {
        if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null; }
        void triggerAutoSave();
      } else {
        const hasContent = name.trim() || description.trim() || phases.some(p => p.workouts.length > 0);
        if (hasContent) {
          try {
            const snapshot = JSON.parse(buildSnapshot());
            snapshot._ts = Date.now();
            sessionStorage.setItem(draftKey, JSON.stringify(snapshot));
          } catch { /* ignore */ }
        }
      }
    };
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [editProgramId, triggerAutoSave, name, description, phases, buildSnapshot, draftKey]);

  // Phase operations
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
      ...source,
      id: undefined,
      name: `${source.name} (Copy)`,
      phaseOrder: phases.length + 1,
      workouts: source.workouts.map(w => ({ ...w, id: undefined })),
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

  // Workout operations — flat under phase
  const openWorkoutPicker = (phaseIdx: number) => {
    setTargetPhaseIdx(phaseIdx);
    setShowWorkoutBuilder(true);
  };

  const handleWorkoutBuilderSave = (workoutId: string, workoutName: string) => {
    const newPhases = [...phases];
    const existingCount = newPhases[targetPhaseIdx].workouts.length;
    newPhases[targetPhaseIdx].workouts.push({
      workoutId,
      workoutName,
      dayOfWeek: Math.min(existingCount, 6),
      dayLabel: DAY_LABELS[Math.min(existingCount, 6)],
      sortOrder: existingCount,
    });
    setPhases(newPhases);
    setShowWorkoutBuilder(false);
  };

  const addWorkoutToPhase = (workout: any) => {
    const newPhases = [...phases];
    const existingCount = newPhases[targetPhaseIdx].workouts.length;
    newPhases[targetPhaseIdx].workouts.push({
      workoutId: workout.id,
      workoutName: workout.name,
      dayOfWeek: Math.min(existingCount, 6),
      dayLabel: DAY_LABELS[Math.min(existingCount, 6)],
      sortOrder: existingCount,
    });
    setPhases(newPhases);
    setShowWorkoutPicker(false);
  };

  const removeWorkoutFromPhase = (phaseIdx: number, workoutIdx: number) => {
    const newPhases = [...phases];
    newPhases[phaseIdx].workouts.splice(workoutIdx, 1);
    setPhases(newPhases);
  };

  const updateWorkoutDay = (phaseIdx: number, workoutIdx: number, dayOfWeek: number) => {
    const newPhases = [...phases];
    newPhases[phaseIdx].workouts[workoutIdx].dayOfWeek = dayOfWeek;
    newPhases[phaseIdx].workouts[workoutIdx].dayLabel = DAY_LABELS[dayOfWeek];
    setPhases(newPhases);
  };

  const saveProgram = async () => {
    if (!user || !name) {
      toast({ title: "Program name is required", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const parsedTags = tags.split(",").map(t => t.trim()).filter(Boolean);
      const totalWeeks = phases.reduce((s, p) => s + p.durationWeeks, 0);
      let programId = editProgramId;

      if (editProgramId) {
        const { error } = await supabase.from("programs").update({
          name,
          description: description || null,
          goal_type: goalType,
          tags: parsedTags,
          duration_weeks: totalWeeks,
        } as any).eq("id", editProgramId);
        if (error) throw error;

        await supabase.from("program_phases").delete().eq("program_id", editProgramId);
        await supabase.from("program_weeks").delete().eq("program_id", editProgramId);
      } else {
        const { data, error } = await supabase.from("programs").insert({
          coach_id: user.id,
          name,
          description: description || null,
          goal_type: goalType,
          is_template: true,
          tags: parsedTags,
          duration_weeks: totalWeeks,
        } as any).select().single();
        if (error) throw error;
        programId = data.id;
      }

      // Insert phases with workouts linked directly to phase_id (no weeks)
      for (const phase of phases) {
        const { data: phaseRow, error: phaseErr } = await supabase
          .from("program_phases")
          .insert({
            program_id: programId!,
            name: phase.name,
            description: phase.description || null,
            phase_order: phase.phaseOrder,
            duration_weeks: phase.durationWeeks,
            training_style: phase.trainingStyle,
            intensity_system: phase.intensitySystem,
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
              week_id: null as any,
            }))
          );
          if (pwErr) throw pwErr;
        }
      }

      toast({ title: editProgramId ? "Program updated" : "Program created" });
      sessionStorage.removeItem(draftKey);
      lastPersistedSnapshotRef.current = buildSnapshot();
      onSave?.();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (loadingData) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Draft Resume Prompt */}
      {showDraftResume && (
        <div className="flex items-center justify-between p-3 bg-primary/10 border border-primary/30 rounded-lg">
          <span className="text-sm text-foreground">You have an unsaved draft. Resume where you left off?</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={discardDraft}>Discard</Button>
            <Button size="sm" className="h-7 text-xs" onClick={resumeDraft}>Resume Draft</Button>
          </div>
        </div>
      )}

      {/* Autosave status for edit mode */}
      {editProgramId && autoSaveStatus !== "idle" && (
        <div className="flex items-center justify-end gap-1.5">
          {autoSaveStatus === "saving" && (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5 animate-pulse">
              <Loader2 className="h-3 w-3 animate-spin" /> Saving...
            </span>
          )}
          {autoSaveStatus === "saved" && (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5 animate-in fade-in duration-300">
              <Check className="h-3 w-3 text-green-500" /> Saved
            </span>
          )}
          {autoSaveStatus === "error" && (
            <span className="text-xs text-destructive flex items-center gap-1.5">
              <AlertCircle className="h-3 w-3" /> Save failed
            </span>
          )}
        </div>
      )}

      {/* Program Details */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Program Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Program Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="16-Week Hypertrophy" />
            </div>
            <div className="space-y-2">
              <Label>Goal Type</Label>
              <Select value={goalType} onValueChange={setGoalType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GOAL_TYPES.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Program overview..." rows={2} />
          </div>
          <div className="space-y-2">
            <Label>Tags (comma-separated)</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="fat loss, beginner, 4-day split" />
          </div>
        </CardContent>
      </Card>

      {/* Phases */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            Program Phases
          </h3>
          <Button size="sm" variant="outline" onClick={addPhase}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Phase
          </Button>
        </div>

        {phases.map((phase, phaseIdx) => (
          <Card key={phaseIdx} className="border-l-4 border-l-primary/40">
            <Collapsible open={!phase.collapsed} onOpenChange={(open) => updatePhase(phaseIdx, { collapsed: !open })}>
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2">
                    {phase.collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    <h4 className="font-semibold text-sm">{phase.name}</h4>
                    <Badge variant="secondary" className="text-[10px]">{phase.trainingStyle}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {phase.durationWeeks} week{phase.durationWeeks !== 1 ? "s" : ""} · {phase.workouts.length} workout{phase.workouts.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {phaseIdx > 0 && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => movePhase(phaseIdx, "up")} title="Move up">
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {phaseIdx < phases.length - 1 && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => movePhase(phaseIdx, "down")} title="Move down">
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => duplicatePhase(phaseIdx)} title="Duplicate phase">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    {phases.length > 1 && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removePhase(phaseIdx)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <CardContent className="pt-0 space-y-4">
                  {/* Phase Settings */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 border rounded-lg bg-muted/20">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Phase Name</Label>
                      <Input
                        value={phase.name}
                        onChange={(e) => updatePhase(phaseIdx, { name: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Training Style</Label>
                      <Select value={phase.trainingStyle} onValueChange={(v) => updatePhase(phaseIdx, { trainingStyle: v })}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TRAINING_STYLES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Duration (weeks)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={52}
                        value={phase.durationWeeks}
                        onChange={(e) => updatePhase(phaseIdx, { durationWeeks: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Intensity System</Label>
                      <Select value={phase.intensitySystem} onValueChange={(v) => updatePhase(phaseIdx, { intensitySystem: v })}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {INTENSITY_SYSTEMS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Description</Label>
                      <Input
                        value={phase.description}
                        onChange={(e) => updatePhase(phaseIdx, { description: e.target.value })}
                        className="h-8 text-sm"
                        placeholder="Phase focus and notes..."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Progression Rule</Label>
                      <Select value={phase.progressionRule} onValueChange={(v) => updatePhase(phaseIdx, { progressionRule: v })}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PROGRESSION_RULES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Workouts flat list */}
                  <div className="space-y-2">
                    {phase.workouts.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground text-center py-3">
                        No workouts assigned.
                      </p>
                    ) : (
                      phase.workouts.map((pw, pwIdx) => (
                        <div key={pwIdx} className="flex items-center gap-2 p-2 border rounded-md bg-background">
                          <Dumbbell className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-xs font-medium flex-1 truncate">{pw.workoutName}</span>
                          <Select
                            value={String(pw.dayOfWeek)}
                            onValueChange={(v) => updateWorkoutDay(phaseIdx, pwIdx, parseInt(v))}
                          >
                            <SelectTrigger className="w-28 h-7 text-[11px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {DAY_LABELS.map((day, i) => (
                                <SelectItem key={i} value={String(i)}>{day}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive flex-shrink-0" onClick={() => removeWorkoutFromPhase(phaseIdx, pwIdx)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => openWorkoutPicker(phaseIdx)}>
                        <Plus className="h-3 w-3 mr-1" /> Build Workout
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setTargetPhaseIdx(phaseIdx); setShowWorkoutPicker(true); }}>
                        <FileText className="h-3 w-3 mr-1" /> Import
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        ))}
      </div>

      {/* Summary bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/30 rounded-lg border">
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>{phases.length} phase{phases.length !== 1 ? "s" : ""}</span>
          <span>{phases.reduce((s, p) => s + p.durationWeeks, 0)} total weeks</span>
          <span>{phases.reduce((s, p) => s + p.workouts.length, 0)} workouts</span>
        </div>
      </div>

      {/* Save */}
      <Button onClick={saveProgram} disabled={loading || !name} className="w-full" size="lg">
        {loading && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
        {editProgramId ? "Update Program" : "Create Program"}
      </Button>

      {/* Workout Template Picker */}
      <Dialog open={showWorkoutPicker} onOpenChange={setShowWorkoutPicker}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Select Workout Template</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {availableWorkouts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No workout templates found. Create workouts first.
              </p>
            ) : (
              availableWorkouts.map((w) => (
                <button
                  key={w.id}
                  onClick={() => addWorkoutToPhase(w)}
                  className="w-full text-left p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <p className="font-medium text-sm">{w.name}</p>
                  {w.phase && <p className="text-xs text-muted-foreground">{w.phase}</p>}
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Full Workout Builder Modal */}
      {user && (
        <Suspense fallback={null}>
          <WorkoutBuilderModal
            open={showWorkoutBuilder}
            onClose={() => setShowWorkoutBuilder(false)}
            onSave={handleWorkoutBuilderSave}
            coachId={user.id}
          />
        </Suspense>
      )}
    </div>
  );
};

export default ProgramBuilder;
