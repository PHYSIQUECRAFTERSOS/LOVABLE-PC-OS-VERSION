import { useState, useMemo, useCallback, useEffect } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Target, Flame, Dumbbell, Moon } from "lucide-react";
import { getLocalDateString } from "@/utils/localDate";

type GoalType = "calories_only" | "calories_protein" | "full_macros";

interface NutritionGoalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  initialTargets?: {
    calories: number; protein: number; carbs: number; fat: number;
    daily_step_goal?: number;
    rest_calories?: number | null; rest_protein?: number | null;
    rest_carbs?: number | null; rest_fat?: number | null;
  } | null;
  onSaved: () => void;
}

interface MacroState {
  calories: number;
  proteinG: number; carbsG: number; fatG: number;
  proteinStr: string; carbsStr: string; fatStr: string;
}

function initMacros(cal: number, p: number, c: number, f: number): MacroState {
  const hasValues = p > 0 || c > 0 || f > 0;
  const protein = hasValues ? p : Math.round((cal * 0.4) / 4);
  const carbs = hasValues ? c : Math.round((cal * 0.4) / 4);
  const fat = hasValues ? f : Math.round((cal * 0.2) / 9);
  return {
    calories: cal,
    proteinG: protein, carbsG: carbs, fatG: fat,
    proteinStr: String(protein), carbsStr: String(carbs), fatStr: String(fat),
  };
}

