import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Target, Flame, ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";

interface MacroTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface MacroTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
}

interface MealPlanMacroSidebarProps {
  targets: MacroTargets;
  current: MacroTotals;
  onTargetsChange: (targets: MacroTargets) => void;
  clientId?: string;
}

type GoalType = "calories_only" | "calories_protein" | "full_macros";

/* ── Remaining macro row ── */
const MacroRow = ({
  label,
  current,
  target,
  color,
  unit = "g",
}: {
  label: string;
  current: number;
  target: number;
  color: string;
  unit?: string;
}) => {
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const remaining = target - current;
  const isOver = remaining < 0;
  const isClose = !isOver && remaining <= target * 0.1;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span
          className={cn(
            "font-semibold tabular-nums",
            isOver
              ? "text-destructive"
              : isClose
              ? "text-yellow-500"
              : "text-emerald-500"
          )}
        >
          {isOver ? "+" : ""}
          {Math.abs(Math.round(remaining))}
          {unit} {isOver ? "over" : "left"}
        </span>
      </div>
      <Progress
        value={pct}
        className="h-2 bg-secondary"
        style={{ "--progress-color": color } as React.CSSProperties}
      />
      <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>
          {Math.round(current)} {unit}
        </span>
        <span>
          / {target} {unit}
        </span>
      </div>
    </div>
  );
};

/* ── Helper: compute percentages from gram targets ── */
function gramsToPercentages(targets: MacroTargets) {
  const pCal = targets.protein * 4;
  const cCal = targets.carbs * 4;
  const fCal = targets.fat * 9;
  const total = pCal + cCal + fCal;
  if (total === 0) return { protein: 40, carbs: 40, fat: 20 };
  return {
    protein: Math.round((pCal / total) * 100),
    carbs: Math.round((cCal / total) * 100),
    fat: Math.round((fCal / total) * 100),
  };
}

