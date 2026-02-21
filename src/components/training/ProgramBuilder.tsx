import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, Copy, ChevronDown, ChevronUp, Calendar, Dumbbell } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const GOAL_TYPES = [
  { label: "Hypertrophy", value: "hypertrophy" },
  { label: "Strength", value: "strength" },
  { label: "Fat Loss", value: "fat_loss" },
  { label: "Powerbuilding", value: "powerbuilding" },
  { label: "Athletic Performance", value: "athletic" },
  { label: "General Fitness", value: "general" },
  { label: "Recomp", value: "recomp" },
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
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [weeks, setWeeks] = useState<ProgramWeek[]>([
    { weekNumber: 1, name: "Week 1", workouts: [], collapsed: false },
  ]);
  const [availableWorkouts, setAvailableWorkouts] = useState<any[]>([]);
  const [showWorkoutPicker, setShowWorkoutPicker] = useState(false);
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
      setStartDate(program.start_date || "");
      setEndDate(program.end_date || "");

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

        const loadedWeeks: ProgramWeek[] = weekRows.map(w => ({
          id: w.id,
          weekNumber: w.week_number,
          name: w.name || `Week ${w.week_number}`,
          collapsed: false,
          workouts: (pwRows || [])
            .filter(pw => pw.week_id === w.id)
            .map(pw => ({
              id: pw.id,
              workoutId: pw.workout_id,
              workoutName: (pw.workouts as any)?.name || "Workout",
              dayOfWeek: pw.day_of_week ?? 0,
              dayLabel: pw.day_label || DAY_LABELS[pw.day_of_week ?? 0],
              sortOrder: pw.sort_order ?? 0,
            })),
        }));
        setWeeks(loadedWeeks);
      }
      setLoadingData(false);
    };
    loadProgram();
  }, [editProgramId, user]);

  const addWeek = () => {
    const nextNum = weeks.length + 1;
    setWeeks([...weeks, { weekNumber: nextNum, name: `Week ${nextNum}`, workouts: [], collapsed: false }]);
  };

  const removeWeek = (idx: number) => {
    if (weeks.length <= 1) return;
    const newWeeks = weeks.filter((_, i) => i !== idx).map((w, i) => ({
      ...w, weekNumber: i + 1, name: w.name.startsWith("Week ") ? `Week ${i + 1}` : w.name,
    }));
    setWeeks(newWeeks);
  };

  const duplicateWeek = (idx: number) => {
    const source = weeks[idx];
    const newWeek: ProgramWeek = {
      weekNumber: weeks.length + 1,
      name: `Week ${weeks.length + 1}`,
      workouts: source.workouts.map(w => ({ ...w, id: undefined })),
      collapsed: false,
    };
    setWeeks([...weeks, newWeek]);
  };

  const toggleWeekCollapse = (idx: number) => {
    const newWeeks = [...weeks];
    newWeeks[idx].collapsed = !newWeeks[idx].collapsed;
    setWeeks(newWeeks);
  };

  const openWorkoutPicker = (weekIdx: number) => {
    setTargetWeekIdx(weekIdx);
    setShowWorkoutPicker(true);
  };

  const addWorkoutToWeek = (workout: any) => {
    const newWeeks = [...weeks];
    const existingCount = newWeeks[targetWeekIdx].workouts.length;
    newWeeks[targetWeekIdx].workouts.push({
      workoutId: workout.id,
      workoutName: workout.name,
      dayOfWeek: Math.min(existingCount, 6),
      dayLabel: DAY_LABELS[Math.min(existingCount, 6)],
      sortOrder: existingCount,
    });
    setWeeks(newWeeks);
    setShowWorkoutPicker(false);
  };

  const removeWorkoutFromWeek = (weekIdx: number, workoutIdx: number) => {
    const newWeeks = [...weeks];
    newWeeks[weekIdx].workouts.splice(workoutIdx, 1);
    setWeeks(newWeeks);
  };

  const updateWorkoutDay = (weekIdx: number, workoutIdx: number, dayOfWeek: number) => {
    const newWeeks = [...weeks];
    newWeeks[weekIdx].workouts[workoutIdx].dayOfWeek = dayOfWeek;
    newWeeks[weekIdx].workouts[workoutIdx].dayLabel = DAY_LABELS[dayOfWeek];
    setWeeks(newWeeks);
  };

  const saveProgram = async () => {
    if (!user || !name) {
      toast({ title: "Program name is required", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      let programId = editProgramId;

      if (editProgramId) {
        const { error } = await supabase.from("programs").update({
          name, description: description || null, goal_type: goalType,
          start_date: startDate || null, end_date: endDate || null,
        }).eq("id", editProgramId);
        if (error) throw error;

        // Delete old weeks (cascade deletes program_workouts)
        await supabase.from("program_weeks").delete().eq("program_id", editProgramId);
      } else {
        const { data, error } = await supabase.from("programs").insert({
          coach_id: user.id, name, description: description || null,
          goal_type: goalType, start_date: startDate || null,
          end_date: endDate || null, is_template: true,
        }).select().single();
        if (error) throw error;
        programId = data.id;
      }

      // Insert weeks
      for (const week of weeks) {
        const { data: weekRow, error: wErr } = await supabase
          .from("program_weeks")
          .insert({ program_id: programId!, week_number: week.weekNumber, name: week.name })
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
          <div className="space-y-2">
            <Label>Program Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="12-Week Hypertrophy" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Program overview..." rows={2} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Goal Type</Label>
              <Select value={goalType} onValueChange={setGoalType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GOAL_TYPES.map(g => (
                    <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End Date (optional)</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Weeks */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Program Weeks</h3>
          <Button size="sm" variant="outline" onClick={addWeek}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Week
          </Button>
        </div>

        {weeks.map((week, weekIdx) => (
          <Card key={weekIdx} className="overflow-hidden">
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => toggleWeekCollapse(weekIdx)}
            >
              <div className="flex items-center gap-2">
                {week.collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                <h4 className="font-medium text-sm">{week.name}</h4>
                <span className="text-xs text-muted-foreground">
                  {week.workouts.length} workout{week.workouts.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => duplicateWeek(weekIdx)} title="Duplicate week">
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                {weeks.length > 1 && (
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeWeek(weekIdx)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            {!week.collapsed && (
              <CardContent className="pt-0 space-y-3">
                {week.workouts.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No workouts assigned. Add workouts from your templates.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {week.workouts.map((pw, pwIdx) => (
                      <div key={pwIdx} className="flex items-center gap-3 p-3 border rounded-lg bg-card/50">
                        <Dumbbell className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm font-medium flex-1 truncate">{pw.workoutName}</span>
                        <Select
                          value={String(pw.dayOfWeek)}
                          onValueChange={(v) => updateWorkoutDay(weekIdx, pwIdx, parseInt(v))}
                        >
                          <SelectTrigger className="w-32 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DAY_LABELS.map((day, i) => (
                              <SelectItem key={i} value={String(i)}>{day}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive flex-shrink-0" onClick={() => removeWorkoutFromWeek(weekIdx, pwIdx)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <Button size="sm" variant="outline" className="w-full" onClick={() => openWorkoutPicker(weekIdx)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Workout
                </Button>
              </CardContent>
            )}
          </Card>
        ))}
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
