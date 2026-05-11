/**
 * AICreateProgramModal — coach-only modal to generate an 8-week J3U program
 * for a specific client using Lovable AI. Triggered from the phase 3-dots menu.
 *
 * Flow:
 *  1. Show client summary + "Coach Override Notes" textarea.
 *  2. On Generate: call ai-generate-program edge function (shows step progress).
 *  3. On success: render preview with editable rows + volume summary.
 *  4. On Approve & Save: write a new program + phase + workouts + exercises +
 *     calendar_events for all 8 weeks in a single transactional pass.
 */
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Loader2, Trash2, Plus, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { findExerciseInLibrary } from "@/utils/exerciseMatcher";
import { toLocalDateString } from "@/utils/localDate";

interface PreviewExercise {
  name: string;
  sets: number;
  reps: string;
  rest_seconds: number;
  notes: string;
  is_amrap?: boolean;
  primary_muscle?: string | null;
  exercise_id?: string | null;
}
interface PreviewDay {
  day_label: string;
  day_of_week: number;
  category: string;
  exercises: PreviewExercise[];
}
interface PreviewProgram {
  rationale: string;
  conflict_flags: string[];
  weekly_volume: Record<string, number>;
  days: PreviewDay[];
}
interface PreviewMeta {
  start_date: string;
  end_date: string;
  weeks: number;
  warnings?: string[];
  body_fat_estimated_from_photo?: boolean;
  photo_used?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  clientName: string;
  programId: string;
  currentPhaseId: string;
  onSaved: () => void;
}

const STEPS = [
  "Reading client profile…",
  "Analyzing recent progress photo…",
  "Selecting exercises from your library…",
  "Building program…",
  "Validating against J3U rules…",
];

const VOL_TARGETS: Record<string, [number, number]> = {
  // muscle: [min, max] ideal range
  default: [10, 16],
  calf: [10, 20], calves: [10, 20], abs: [10, 20], core: [10, 20],
};