/* ── Main sidebar ── */
const MealPlanMacroSidebar = ({
  targets,
  current,
  onTargetsChange,
  clientId,
}: MealPlanMacroSidebarProps) => {
  const isMobile = useIsMobile();
  const [loaded, setLoaded] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [editing, setEditing] = useState(false);

  // Goal editor state
  const [goalType, setGoalType] = useState<GoalType>("full_macros");
  const [calories, setCalories] = useState(targets.calories || 2000);
  const initPcts = useMemo(() => gramsToPercentages(targets), []);
  const [proteinPct, setProteinPct] = useState(initPcts.protein);
  const [carbsPct, setCarbsPct] = useState(initPcts.carbs);
  const [fatPct, setFatPct] = useState(initPcts.fat);

  // Auto-load client nutrition targets
  useEffect(() => {
    if (!clientId || loaded) return;
    const load = async () => {
      const { data } = await supabase
        .from("nutrition_targets")
        .select("calories, protein, carbs, fat")
        .eq("client_id", clientId)
        .order("effective_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        const t = data[0];
        const newTargets = {
          calories: t.calories || 2000,
          protein: t.protein || 150,
          carbs: t.carbs || 200,
          fat: t.fat || 60,
        };
        onTargetsChange(newTargets);
        setCalories(newTargets.calories);
        const pcts = gramsToPercentages(newTargets);
        setProteinPct(pcts.protein);
        setCarbsPct(pcts.carbs);
        setFatPct(pcts.fat);
      }
      setLoaded(true);
    };
    load();
  }, [clientId, loaded]);

  // Sync when external targets change (e.g. from load)
  useEffect(() => {
    if (!editing) {
      setCalories(targets.calories);
      const pcts = gramsToPercentages(targets);
      setProteinPct(pcts.protein);
      setCarbsPct(pcts.carbs);
      setFatPct(pcts.fat);
    }
  }, [targets, editing]);

  // Computed grams from percentages
  const grams = useMemo(
    () => ({
      protein: Math.round((calories * proteinPct) / 100 / 4),
      carbs: Math.round((calories * carbsPct) / 100 / 4),
      fat: Math.round((calories * fatPct) / 100 / 9),
    }),
    [calories, proteinPct, carbsPct, fatPct]
  );

  // Push targets upstream whenever sliders/calories change in edit mode
  const pushTargets = useCallback(
    (cal: number, pP: number, cP: number, fP: number) => {
      const p =
        goalType === "calories_only" ? 0 : Math.round((cal * pP) / 100 / 4);
      const c =
        goalType === "full_macros" ? Math.round((cal * cP) / 100 / 4) : 0;
      const f =
        goalType === "full_macros" ? Math.round((cal * fP) / 100 / 9) : 0;
      onTargetsChange({ calories: cal, protein: p, carbs: c, fat: f });
    },
    [goalType, onTargetsChange]
  );

  // Slider handlers — keep total at 100%
  const handleProteinChange = useCallback(
    (val: number[]) => {
      const newP = val[0];
      const remaining = 100 - newP;
      const oldOther = carbsPct + fatPct;
      let newC: number, newF: number;
      if (oldOther === 0) {
        newC = Math.round(remaining * 0.67);
        newF = remaining - newC;
      } else {
        newC = Math.round((carbsPct / oldOther) * remaining);
        newF = remaining - newC;
      }
      setProteinPct(newP);
      setCarbsPct(newC);
      setFatPct(newF);
      pushTargets(calories, newP, newC, newF);
    },
    [carbsPct, fatPct, calories, pushTargets]
  );

  const handleCarbsChange = useCallback(
    (val: number[]) => {
      const newC = val[0];
      const remaining = 100 - newC;
      const oldOther = proteinPct + fatPct;
      let newP: number, newF: number;
      if (oldOther === 0) {
        newP = Math.round(remaining * 0.67);
        newF = remaining - newP;
      } else {
        newP = Math.round((proteinPct / oldOther) * remaining);
        newF = remaining - newP;
      }
      setProteinPct(newP);
      setCarbsPct(newC);
      setFatPct(newF);
      pushTargets(calories, newP, newC, newF);
    },
    [proteinPct, fatPct, calories, pushTargets]
  );

  const handleFatChange = useCallback(
    (val: number[]) => {
      const newF = val[0];
      const remaining = 100 - newF;
      const oldOther = proteinPct + carbsPct;
      let newP: number, newC: number;
      if (oldOther === 0) {
        newP = Math.round(remaining * 0.5);
        newC = remaining - newP;
      } else {
        newP = Math.round((proteinPct / oldOther) * remaining);
        newC = remaining - newP;
      }
      setProteinPct(newP);
      setCarbsPct(newC);
      setFatPct(newF);
      pushTargets(calories, newP, newC, newF);
    },
    [proteinPct, carbsPct, calories, pushTargets]
  );

  const handleCaloriesChange = (val: number) => {
    setCalories(val);
    pushTargets(val, proteinPct, carbsPct, fatPct);
  };

  const macroBarSegments = [
    { pct: proteinPct, color: "bg-blue-500", label: "Protein" },
    { pct: carbsPct, color: "bg-amber-500", label: "Carbs" },
    { pct: fatPct, color: "bg-rose-500", label: "Fat" },
  ];

  // Overall calorie progress
  const calPct =
    targets.calories > 0
      ? Math.min(Math.round((current.calories / targets.calories) * 100), 100)
      : 0;

  /* ── Mobile compact bar ── */
  if (isMobile) {
    return (
      <div className="sticky top-0 z-20">
        <Card className="rounded-none border-x-0 border-t-0 bg-card/95 backdrop-blur-sm">
          <button
            onClick={() => setMobileExpanded(!mobileExpanded)}
            className="w-full px-4 py-2.5 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <Target className="h-4 w-4 text-primary" />
              <div className="flex items-center gap-2 text-xs font-semibold">
                <span className="text-foreground">
                  {current.calories}/{targets.calories} cal
                </span>
                <span className="text-blue-400">
                  {Math.round(current.protein)}P
                </span>
                <span className="text-amber-400">
                  {Math.round(current.carbs)}C
                </span>
                <span className="text-rose-400">
                  {Math.round(current.fat)}F
                </span>
              </div>
            </div>
            {mobileExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          <Progress value={calPct} className="h-1 rounded-none bg-secondary" />

          {mobileExpanded && (
            <CardContent className="pt-3 pb-4 space-y-3">
              {editing ? (
                <GoalEditor
                  goalType={goalType}
                  setGoalType={setGoalType}
                  calories={calories}
                  onCaloriesChange={handleCaloriesChange}
                  proteinPct={proteinPct}
                  carbsPct={carbsPct}
                  fatPct={fatPct}
                  grams={grams}
                  macroBarSegments={macroBarSegments}
                  onProteinChange={handleProteinChange}
                  onCarbsChange={handleCarbsChange}
                  onFatChange={handleFatChange}
                  onDone={() => setEditing(false)}
                />
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      Nutrition Goal
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs gap-1"
                      onClick={() => setEditing(true)}
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </Button>
                  </div>
                  <MacroRow
                    label="Calories"
                    current={current.calories}
                    target={targets.calories}
                    color="hsl(var(--primary))"
                    unit="cal"
                  />
                  <MacroRow
                    label="Protein"
                    current={current.protein}
                    target={targets.protein}
                    color="hsl(217 91% 60%)"
                  />
                  <MacroRow
                    label="Carbs"
                    current={current.carbs}
                    target={targets.carbs}
                    color="hsl(38 92% 50%)"
                  />
                  <MacroRow
                    label="Fat"
                    current={current.fat}
                    target={targets.fat}
                    color="hsl(347 77% 50%)"
                  />
                </>
              )}
            </CardContent>
          )}
        </Card>
      </div>
    );
  }

  /* ── Desktop sticky sidebar ── */
  return (
    <div className="sticky top-4 space-y-3">
      {/* Goal Editor Card */}
      <Card className="border-primary/20">
        <CardContent className="pt-4 pb-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold text-foreground">
                {editing ? "Set Nutrition Goal" : "Nutrition Goal"}
              </span>
            </div>
            {!editing && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setEditing(true)}
              >
                <Pencil className="h-3 w-3" /> Edit
              </Button>
            )}
          </div>

          {editing ? (
            <GoalEditor
              goalType={goalType}
              setGoalType={setGoalType}
              calories={calories}
              onCaloriesChange={handleCaloriesChange}
              proteinPct={proteinPct}
              carbsPct={carbsPct}
              fatPct={fatPct}
              grams={grams}
              macroBarSegments={macroBarSegments}
              onProteinChange={handleProteinChange}
              onCarbsChange={handleCarbsChange}
              onFatChange={handleFatChange}
              onDone={() => setEditing(false)}
            />
          ) : (
            <>
              {/* Calorie summary */}
              <div className="text-center space-y-1">
                <div className="text-2xl font-bold text-foreground tabular-nums">
                  {current.calories}
                  <span className="text-sm text-muted-foreground font-normal">
                    {" "}
                    / {targets.calories} cal
                  </span>
                </div>
                <Progress value={calPct} className="h-2.5 bg-secondary" />
              </div>

              {/* Macro distribution bar */}
              <div className="flex h-3 rounded-full overflow-hidden">
                {macroBarSegments.map((seg) => (
                  <div
                    key={seg.label}
                    className={`${seg.color} transition-all duration-75`}
                    style={{ width: `${seg.pct}%` }}
                  >
                    {seg.pct >= 15 && (
                      <span className="text-[8px] font-bold text-white flex items-center justify-center h-full">
                        {seg.pct}%
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Remaining progress */}
              <div className="space-y-3">
                <MacroRow
                  label="Protein"
                  current={current.protein}
                  target={targets.protein}
                  color="hsl(217 91% 60%)"
                />
                <MacroRow
                  label="Carbs"
                  current={current.carbs}
                  target={targets.carbs}
                  color="hsl(38 92% 50%)"
                />
                <MacroRow
                  label="Fat"
                  current={current.fat}
                  target={targets.fat}
                  color="hsl(347 77% 50%)"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Fiber / Sugar quick stats */}
      {!editing && (
        <Card>
          <CardContent className="pt-3 pb-3">
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="text-center">
                <div className="text-muted-foreground">Fiber</div>
                <div className="font-semibold text-foreground tabular-nums">
                  {Math.round(current.fiber)}g
                </div>
              </div>
              <div className="text-center">
                <div className="text-muted-foreground">Sugar</div>
                <div className="font-semibold text-foreground tabular-nums">
                  {Math.round(current.sugar)}g
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

/* ── Goal Editor (shared between mobile expanded & desktop) ── */
interface GoalEditorProps {
  goalType: GoalType;
  setGoalType: (t: GoalType) => void;
  calories: number;
  onCaloriesChange: (v: number) => void;
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
  grams: { protein: number; carbs: number; fat: number };
  macroBarSegments: { pct: number; color: string; label: string }[];
  onProteinChange: (v: number[]) => void;
  onCarbsChange: (v: number[]) => void;
  onFatChange: (v: number[]) => void;
  onDone: () => void;
}

const GoalEditor = ({
  goalType,
  setGoalType,
  calories,
  onCaloriesChange,
  proteinPct,
  carbsPct,
  fatPct,
  grams,
  macroBarSegments,
  onProteinChange,
  onCarbsChange,
  onFatChange,
  onDone,
}: GoalEditorProps) => (
  <div className="space-y-4">
    {/* Goal Type */}
    <div>
      <Label className="text-xs">Goal Type</Label>
      <Select value={goalType} onValueChange={(v) => setGoalType(v as GoalType)}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="calories_only">Calories Only</SelectItem>
          <SelectItem value="calories_protein">Calories + Protein</SelectItem>
          <SelectItem value="full_macros">Full Macros</SelectItem>
        </SelectContent>
      </Select>
    </div>

    {/* Calorie Input */}
    <div>
      <Label className="text-xs flex items-center gap-1.5">
        <Flame className="h-3 w-3 text-primary" />
        Calories / Day
      </Label>
      <Input
        type="number"
        value={calories || ""}
        onChange={(e) => onCaloriesChange(parseInt(e.target.value) || 0)}
        className="h-8 text-sm font-bold"
        onFocus={(e) => e.target.select()}
      />
    </div>

    {/* Sliders */}
    {goalType !== "calories_only" && (
      <div className="space-y-3">
        <Label className="text-xs font-semibold">Macro Distribution</Label>

        {/* Visual bar */}
        <div className="flex h-3.5 rounded-full overflow-hidden">
          {macroBarSegments.map((seg) => (
            <div
              key={seg.label}
              className={`${seg.color} transition-all duration-75`}
              style={{ width: `${seg.pct}%` }}
            >
              {seg.pct >= 12 && (
                <span className="text-[8px] font-bold text-white flex items-center justify-center h-full">
                  {seg.pct}%
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Protein slider */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
              <span className="text-xs font-medium">Protein</span>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold">{grams.protein}g</span>
              <span className="text-[10px] text-muted-foreground ml-1">
                {proteinPct}%
              </span>
            </div>
          </div>
          <Slider
            value={[proteinPct]}
            onValueChange={onProteinChange}
            min={5}
            max={70}
            step={1}
            className="[&_[role=slider]]:border-blue-500 [&_span:first-child>span]:bg-blue-500"
          />
        </div>

        {/* Carbs slider */}
        {goalType === "full_macros" && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                <span className="text-xs font-medium">Carbs</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold">{grams.carbs}g</span>
                <span className="text-[10px] text-muted-foreground ml-1">
                  {carbsPct}%
                </span>
              </div>
            </div>
            <Slider
              value={[carbsPct]}
              onValueChange={onCarbsChange}
              min={5}
              max={70}
              step={1}
              className="[&_[role=slider]]:border-amber-500 [&_span:first-child>span]:bg-amber-500"
            />
          </div>
        )}

        {/* Fat slider */}
        {goalType === "full_macros" && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                <span className="text-xs font-medium">Fat</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold">{grams.fat}g</span>
                <span className="text-[10px] text-muted-foreground ml-1">
                  {fatPct}%
                </span>
              </div>
            </div>
            <Slider
              value={[fatPct]}
              onValueChange={onFatChange}
              min={5}
              max={60}
              step={1}
              className="[&_[role=slider]]:border-rose-500 [&_span:first-child>span]:bg-rose-500"
            />
          </div>
        )}

        {/* Live macro preview */}
        <div className="p-3 rounded-lg bg-muted/30 border border-border space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Live Preview
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[
              {
                label: "Protein",
                g: grams.protein,
                pct: proteinPct,
                color: "text-blue-400",
                bg: "bg-blue-500/10",
              },
              {
                label: "Carbs",
                g: goalType === "full_macros" ? grams.carbs : "—",
                pct: goalType === "full_macros" ? carbsPct : "—",
                color: "text-amber-400",
                bg: "bg-amber-500/10",
              },
              {
                label: "Fat",
                g: goalType === "full_macros" ? grams.fat : "—",
                pct: goalType === "full_macros" ? fatPct : "—",
                color: "text-rose-400",
                bg: "bg-rose-500/10",
              },
            ].map((m) => (
              <div
                key={m.label}
                className={`text-center p-2 rounded-md ${m.bg}`}
              >
                <p className={`text-sm font-bold ${m.color}`}>
                  {m.g}
                  {typeof m.g === "number" ? "g" : ""}
                </p>
                <p className="text-[9px] text-muted-foreground">
                  {m.pct}
                  {typeof m.pct === "number" ? "%" : ""}
                </p>
                <p className="text-[9px] text-muted-foreground">{m.label}</p>
              </div>
            ))}
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">Total</p>
            <p className="text-lg font-bold text-primary">
              {calories.toLocaleString()} cal
            </p>
          </div>
        </div>
      </div>
    )}

    <Button size="sm" className="w-full" onClick={onDone}>
      Done
    </Button>
  </div>
);

export default MealPlanMacroSidebar;