function MacroEditor({
  state, goalType, onUpdate,
}: {
  state: MacroState;
  goalType: GoalType;
  onUpdate: (s: MacroState) => void;
}) {
  const { calories, proteinG, carbsG, fatG, proteinStr, carbsStr, fatStr } = state;

  const pcts = useMemo(() => {
    const total = (proteinG * 4) + (carbsG * 4) + (fatG * 9);
    if (total === 0) return { protein: 0, carbs: 0, fat: 0 };
    return {
      protein: Math.round((proteinG * 4 / total) * 100),
      carbs: Math.round((carbsG * 4 / total) * 100),
      fat: Math.round((fatG * 9 / total) * 100),
    };
  }, [proteinG, carbsG, fatG]);

  const sliderPcts = useMemo(() => {
    if (calories === 0) return { protein: 0, carbs: 0, fat: 0 };
    return {
      protein: Math.round((proteinG * 4 / calories) * 100),
      carbs: Math.round((carbsG * 4 / calories) * 100),
      fat: Math.round((fatG * 9 / calories) * 100),
    };
  }, [proteinG, carbsG, fatG, calories]);

  const handleGramInput = (macro: "protein" | "carbs" | "fat", value: string) => {
    const numVal = parseInt(value) || 0;
    onUpdate({
      ...state,
      ...(macro === "protein" ? { proteinG: numVal, proteinStr: value } : {}),
      ...(macro === "carbs" ? { carbsG: numVal, carbsStr: value } : {}),
      ...(macro === "fat" ? { fatG: numVal, fatStr: value } : {}),
    });
  };

  const handleSliderChange = (macro: "protein" | "carbs" | "fat", val: number[]) => {
    const newPct = val[0];
    if (macro === "protein") {
      const newG = Math.round((calories * newPct / 100) / 4);
      onUpdate({ ...state, proteinG: newG, proteinStr: String(newG) });
    } else if (macro === "carbs") {
      const newG = Math.round((calories * newPct / 100) / 4);
      onUpdate({ ...state, carbsG: newG, carbsStr: String(newG) });
    } else {
      const newG = Math.round((calories * newPct / 100) / 9);
      onUpdate({ ...state, fatG: newG, fatStr: String(newG) });
    }
  };

  const macroCalsTotal = (proteinG * 4) + (carbsG * 4) + (fatG * 9);

  const macroBarSegments = [
    { pct: pcts.protein, color: "bg-blue-500", label: "Protein" },
    { pct: pcts.carbs, color: "bg-amber-500", label: "Carbs" },
    { pct: pcts.fat, color: "bg-rose-500", label: "Fat" },
  ];

  return (
    <div className="space-y-5">
      {/* Calorie Input */}
      <div>
        <Label className="flex items-center gap-1.5">
          <Flame className="h-3.5 w-3.5 text-primary" />
          Calories Per Day
        </Label>
        <Input
          type="number"
          value={calories}
          onChange={e => onUpdate({ ...state, calories: parseInt(e.target.value) || 0 })}
          className="text-lg font-bold"
        />
      </div>

      {goalType !== "calories_only" && (
        <div className="space-y-4">
          <Label className="text-sm font-semibold">Macro Distribution</Label>
          <div className="flex h-4 rounded-full overflow-hidden">
            {macroBarSegments.map(seg => (
              <div key={seg.label} className={`${seg.color} transition-all duration-75`} style={{ width: `${seg.pct}%` }}>
                {seg.pct >= 12 && (
                  <span className="text-[9px] font-bold text-white flex items-center justify-center h-full">{seg.pct}%</span>
                )}
              </div>
            ))}
          </div>

          {/* Protein */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-blue-500" />
                <span className="text-sm font-medium">Protein</span>
              </div>
              <div className="flex items-center gap-1">
                <Input inputMode="numeric" value={proteinStr} onChange={e => handleGramInput("protein", e.target.value)}
                  className="w-[60px] h-7 text-sm font-bold text-right px-1.5 border-0 border-b border-border rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-blue-500" />
                <span className="text-sm font-bold">g</span>
                <span className="text-xs text-muted-foreground ml-1">{pcts.protein}%</span>
              </div>
            </div>
            <Slider value={[sliderPcts.protein]} onValueChange={val => handleSliderChange("protein", val)} min={5} max={70} step={1}
              className="[&_[role=slider]]:border-blue-500 [&_span:first-child>span]:bg-blue-500" />
          </div>

          {goalType === "full_macros" && (
            <>
              {/* Carbs */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-amber-500" />
                    <span className="text-sm font-medium">Carbs</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Input inputMode="numeric" value={carbsStr} onChange={e => handleGramInput("carbs", e.target.value)}
                      className="w-[60px] h-7 text-sm font-bold text-right px-1.5 border-0 border-b border-border rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-amber-500" />
                    <span className="text-sm font-bold">g</span>
                    <span className="text-xs text-muted-foreground ml-1">{pcts.carbs}%</span>
                  </div>
                </div>
                <Slider value={[sliderPcts.carbs]} onValueChange={val => handleSliderChange("carbs", val)} min={5} max={70} step={1}
                  className="[&_[role=slider]]:border-amber-500 [&_span:first-child>span]:bg-amber-500" />
              </div>

              {/* Fat */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-rose-500" />
                    <span className="text-sm font-medium">Fat</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Input inputMode="numeric" value={fatStr} onChange={e => handleGramInput("fat", e.target.value)}
                      className="w-[60px] h-7 text-sm font-bold text-right px-1.5 border-0 border-b border-border rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-rose-500" />
                    <span className="text-sm font-bold">g</span>
                    <span className="text-xs text-muted-foreground ml-1">{pcts.fat}%</span>
                  </div>
                </div>
                <Slider value={[sliderPcts.fat]} onValueChange={val => handleSliderChange("fat", val)} min={5} max={60} step={1}
                  className="[&_[role=slider]]:border-rose-500 [&_span:first-child>span]:bg-rose-500" />
              </div>
            </>
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
  );
}

const NutritionGoalModal = ({ open, onOpenChange, clientId, initialTargets, onSaved }: NutritionGoalModalProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [goalType, setGoalType] = useState<GoalType>("full_macros");
  const [activeTab, setActiveTab] = useState<"training" | "rest">("training");
  const [dailyStepGoal, setDailyStepGoal] = useState(initialTargets?.daily_step_goal ?? 10000);
  const [stepGoalError, setStepGoalError] = useState("");

  const [training, setTraining] = useState<MacroState>(
    initMacros(
      initialTargets?.calories || 2150,
      initialTargets?.protein || 0,
      initialTargets?.carbs || 0,
      initialTargets?.fat || 0
    )
  );

  const [rest, setRest] = useState<MacroState>(
    initMacros(
      initialTargets?.rest_calories || initialTargets?.calories || 2150,
      initialTargets?.rest_protein || initialTargets?.protein || 0,
      initialTargets?.rest_carbs || initialTargets?.carbs || 0,
      initialTargets?.rest_fat || initialTargets?.fat || 0
    )
  );

  const hasRestTargets = initialTargets?.rest_calories != null;

  // Reset state when modal opens with new data
  useEffect(() => {
    if (open && initialTargets) {
      setTraining(initMacros(
        initialTargets.calories || 2150,
        initialTargets.protein || 0,
        initialTargets.carbs || 0,
        initialTargets.fat || 0
      ));
      setRest(initMacros(
        initialTargets.rest_calories || initialTargets.calories || 2150,
        initialTargets.rest_protein || initialTargets.protein || 0,
        initialTargets.rest_carbs || initialTargets.carbs || 0,
        initialTargets.rest_fat || initialTargets.fat || 0
      ));
      setDailyStepGoal(initialTargets.daily_step_goal ?? 10000);
    }
  }, [open, initialTargets]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const finalTrainingProtein = goalType === "calories_only" ? 0 : training.proteinG;
    const finalTrainingCarbs = goalType === "full_macros" ? training.carbsG : 0;
    const finalTrainingFat = goalType === "full_macros" ? training.fatG : 0;

    const finalRestProtein = goalType === "calories_only" ? 0 : rest.proteinG;
    const finalRestCarbs = goalType === "full_macros" ? rest.carbsG : 0;
    const finalRestFat = goalType === "full_macros" ? rest.fatG : 0;

    if (dailyStepGoal < 1000 || dailyStepGoal > 100000) {
      setStepGoalError("Must be between 1,000 and 100,000");
      setSaving(false);
      return;
    }

    const today = getLocalDateString();
    const { error } = await supabase.from("nutrition_targets").upsert({
      client_id: clientId,
      coach_id: user.id,
      calories: training.calories,
      protein: finalTrainingProtein,
      carbs: finalTrainingCarbs,
      fat: finalTrainingFat,
      rest_calories: rest.calories,
      rest_protein: finalRestProtein,
      rest_carbs: finalRestCarbs,
      rest_fat: finalRestFat,
      daily_step_goal: dailyStepGoal,
      effective_date: today,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Set Nutrition Goals
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

          {/* Training / Rest Day Tabs */}
          <Tabs value={activeTab} onValueChange={v => setActiveTab(v as "training" | "rest")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="training" className="gap-1.5">
                <Dumbbell className="h-3.5 w-3.5" />
                Training Day
              </TabsTrigger>
              <TabsTrigger value="rest" className="gap-1.5">
                <Moon className="h-3.5 w-3.5" />
                Rest Day
              </TabsTrigger>
            </TabsList>
            <TabsContent value="training" className="mt-4">
              <MacroEditor state={training} goalType={goalType} onUpdate={setTraining} />
            </TabsContent>
            <TabsContent value="rest" className="mt-4">
              <MacroEditor state={rest} goalType={goalType} onUpdate={setRest} />
              {!hasRestTargets && (
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  Rest day targets not set yet. Values will fall back to training day targets until you save.
                </p>
              )}
            </TabsContent>
          </Tabs>
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