function volumeStatus(muscle: string, sets: number, focus: string | null): "green" | "yellow" | "red" {
  const m = muscle.toLowerCase();
  let target = VOL_TARGETS[m] ?? VOL_TARGETS.default;
  if (focus && m.includes(focus.toLowerCase())) target = [16, 22];
  if (sets > 22) return "red";
  if (sets >= target[0] && sets <= target[1]) return "green";
  if (sets >= target[0] - 2 && sets <= target[1] + 2) return "yellow";
  return "red";
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const AICreateProgramModal = ({
  open, onOpenChange, clientId, clientName, programId, currentPhaseId, onSaved,
}: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [phase, setPhase] = useState<"input" | "generating" | "preview" | "saving">("input");
  const [stepIdx, setStepIdx] = useState(0);
  const [override, setOverride] = useState("");
  const [program, setProgram] = useState<PreviewProgram | null>(null);
  const [meta, setMeta] = useState<PreviewMeta | null>(null);
  const [library, setLibrary] = useState<{ id: string; name: string; primary_muscle?: string | null; equipment?: string | null }[]>([]);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Fetch a slice of library for client-side fuzzy matching when coach edits rows
  useEffect(() => {
    if (!open) return;
    supabase.from("exercises")
      .select("id, name, primary_muscle, equipment")
      .order("name", { ascending: true })
      .limit(800)
      .then(({ data }) => setLibrary(data || []));
  }, [open]);

  // Reset state when closed
  useEffect(() => {
    if (!open) {
      setPhase("input"); setStepIdx(0); setOverride("");
      setProgram(null); setMeta(null); setErrMsg(null);
    }
  }, [open]);

  const handleGenerate = async () => {
    setPhase("generating");
    setErrMsg(null);
    setStepIdx(0);
    // Animate steps while waiting
    const interval = setInterval(() => {
      setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
    }, 4000);

    try {
      const { data, error } = await supabase.functions.invoke("ai-generate-program", {
        body: { clientId, currentPhaseId, coachOverride: override.trim() },
      });
      clearInterval(interval);
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      setProgram((data as any).program);
      setMeta((data as any).meta);
      setPhase("preview");
    } catch (e: any) {
      clearInterval(interval);
      setErrMsg(e?.message || "Generation failed.");
      setPhase("input");
    }
  };

  const updateExercise = (di: number, ei: number, patch: Partial<PreviewExercise>) => {
    setProgram((p) => {
      if (!p) return p;
      const days = p.days.map((d, i) => i !== di ? d : ({
        ...d,
        exercises: d.exercises.map((ex, j) => j !== ei ? ex : { ...ex, ...patch }),
      }));
      return { ...p, days };
    });
  };
  const removeExercise = (di: number, ei: number) => {
    setProgram((p) => p && ({
      ...p, days: p.days.map((d, i) => i !== di ? d : ({
        ...d, exercises: d.exercises.filter((_, j) => j !== ei),
      })),
    }));
  };
  const addExercise = (di: number) => {
    setProgram((p) => p && ({
      ...p, days: p.days.map((d, i) => i !== di ? d : ({
        ...d, exercises: [...d.exercises, {
          name: "", sets: 3, reps: "8-12", rest_seconds: 90, notes: "",
        }],
      })),
    }));
  };

  const computedVolume = useMemo(() => {
    if (!program) return {};
    const v: Record<string, number> = {};
    for (const d of program.days) {
      for (const ex of d.exercises) {
        const m = (ex.primary_muscle || "").toLowerCase().trim();
        if (!m) continue;
        v[m] = (v[m] || 0) + (Number(ex.sets) || 0);
      }
    }
    return v;
  }, [program]);

  const handleSave = async () => {
    if (!program || !meta || !user) return;
    setPhase("saving");

    try {
      // Resolve every exercise name to a library id (fuzzy match if needed)
      const startDate = new Date(meta.start_date);
      const startDow = (startDate.getDay() + 6) % 7; // Mon=0
      // Sort days by their day_of_week so the calendar lays out cleanly
      const sortedDays = [...program.days].sort((a, b) => a.day_of_week - b.day_of_week);

      // 1. Fetch program coach_id
      const { data: progRow } = await supabase
        .from("programs").select("coach_id").eq("id", programId).maybeSingle();
      const coachId = progRow?.coach_id || user.id;

      // 2. Get next phase_order
      const { data: existingPhases } = await supabase
        .from("program_phases")
        .select("phase_order")
        .eq("program_id", programId)
        .order("phase_order", { ascending: false })
        .limit(1);
      const nextOrder = (existingPhases?.[0]?.phase_order || 0) + 1;

      // 3. Insert phase
      const { data: newPhase, error: phaseErr } = await supabase
        .from("program_phases").insert({
          program_id: programId,
          name: `AI Phase ${nextOrder}`,
          description: program.rationale.slice(0, 500),
          phase_order: nextOrder,
          duration_weeks: 8,
          training_style: "hypertrophy",
        }).select().single();
      if (phaseErr || !newPhase) throw phaseErr || new Error("Phase insert failed");

      // 4. For each day: create workout + workout_exercises + program_workouts link
      const calendarRows: any[] = [];
      for (let dayIdx = 0; dayIdx < sortedDays.length; dayIdx++) {
        const day = sortedDays[dayIdx];

        const { data: workout, error: wErr } = await supabase
          .from("workouts").insert({
            name: day.day_label,
            coach_id: coachId,
            client_id: clientId,
            is_template: false,
            workout_type: "regular",
          }).select().single();
        if (wErr || !workout) throw wErr || new Error("Workout insert failed");

        // Resolve exercises to library ids
        const weRows: any[] = [];
        for (let ei = 0; ei < day.exercises.length; ei++) {
          const ex = day.exercises[ei];
          let exId = ex.exercise_id;
          if (!exId) {
            const m = findExerciseInLibrary(ex.name, library);
            exId = m?.exercise.id || null;
          }
          if (!exId) continue; // skip unresolved
          weRows.push({
            workout_id: workout.id,
            exercise_id: exId,
            exercise_order: ei,
            sets: Math.max(1, Math.floor(Number(ex.sets) || 3)),
            reps: ex.reps || "",
            rest_seconds: Math.max(0, Math.floor(Number(ex.rest_seconds) || 90)),
            notes: ex.notes || "",
            is_amrap: !!ex.is_amrap,
          });
        }
        if (weRows.length) {
          const { error: weErr } = await supabase.from("workout_exercises").insert(weRows);
          if (weErr) throw weErr;
        }

        await supabase.from("program_workouts").insert({
          phase_id: newPhase.id,
          workout_id: workout.id,
          day_of_week: day.day_of_week,
          day_label: day.day_label,
          sort_order: dayIdx,
        });

        // 5. Schedule across 8 weeks. day_of_week: 0=Mon...6=Sun.
        // Find the first occurrence of this DOW on/after startDate.
        const offset = (day.day_of_week - startDow + 7) % 7;
        const firstDate = new Date(startDate);
        firstDate.setDate(firstDate.getDate() + offset);
        for (let w = 0; w < 8; w++) {
          const d = new Date(firstDate);
          d.setDate(d.getDate() + w * 7);
          if (d > new Date(meta.end_date)) break;
          calendarRows.push({
            user_id: clientId,
            target_client_id: clientId,
            title: day.day_label,
            event_date: toLocalDateString(d),
            event_type: "workout",
            is_completed: false,
            linked_workout_id: workout.id,
          });
        }
      }

      if (calendarRows.length) {
        const { error: ceErr } = await supabase.from("calendar_events").insert(calendarRows);
        if (ceErr) throw ceErr;
      }

      toast({ title: "Phase saved", description: `Scheduled ${calendarRows.length} sessions across 8 weeks.` });
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      console.error("[AI Save] failed:", e);
      toast({ title: "Save failed", description: e?.message || "Unknown error", variant: "destructive" });
      setPhase("preview");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Create New Phase — {clientName}
          </DialogTitle>
          <DialogDescription>
            8-week J3U-methodology program tailored to this client's profile, photo, and library.
          </DialogDescription>
        </DialogHeader>

        {phase === "input" && (
          <div className="space-y-4 py-2">
            <Card><CardContent className="pt-4 text-xs text-muted-foreground space-y-1">
              The AI will read: injuries, training location, available days, focus area, height/weight, body fat %, and the most recent progress photo.
            </CardContent></Card>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Coach Override Notes (optional)</label>
              <Textarea
                value={override}
                onChange={(e) => setOverride(e.target.value)}
                placeholder="e.g. Client had a shoulder flare-up last week, avoid overhead pressing…"
                rows={4}
              />
            </div>
            {errMsg && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{errMsg}</span>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleGenerate} className="gap-2">
                <Sparkles className="h-4 w-4" /> Generate Program
              </Button>
            </div>
          </div>
        )}

        {phase === "generating" && (
          <div className="py-12 flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="space-y-1.5 w-full max-w-sm">
              {STEPS.map((s, i) => (
                <div key={s} className={`text-sm flex items-center gap-2 ${i <= stepIdx ? "text-foreground" : "text-muted-foreground/40"}`}>
                  {i < stepIdx ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> :
                    i === stepIdx ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
                    <div className="h-3.5 w-3.5" />}
                  {s}
                </div>
              ))}
            </div>
          </div>
        )}

        {(phase === "preview" || phase === "saving") && program && meta && (
          <>
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-4">
                {/* Rationale + meta */}
                <Card><CardContent className="pt-4 space-y-2">
                  <p className="text-sm leading-relaxed">{program.rationale}</p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline">{meta.start_date} → {meta.end_date}</Badge>
                    <Badge variant="outline">{program.days.length} days/week × 8 weeks</Badge>
                    {meta.body_fat_estimated_from_photo && <Badge variant="outline">BF% est. from photo</Badge>}
                  </div>
                  {(program.conflict_flags?.length || (meta.warnings || []).length) > 0 && (
                    <div className="space-y-1 mt-2">
                      {[...(program.conflict_flags || []), ...(meta.warnings || [])].map((w, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-amber-500">
                          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {w}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent></Card>

                {/* Days */}
                {program.days.map((day, di) => (
                  <Card key={di}>
                    <CardContent className="pt-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-semibold text-sm">{day.day_label}</h4>
                          <p className="text-[10px] text-muted-foreground uppercase">{DAY_NAMES[day.day_of_week] || ""} · {day.category}</p>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => addExercise(di)}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> Add
                        </Button>
                      </div>
                      <div className="space-y-1.5">
                        {day.exercises.map((ex, ei) => (
                          <div key={ei} className="grid grid-cols-12 gap-1.5 items-start text-xs">
                            <Input value={ex.name} onChange={(e) => updateExercise(di, ei, { name: e.target.value })} className="col-span-4 h-8" />
                            <Input type="number" value={ex.sets} onChange={(e) => updateExercise(di, ei, { sets: Number(e.target.value) })} className="col-span-1 h-8" />
                            <Input value={ex.reps} onChange={(e) => updateExercise(di, ei, { reps: e.target.value })} className="col-span-2 h-8" placeholder="reps" />
                            <Input type="number" value={ex.rest_seconds} onChange={(e) => updateExercise(di, ei, { rest_seconds: Number(e.target.value) })} className="col-span-1 h-8" />
                            <Input value={ex.notes} onChange={(e) => updateExercise(di, ei, { notes: e.target.value })} className="col-span-3 h-8" placeholder="notes" />
                            <Button size="icon" variant="ghost" className="col-span-1 h-8" onClick={() => removeExercise(di, ei)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        ))}
                        <div className="grid grid-cols-12 gap-1.5 text-[9px] uppercase text-muted-foreground px-1">
                          <span className="col-span-4">Exercise</span>
                          <span className="col-span-1">Sets</span>
                          <span className="col-span-2">Reps</span>
                          <span className="col-span-1">Rest(s)</span>
                          <span className="col-span-3">Notes</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {/* Weekly volume */}
                <Card><CardContent className="pt-4">
                  <h4 className="font-semibold text-sm mb-2">Weekly Volume per Muscle</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(computedVolume).map(([m, sets]) => {
                      const status = volumeStatus(m, sets, null);
                      const cls = status === "green" ? "bg-emerald-500/15 text-emerald-500" :
                                  status === "yellow" ? "bg-amber-500/15 text-amber-500" :
                                  "bg-destructive/15 text-destructive";
                      return <Badge key={m} className={`text-[10px] ${cls}`}>{m}: {sets}</Badge>;
                    })}
                  </div>
                </CardContent></Card>
              </div>
            </ScrollArea>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={phase === "saving"}>Discard</Button>
              <Button variant="outline" onClick={handleGenerate} disabled={phase === "saving"}>Regenerate</Button>
              <Button onClick={handleSave} disabled={phase === "saving"} className="gap-2">
                {phase === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Approve & Save
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AICreateProgramModal;
