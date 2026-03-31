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
import { getLocalDateString } from "@/utils/localDate";

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

  // Grams as source of truth
  const initGrams = useMemo(() => {
    if (!initialTargets || initialTargets.calories === 0) {
      const cal = initialTargets?.calories || 2150;
      return {
        protein: Math.round((cal * 0.4) / 4),
        carbs: Math.round((cal * 0.4) / 4),
        fat: Math.round((cal * 0.2) / 9),
      };
    }
    return {
      protein: initialTargets.protein,
      carbs: initialTargets.carbs,
      fat: initialTargets.fat,
    };
  }, [initialTargets]);

  const [proteinG, setProteinG] = useState(initGrams.protein);
  const [carbsG, setCarbsG] = useState(initGrams.carbs);
  const [fatG, setFatG] = useState(initGrams.fat);

  // String state for inline gram inputs (avoids stuck-zero bug)
  const [proteinStr, setProteinStr] = useState(String(initGrams.protein));
  const [carbsStr, setCarbsStr] = useState(String(initGrams.carbs));
  const [fatStr, setFatStr] = useState(String(initGrams.fat));

  // Derived percentages from grams + calories
  const pcts = useMemo(() => {
    const totalMacroCals = (proteinG * 4) + (carbsG * 4) + (fatG * 9);
    if (totalMacroCals === 0) return { protein: 0, carbs: 0, fat: 0 };
    return {
      protein: Math.round((proteinG * 4 / totalMacroCals) * 100),
      carbs: Math.round((carbsG * 4 / totalMacroCals) * 100),
      fat: Math.round((fatG * 9 / totalMacroCals) * 100),
    };
  }, [proteinG, carbsG, fatG]);

  // Slider percentages relative to total calories (for slider position)
  const sliderPcts = useMemo(() => {
    if (calories === 0) return { protein: 0, carbs: 0, fat: 0 };
    return {
      protein: Math.round((proteinG * 4 / calories) * 100),
      carbs: Math.round((carbsG * 4 / calories) * 100),
      fat: Math.round((fatG * 9 / calories) * 100),
    };
  }, [proteinG, carbsG, fatG, calories]);

  // When user types grams directly
  const handleGramInput = useCallback((macro: "protein" | "carbs" | "fat", value: string) => {
    const numVal = parseInt(value) || 0;
    if (macro === "protein") {
      setProteinStr(value);
      setProteinG(numVal);
    } else if (macro === "carbs") {
      setCarbsStr(value);
      setCarbsG(numVal);
    } else {
      setFatStr(value);
      setFatG(numVal);
    }
  }, []);

  // When user moves a slider — convert percentage to grams for that macro, keep others fixed
  const handleSliderChange = useCallback((macro: "protein" | "carbs" | "fat", val: number[]) => {
    const newPct = val[0];
    if (macro === "protein") {
      const newG = Math.round((calories * newPct / 100) / 4);
      setProteinG(newG);
      setProteinStr(String(newG));
    } else if (macro === "carbs") {
      const newG = Math.round((calories * newPct / 100) / 4);
      setCarbsG(newG);
      setCarbsStr(String(newG));
    } else {
      const newG = Math.round((calories * newPct / 100) / 9);
      setFatG(newG);
      setFatStr(String(newG));
    }
  }, [calories]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const finalProtein = goalType === "calories_only" ? 0 : proteinG;
    const finalCarbs = goalType === "full_macros" ? carbsG : 0;
    const finalFat = goalType === "full_macros" ? fatG : 0;

    if (dailyStepGoal < 1000 || dailyStepGoal > 100000) {
      setStepGoalError("Must be between 1,000 and 100,000");
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("nutrition_targets").upsert({
      client_id: clientId,
      coach_id: user.id,
      calories,
      protein: finalProtein,
      carbs: finalCarbs,
      fat: finalFat,
      daily_step_goal: dailyStepGoal,
    } as any, { onConflict: "client_id,effective_date" });

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
    { pct: pcts.protein, color: "bg-blue-500", label: "Protein" },
    { pct: pcts.carbs, color: "bg-amber-500", label: "Carbs" },
    { pct: pcts.fat, color: "bg-rose-500", label: "Fat" },
  ];

  // Computed macro calories total for the preview
  const macroCalsTotal = (proteinG * 4) + (carbsG * 4) + (fatG * 9);

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

              {/* Protein Slider + Editable Gram Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-blue-500" />
                    <span className="text-sm font-medium">Protein</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Input
                      inputMode="numeric"
                      value={proteinStr}
                      onChange={e => handleGramInput("protein", e.target.value)}
                      className="w-[60px] h-7 text-sm font-bold text-right px-1.5 border-0 border-b border-border rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-blue-500"
                    />
                    <span className="text-sm font-bold">g</span>
                    <span className="text-xs text-muted-foreground ml-1">{pcts.protein}%</span>
                  </div>
                </div>
                <Slider
                  value={[sliderPcts.protein]}
                  onValueChange={val => handleSliderChange("protein", val)}
                  min={5} max={70} step={1}
                  className="[&_[role=slider]]:border-blue-500 [&_span:first-child>span]:bg-blue-500"
                />
              </div>

              {/* Carbs Slider + Editable Gram Input */}
              {goalType === "full_macros" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-amber-500" />
                      <span className="text-sm font-medium">Carbs</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Input
                        inputMode="numeric"
                        value={carbsStr}
                        onChange={e => handleGramInput("carbs", e.target.value)}
                        className="w-[60px] h-7 text-sm font-bold text-right px-1.5 border-0 border-b border-border rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-amber-500"
                      />
                      <span className="text-sm font-bold">g</span>
                      <span className="text-xs text-muted-foreground ml-1">{pcts.carbs}%</span>
                    </div>
                  </div>
                  <Slider
                    value={[sliderPcts.carbs]}
                    onValueChange={val => handleSliderChange("carbs", val)}
                    min={5} max={70} step={1}
                    className="[&_[role=slider]]:border-amber-500 [&_span:first-child>span]:bg-amber-500"
                  />
                </div>
              )}

              {/* Fat Slider + Editable Gram Input */}
              {goalType === "full_macros" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-rose-500" />
                      <span className="text-sm font-medium">Fat</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Input
                        inputMode="numeric"
                        value={fatStr}
                        onChange={e => handleGramInput("fat", e.target.value)}
                        className="w-[60px] h-7 text-sm font-bold text-right px-1.5 border-0 border-b border-border rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-rose-500"
                      />
                      <span className="text-sm font-bold">g</span>
                      <span className="text-xs text-muted-foreground ml-1">{pcts.fat}%</span>
                    </div>
                  </div>
                  <Slider
                    value={[sliderPcts.fat]}
                    onValueChange={val => handleSliderChange("fat", val)}
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
                    { label: "Protein", g: proteinG, pct: pcts.protein, color: "text-blue-400", bgColor: "bg-blue-500/10" },
                    { label: "Carbs", g: goalType === "full_macros" ? carbsG : "—", pct: goalType === "full_macros" ? pcts.carbs : "—", color: "text-amber-400", bgColor: "bg-amber-500/10" },
                    { label: "Fat", g: goalType === "full_macros" ? fatG : "—", pct: goalType === "full_macros" ? pcts.fat : "—", color: "text-rose-400", bgColor: "bg-rose-500/10" },
                  ].map(m => (
                    <div key={m.label} className={`text-center p-3 rounded-lg ${m.bgColor}`}>
                      <p className={`text-xl font-bold ${m.color}`}>{m.g}{typeof m.g === "number" ? "g" : ""}</p>
                      <p className="text-xs text-muted-foreground">{m.pct}{typeof m.pct === "number" ? "%" : ""}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{m.label}</p>
                    </div>
                  ))}
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Macro Calories</p>
                  <p className={`text-2xl font-bold ${macroCalsTotal === calories ? "text-primary" : "text-muted-foreground"}`}>
                    {macroCalsTotal.toLocaleString()}
                  </p>
                  {macroCalsTotal !== calories && (
                    <p className="text-[10px] text-amber-400 mt-0.5">
                      {macroCalsTotal > calories ? "+" : ""}{macroCalsTotal - calories} vs {calories} target
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Step Goal */}
        <div className="pt-4 border-t border-border space-y-2">
          <Label className="text-sm font-semibold">Daily Step Goal</Label>
          <div className="flex items-center gap-2">
            <Input
              inputMode="numeric"
              value={dailyStepGoal.toLocaleString()}
              onChange={e => {
                const raw = e.target.value.replace(/,/g, "");
                const num = parseInt(raw) || 0;
                setDailyStepGoal(num);
                setStepGoalError(num < 1000 || num > 100000 ? "Must be between 1,000 and 100,000" : "");
              }}
              className="max-w-[160px]"
            />
            <span className="text-sm text-muted-foreground">steps/day</span>
          </div>
          {stepGoalError && <p className="text-xs text-destructive">{stepGoalError}</p>}
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
