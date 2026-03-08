import { useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { Target, Flame } from "lucide-react";

type GoalType = "calories_only" | "calories_protein" | "full_macros";

interface NutritionGoalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  initialTargets?: { calories: number; protein: number; carbs: number; fat: number; daily_step_goal?: number } | null;
  onSaved: () => void;
}

const NutritionGoalModal = ({ open, onOpenChange, clientId, initialTargets, onSaved }: NutritionGoalModalProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [goalType, setGoalType] = useState<GoalType>("full_macros");
  const [calories, setCalories] = useState(initialTargets?.calories || 2150);
  const [dailyStepGoal, setDailyStepGoal] = useState(initialTargets?.daily_step_goal ?? 10000);
  const [stepGoalError, setStepGoalError] = useState("");

  // Store percentages as the source of truth for sliders
  const initPcts = useMemo(() => {
    if (!initialTargets || initialTargets.calories === 0) return { protein: 40, carbs: 40, fat: 20 };
    const pCal = initialTargets.protein * 4;
    const cCal = initialTargets.carbs * 4;
    const fCal = initialTargets.fat * 9;
    const total = pCal + cCal + fCal;
    if (total === 0) return { protein: 40, carbs: 40, fat: 20 };
    return {
      protein: Math.round((pCal / total) * 100),
      carbs: Math.round((cCal / total) * 100),
      fat: Math.round((fCal / total) * 100),
    };
  }, [initialTargets]);

  const [proteinPct, setProteinPct] = useState(initPcts.protein);
  const [carbsPct, setCarbsPct] = useState(initPcts.carbs);
  const [fatPct, setFatPct] = useState(initPcts.fat);

  // Computed grams
  const grams = useMemo(() => ({
    protein: Math.round((calories * proteinPct / 100) / 4),
    carbs: Math.round((calories * carbsPct / 100) / 4),
    fat: Math.round((calories * fatPct / 100) / 9),
  }), [calories, proteinPct, carbsPct, fatPct]);

  // Slider handlers that keep total at 100%
  const handleProteinChange = useCallback((val: number[]) => {
    const newP = val[0];
    const remaining = 100 - newP;
    const oldOther = carbsPct + fatPct;
    if (oldOther === 0) {
      setCarbsPct(Math.round(remaining * 0.67));
      setFatPct(remaining - Math.round(remaining * 0.67));
    } else {
      const newC = Math.round((carbsPct / oldOther) * remaining);
      setCarbsPct(newC);
      setFatPct(remaining - newC);
    }
    setProteinPct(newP);
  }, [carbsPct, fatPct]);

  const handleCarbsChange = useCallback((val: number[]) => {
    const newC = val[0];
    const remaining = 100 - newC;
    const oldOther = proteinPct + fatPct;
    if (oldOther === 0) {
      setProteinPct(Math.round(remaining * 0.67));
      setFatPct(remaining - Math.round(remaining * 0.67));
    } else {
      const newP = Math.round((proteinPct / oldOther) * remaining);
      setProteinPct(newP);
      setFatPct(remaining - newP);
    }
    setCarbsPct(newC);
  }, [proteinPct, fatPct]);

  const handleFatChange = useCallback((val: number[]) => {
    const newF = val[0];
    const remaining = 100 - newF;
    const oldOther = proteinPct + carbsPct;
    if (oldOther === 0) {
      setProteinPct(Math.round(remaining * 0.5));
      setCarbsPct(remaining - Math.round(remaining * 0.5));
    } else {
      const newP = Math.round((proteinPct / oldOther) * remaining);
      setProteinPct(newP);
      setCarbsPct(remaining - newP);
    }
    setFatPct(newF);
  }, [proteinPct, carbsPct]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const proteinG = goalType === "calories_only" ? 0 : grams.protein;
    const carbsG = goalType === "full_macros" ? grams.carbs : 0;
    const fatG = goalType === "full_macros" ? grams.fat : 0;

    // Validate step goal
    if (dailyStepGoal < 1000 || dailyStepGoal > 100000) {
      setStepGoalError("Must be between 1,000 and 100,000");
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("nutrition_targets").insert({
      client_id: clientId,
      coach_id: user.id,
      calories,
      protein: proteinG,
      carbs: carbsG,
      fat: fatG,
      daily_step_goal: dailyStepGoal,
    } as any);

    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Nutrition goals saved!" });
      onSaved();
      onOpenChange(false);
    }
  };

  const macroBarSegments = [
    { pct: proteinPct, color: "bg-blue-500", label: "Protein" },
    { pct: carbsPct, color: "bg-amber-500", label: "Carbs" },
    { pct: fatPct, color: "bg-rose-500", label: "Fat" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Set Nutrition Goal
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Goal Type */}
          <div>
            <Label>Type of Nutrition Goal</Label>
            <Select value={goalType} onValueChange={v => setGoalType(v as GoalType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="calories_only">Calories Only</SelectItem>
                <SelectItem value="calories_protein">Calories and Protein</SelectItem>
                <SelectItem value="full_macros">Calories and Full Macros</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Calorie Input */}
          <div>
            <Label className="flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5 text-primary" />
              Calories Per Day
            </Label>
            <Input
              type="number"
              value={calories}
              onChange={e => setCalories(parseInt(e.target.value) || 0)}
              className="text-lg font-bold"
            />
          </div>

          {/* Macro Distribution Sliders */}
          {goalType !== "calories_only" && (
            <div className="space-y-4">
              <Label className="text-sm font-semibold">Macro Distribution</Label>

              {/* Visual bar */}
              <div className="flex h-4 rounded-full overflow-hidden">
                {macroBarSegments.map(seg => (
                  <div key={seg.label} className={`${seg.color} transition-all duration-75`} style={{ width: `${seg.pct}%` }}>
                    {seg.pct >= 12 && (
                      <span className="text-[9px] font-bold text-white flex items-center justify-center h-full">
                        {seg.pct}%
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Protein Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-blue-500" />
                    <span className="text-sm font-medium">Protein</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold">{grams.protein}g</span>
                    <span className="text-xs text-muted-foreground ml-1.5">{proteinPct}%</span>
                  </div>
                </div>
                <Slider
                  value={[proteinPct]}
                  onValueChange={handleProteinChange}
                  min={5} max={70} step={1}
                  className="[&_[role=slider]]:border-blue-500 [&_span:first-child>span]:bg-blue-500"
                />
              </div>

              {/* Carbs Slider */}
              {goalType === "full_macros" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-amber-500" />
                      <span className="text-sm font-medium">Carbs</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold">{grams.carbs}g</span>
                      <span className="text-xs text-muted-foreground ml-1.5">{carbsPct}%</span>
                    </div>
                  </div>
                  <Slider
                    value={[carbsPct]}
                    onValueChange={handleCarbsChange}
                    min={5} max={70} step={1}
                    className="[&_[role=slider]]:border-amber-500 [&_span:first-child>span]:bg-amber-500"
                  />
                </div>
              )}

              {/* Fat Slider */}
              {goalType === "full_macros" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-rose-500" />
                      <span className="text-sm font-medium">Fat</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold">{grams.fat}g</span>
                      <span className="text-xs text-muted-foreground ml-1.5">{fatPct}%</span>
                    </div>
                  </div>
                  <Slider
                    value={[fatPct]}
                    onValueChange={handleFatChange}
                    min={5} max={60} step={1}
                    className="[&_[role=slider]]:border-rose-500 [&_span:first-child>span]:bg-rose-500"
                  />
                </div>
              )}

              {/* Live Preview */}
              <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Live Macro Preview</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Protein", g: grams.protein, pct: proteinPct, color: "text-blue-400", bgColor: "bg-blue-500/10" },
                    { label: "Carbs", g: goalType === "full_macros" ? grams.carbs : "—", pct: goalType === "full_macros" ? carbsPct : "—", color: "text-amber-400", bgColor: "bg-amber-500/10" },
                    { label: "Fat", g: goalType === "full_macros" ? grams.fat : "—", pct: goalType === "full_macros" ? fatPct : "—", color: "text-rose-400", bgColor: "bg-rose-500/10" },
                  ].map(m => (
                    <div key={m.label} className={`text-center p-3 rounded-lg ${m.bgColor}`}>
                      <p className={`text-xl font-bold ${m.color}`}>{m.g}{typeof m.g === "number" ? "g" : ""}</p>
                      <p className="text-xs text-muted-foreground">{m.pct}{typeof m.pct === "number" ? "%" : ""}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{m.label}</p>
                    </div>
                  ))}
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Total Calories</p>
                  <p className="text-2xl font-bold text-primary">{calories.toLocaleString()}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Goals"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NutritionGoalModal;
