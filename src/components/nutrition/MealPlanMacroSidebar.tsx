import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Target, Pencil, Check, ChevronDown, ChevronUp } from "lucide-react";
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
        style={
          {
            "--progress-color": color,
          } as React.CSSProperties
        }
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

const MealPlanMacroSidebar = ({
  targets,
  current,
  onTargetsChange,
  clientId,
}: MealPlanMacroSidebarProps) => {
  const isMobile = useIsMobile();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MacroTargets>(targets);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Auto-load client nutrition targets as defaults
  useEffect(() => {
    if (!clientId || loaded) return;
    const loadClientTargets = async () => {
      const { data } = await supabase
        .from("nutrition_targets")
        .select("calories, protein_g, carbs_g, fat_g")
        .eq("client_id", clientId)
        .order("effective_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        const t = data[0];
        const newTargets = {
          calories: t.calories || 2000,
          protein: t.protein_g || 150,
          carbs: t.carbs_g || 200,
          fat: t.fat_g || 60,
        };
        onTargetsChange(newTargets);
        setDraft(newTargets);
      }
      setLoaded(true);
    };
    loadClientTargets();
  }, [clientId, loaded]);

  useEffect(() => {
    setDraft(targets);
  }, [targets]);

  const handleSave = () => {
    onTargetsChange(draft);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(targets);
    setEditing(false);
  };

  // Macro percentage breakdown
  const totalMacroCals =
    targets.protein * 4 + targets.carbs * 4 + targets.fat * 9;
  const pctP =
    totalMacroCals > 0
      ? Math.round((targets.protein * 4 * 100) / totalMacroCals)
      : 0;
  const pctC =
    totalMacroCals > 0
      ? Math.round((targets.carbs * 4 * 100) / totalMacroCals)
      : 0;
  const pctF = totalMacroCals > 0 ? 100 - pctP - pctC : 0;

  // Overall calorie progress
  const calPct =
    targets.calories > 0
      ? Math.min(Math.round((current.calories / targets.calories) * 100), 100)
      : 0;

  // Mobile compact bar
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
                <span className="text-red-400">
                  {Math.round(current.protein)}P
                </span>
                <span className="text-blue-400">
                  {Math.round(current.carbs)}C
                </span>
                <span className="text-yellow-400">
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
                <EditForm
                  draft={draft}
                  setDraft={setDraft}
                  onSave={handleSave}
                  onCancel={handleCancel}
                />
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      Daily Targets
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
                    color="hsl(0 70% 60%)"
                  />
                  <MacroRow
                    label="Carbs"
                    current={current.carbs}
                    target={targets.carbs}
                    color="hsl(210 70% 60%)"
                  />
                  <MacroRow
                    label="Fat"
                    current={current.fat}
                    target={targets.fat}
                    color="hsl(45 70% 50%)"
                  />
                </>
              )}
            </CardContent>
          )}
        </Card>
      </div>
    );
  }

  // Desktop sticky sidebar
  return (
    <div className="sticky top-4 space-y-3">
      <Card className="border-primary/20">
        <CardContent className="pt-4 pb-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold text-foreground">
                Plan Targets
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
            <EditForm
              draft={draft}
              setDraft={setDraft}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          ) : (
            <>
              {/* Calorie ring / big number */}
              <div className="text-center space-y-1">
                <div className="text-2xl font-bold text-foreground tabular-nums">
                  {current.calories}
                  <span className="text-sm text-muted-foreground font-normal">
                    {" "}
                    / {targets.calories} cal
                  </span>
                </div>
                <Progress
                  value={calPct}
                  className="h-2.5 bg-secondary"
                />
                <div className="flex justify-center gap-4 text-[10px] text-muted-foreground">
                  <span>{pctP}% P</span>
                  <span>{pctC}% C</span>
                  <span>{pctF}% F</span>
                </div>
              </div>

              <div className="space-y-3">
                <MacroRow
                  label="Protein"
                  current={current.protein}
                  target={targets.protein}
                  color="hsl(0 70% 60%)"
                />
                <MacroRow
                  label="Carbs"
                  current={current.carbs}
                  target={targets.carbs}
                  color="hsl(210 70% 60%)"
                />
                <MacroRow
                  label="Fat"
                  current={current.fat}
                  target={targets.fat}
                  color="hsl(45 70% 50%)"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Quick stats */}
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

const EditForm = ({
  draft,
  setDraft,
  onSave,
  onCancel,
}: {
  draft: MacroTargets;
  setDraft: (d: MacroTargets) => void;
  onSave: () => void;
  onCancel: () => void;
}) => (
  <div className="space-y-3">
    <div>
      <Label className="text-xs">Calories</Label>
      <Input
        type="number"
        value={draft.calories || ""}
        onChange={(e) =>
          setDraft({ ...draft, calories: parseInt(e.target.value) || 0 })
        }
        className="h-8 text-sm"
        onFocus={(e) => e.target.select()}
      />
    </div>
    <div>
      <Label className="text-xs">Protein (g)</Label>
      <Input
        type="number"
        value={draft.protein || ""}
        onChange={(e) =>
          setDraft({ ...draft, protein: parseInt(e.target.value) || 0 })
        }
        className="h-8 text-sm"
        onFocus={(e) => e.target.select()}
      />
    </div>
    <div>
      <Label className="text-xs">Carbs (g)</Label>
      <Input
        type="number"
        value={draft.carbs || ""}
        onChange={(e) =>
          setDraft({ ...draft, carbs: parseInt(e.target.value) || 0 })
        }
        className="h-8 text-sm"
        onFocus={(e) => e.target.select()}
      />
    </div>
    <div>
      <Label className="text-xs">Fat (g)</Label>
      <Input
        type="number"
        value={draft.fat || ""}
        onChange={(e) =>
          setDraft({ ...draft, fat: parseInt(e.target.value) || 0 })
        }
        className="h-8 text-sm"
        onFocus={(e) => e.target.select()}
      />
    </div>
    <div className="flex gap-2">
      <Button size="sm" className="flex-1 gap-1" onClick={onSave}>
        <Check className="h-3 w-3" /> Set
      </Button>
      <Button size="sm" variant="ghost" className="flex-1" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  </div>
);

export default MealPlanMacroSidebar;
