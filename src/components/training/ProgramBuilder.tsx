import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, Plus, Trash2, Copy, ChevronDown, ChevronRight, Dumbbell, Layers, GripVertical, ArrowUp, ArrowDown, Hammer, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import WorkoutBuilderModal from "./WorkoutBuilderModal";

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

interface ProgramWeek {
  id?: string;
  weekNumber: number;
  name: string;
  workouts: WeekWorkout[];
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
      weeks: [{ weekNumber: 1, name: "Week 1", workouts: [], collapsed: false }],
      collapsed: false,
    },
  ]);
  const [availableWorkouts, setAvailableWorkouts] = useState<any[]>([]);
  const [showWorkoutPicker, setShowWorkoutPicker] = useState(false);
  const [showAddChoice, setShowAddChoice] = useState(false);
  const [showWorkoutBuilder, setShowWorkoutBuilder] = useState(false);
  const [targetPhaseIdx, setTargetPhaseIdx] = useState(0);
  const [targetWeekIdx, setTargetWeekIdx] = useState(0);

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
          const { data: weekRows } = await supabase
            .from("program_weeks")
            .select("id, week_number, name")
            .eq("program_id", editProgramId)
            .eq("phase_id", phase.id)
            .order("week_number");

          const weeks: ProgramWeek[] = [];
          if (weekRows) {
            const weekIds = weekRows.map(w => w.id);
            const { data: pwRows } = weekIds.length > 0
              ? await supabase
                  .from("program_workouts")
                  .select("id, week_id, workout_id, day_of_week, day_label, sort_order, workouts(name)")
                  .in("week_id", weekIds)
                  .order("sort_order")
              : { data: [] };

            for (const w of weekRows) {
              weeks.push({
                id: w.id,
                weekNumber: w.week_number,
                name: w.name || `Week ${w.week_number}`,
                collapsed: true,
                workouts: (pwRows || [])
                  .filter((pw: any) => pw.week_id === w.id)
                  .map((pw: any) => ({
                    id: pw.id,
                    workoutId: pw.workout_id,
                    workoutName: (pw.workouts as any)?.name || "Workout",
                    dayOfWeek: pw.day_of_week ?? 0,
                    dayLabel: pw.day_label || DAY_LABELS[pw.day_of_week ?? 0],
                    sortOrder: pw.sort_order ?? 0,
                  })),
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

          const legacyWeeks: ProgramWeek[] = weekRows.map(w => ({
            id: w.id,
            weekNumber: w.week_number,
            name: w.name || `Week ${w.week_number}`,
            collapsed: true,
            workouts: (pwRows || [])
              .filter((pw: any) => pw.week_id === w.id)
              .map((pw: any) => ({
                id: pw.id,
                workoutId: pw.workout_id,
                workoutName: (pw.workouts as any)?.name || "Workout",
                dayOfWeek: pw.day_of_week ?? 0,
                dayLabel: pw.day_label || DAY_LABELS[pw.day_of_week ?? 0],
                sortOrder: pw.sort_order ?? 0,
              })),
          }));

          setPhases([{
            name: "Phase 1",
            description: "",
            phaseOrder: 1,
            durationWeeks: legacyWeeks.length,
            trainingStyle: "hypertrophy",
            intensitySystem: "straight_sets",
            progressionRule: "add_weight",
            weeks: legacyWeeks,
            collapsed: false,
          }]);
        }
      }
      setLoadingData(false);
    };
    loadProgram();
  }, [editProgramId, user]);

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

  // Week operations within a phase
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
      .map((w, i) => ({ ...w, weekNumber: i + 1, name: w.name.startsWith("Week ") ? `Week ${i + 1}` : w.name }));
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

  // Workout operations
  const openWorkoutPicker = (phaseIdx: number, weekIdx: number) => {
    setTargetPhaseIdx(phaseIdx);
    setTargetWeekIdx(weekIdx);
    setShowAddChoice(true);
  };

  const handleWorkoutBuilderSave = (workoutId: string, workoutName: string) => {
    const newPhases = [...phases];
    const week = newPhases[targetPhaseIdx].weeks[targetWeekIdx];
    const existingCount = week.workouts.length;
    week.workouts.push({
      workoutId,
      workoutName,
      dayOfWeek: Math.min(existingCount, 6),
      dayLabel: DAY_LABELS[Math.min(existingCount, 6)],
      sortOrder: existingCount,
    });
    setPhases(newPhases);
    setShowWorkoutBuilder(false);
  };

  const addWorkoutToWeek = (workout: any) => {
    const newPhases = [...phases];
    const week = newPhases[targetPhaseIdx].weeks[targetWeekIdx];
    const existingCount = week.workouts.length;
    week.workouts.push({
      workoutId: workout.id,
      workoutName: workout.name,
      dayOfWeek: Math.min(existingCount, 6),
      dayLabel: DAY_LABELS[Math.min(existingCount, 6)],
      sortOrder: existingCount,
    });
    setPhases(newPhases);
    setShowWorkoutPicker(false);
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

  const saveProgram = async () => {
    if (!user || !name) {
      toast({ title: "Program name is required", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const parsedTags = tags.split(",").map(t => t.trim()).filter(Boolean);
      const totalWeeks = phases.reduce((s, p) => s + p.weeks.length, 0);
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

        // Delete old phases (cascades to weeks via phase_id)
        await supabase.from("program_phases").delete().eq("program_id", editProgramId);
        // Delete any orphan weeks without phase_id
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

      // Insert phases, weeks, workouts
      let globalWeekNumber = 0;
      for (const phase of phases) {
        const { data: phaseRow, error: phaseErr } = await supabase
          .from("program_phases")
          .insert({
            program_id: programId!,
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
              program_id: programId!,
              phase_id: phaseRow.id,
              week_number: globalWeekNumber,
              name: week.name,
            })
            .select().single();
          if (wErr) throw wErr;

          if (week.workouts.length > 0) {
            const { error: pwErr } = await supabase.from("program_workouts").insert(
              week.workouts.map((w, i) => ({
                week_id: weekRow.id,
                workout_id: w.workoutId,
                day_of_week: w.dayOfWeek,
                day_label: w.dayLabel,
                sort_order: i,
              }))
            );
            if (pwErr) throw pwErr;
          }
        }
      }

      toast({ title: editProgramId ? "Program updated" : "Program created" });
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
                      {phase.weeks.length} week{phase.weeks.length !== 1 ? "s" : ""}
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
                      <Label className="text-xs">Intensity System</Label>
                      <Select value={phase.intensitySystem} onValueChange={(v) => updatePhase(phaseIdx, { intensitySystem: v })}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {INTENSITY_SYSTEMS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2 space-y-1.5">
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

                  {/* Weeks inside phase */}
                  <div className="space-y-3">
                    {phase.weeks.map((week, weekIdx) => (
                      <Card key={weekIdx} className="overflow-hidden bg-card/50">
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
                                <span className="text-[11px] text-muted-foreground">
                                  {week.workouts.length} workout{week.workouts.length !== 1 ? "s" : ""}
                                </span>
                              </div>
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => duplicateWeekInPhase(phaseIdx, weekIdx)}>
                                  <Copy className="h-3 w-3" />
                                </Button>
                                {phase.weeks.length > 1 && (
                                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeWeekFromPhase(phaseIdx, weekIdx)}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </CollapsibleTrigger>

                          <CollapsibleContent>
                            <div className="px-3 pb-3 space-y-2">
                              {week.workouts.length === 0 ? (
                                <p className="text-[11px] text-muted-foreground text-center py-3">
                                  No workouts assigned.
                                </p>
                              ) : (
                                week.workouts.map((pw, pwIdx) => (
                                  <div key={pwIdx} className="flex items-center gap-2 p-2 border rounded-md bg-background">
                                    <Dumbbell className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                    <span className="text-xs font-medium flex-1 truncate">{pw.workoutName}</span>
                                    <Select
                                      value={String(pw.dayOfWeek)}
                                      onValueChange={(v) => updateWorkoutDay(phaseIdx, weekIdx, pwIdx, parseInt(v))}
                                    >
                                      <SelectTrigger className="w-28 h-7 text-[11px]"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        {DAY_LABELS.map((day, i) => (
                                          <SelectItem key={i} value={String(i)}>{day}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive flex-shrink-0" onClick={() => removeWorkoutFromWeek(phaseIdx, weekIdx, pwIdx)}>
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ))
                              )}
                              <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={() => openWorkoutPicker(phaseIdx, weekIdx)}>
                                <Plus className="h-3 w-3 mr-1" /> Add Workout
                              </Button>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      </Card>
                    ))}

                    <Button size="sm" variant="ghost" className="w-full text-xs" onClick={() => addWeekToPhase(phaseIdx)}>
                      <Plus className="h-3 w-3 mr-1" /> Add Week to {phase.name}
                    </Button>
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
          <span>{phases.reduce((s, p) => s + p.weeks.length, 0)} total weeks</span>
          <span>{phases.reduce((s, p) => s + p.weeks.reduce((ws, w) => ws + w.workouts.length, 0), 0)} workouts</span>
        </div>
      </div>

      {/* Save */}
      <Button onClick={saveProgram} disabled={loading || !name} className="w-full" size="lg">
        {loading && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
        {editProgramId ? "Update Program" : "Create Program"}
      </Button>

      {/* Workout Picker */}
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
                  onClick={() => addWorkoutToWeek(w)}
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
    </div>
  );
};

export default ProgramBuilder;
