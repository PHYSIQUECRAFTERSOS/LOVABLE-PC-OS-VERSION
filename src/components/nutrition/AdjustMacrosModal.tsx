import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ArrowRight, Scale, TrendingDown, TrendingUp, Zap } from "lucide-react";

interface MealFood {
  id: string;
  food_item_id: string;
  food_name: string;
  brand: string | null;
  gram_amount: number;
  cal_per_100: number;
  protein_per_100: number;
  carbs_per_100: number;
  fat_per_100: number;
  fiber_per_100: number;
  sugar_per_100: number;
}

interface Meal {
  id: string;
  name: string;
  foods: MealFood[];
}

interface DayType {
  id: string;
  type: string;
  meals: Meal[];
}

interface AdjustMacrosModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  days: DayType[];
  onApply: (newDays: DayType[]) => void;
}

// Classify food by dominant macro (per 100g)
const classifyFood = (f: MealFood): "protein" | "carb" | "fat" => {
  const protCal = f.protein_per_100 * 4;
  const carbCal = f.carbs_per_100 * 4;
  const fatCal = f.fat_per_100 * 9;
  if (protCal >= carbCal && protCal >= fatCal) return "protein";
  if (fatCal >= carbCal) return "fat";
  return "carb";
};

const MIN_GRAMS: Record<string, number> = { protein: 50, carb: 30, fat: 5 };

const calcTotals = (days: DayType[]) => {
  let calories = 0, protein = 0, carbs = 0, fat = 0;
  for (const day of days) {
    for (const meal of day.meals) {
      for (const food of meal.foods) {
        const m = food.gram_amount / 100;
        calories += food.cal_per_100 * m;
        protein += food.protein_per_100 * m;
        carbs += food.carbs_per_100 * m;
        fat += food.fat_per_100 * m;
      }
    }
  }
  return {
    calories: Math.round(calories),
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fat),
  };
};

const QUICK_PRESETS = [
  { label: "Cut 15%", factor: 0.85, icon: TrendingDown, color: "text-red-400" },
  { label: "Cut 10%", factor: 0.90, icon: TrendingDown, color: "text-orange-400" },
  { label: "Cut 5%", factor: 0.95, icon: TrendingDown, color: "text-yellow-400" },
  { label: "Bulk 5%", factor: 1.05, icon: TrendingUp, color: "text-green-400" },
  { label: "Bulk 10%", factor: 1.10, icon: TrendingUp, color: "text-emerald-400" },
  { label: "Bulk 15%", factor: 1.15, icon: TrendingUp, color: "text-teal-400" },
];

const AdjustMacrosModal = ({ open, onOpenChange, days, onApply }: AdjustMacrosModalProps) => {
  const current = useMemo(() => calcTotals(days), [days]);

  const [targetCalories, setTargetCalories] = useState(current.calories);
  const [targetProtein, setTargetProtein] = useState(current.protein);
  const [targetCarbs, setTargetCarbs] = useState(current.carbs);
  const [targetFat, setTargetFat] = useState(current.fat);
  const [preserveProtein, setPreserveProtein] = useState(true);

  // Reset when opened
  const handleOpenChange = (o: boolean) => {
    if (o) {
      const c = calcTotals(days);
      setTargetCalories(c.calories);
      setTargetProtein(c.protein);
      setTargetCarbs(c.carbs);
      setTargetFat(c.fat);
      setPreserveProtein(true);
    }
    onOpenChange(o);
  };

  const applyPreset = (factor: number) => {
    setTargetCalories(Math.round(current.calories * factor));
    if (!preserveProtein) {
      setTargetProtein(Math.round(current.protein * factor));
    }
    setTargetCarbs(Math.round(current.carbs * factor));
    setTargetFat(Math.round(current.fat * factor));
  };

  // Compute scaled preview
  const preview = useMemo(() => {
    if (current.calories === 0) return current;

    // If preserving protein, scale carbs and fats to hit calorie target
    if (preserveProtein) {
      const proteinCals = targetProtein * 4;
      const remainingCals = targetCalories - proteinCals;
      const currentNonProteinCals = (current.carbs * 4) + (current.fat * 9);

      if (currentNonProteinCals > 0 && remainingCals > 0) {
        const carbRatio = (current.carbs * 4) / currentNonProteinCals;
        const newCarbCals = remainingCals * carbRatio;
        const newFatCals = remainingCals * (1 - carbRatio);
        return {
          calories: targetCalories,
          protein: targetProtein,
          carbs: Math.round(newCarbCals / 4),
          fat: Math.round(newFatCals / 9),
        };
      }
    }

    return {
      calories: targetCalories,
      protein: targetProtein,
      carbs: targetCarbs,
      fat: targetFat,
    };
  }, [targetCalories, targetProtein, targetCarbs, targetFat, preserveProtein, current]);

  const handleApply = () => {
    if (current.calories === 0) return;

    const newDays = days.map(day => ({
      ...day,
      meals: day.meals.map(meal => ({
        ...meal,
        foods: meal.foods.map(food => {
          const category = classifyFood(food);
          let scaleFactor: number;

          if (preserveProtein && category === "protein") {
            // Scale protein foods by protein ratio
            scaleFactor = current.protein > 0 ? preview.protein / current.protein : 1;
          } else if (preserveProtein) {
            // Scale non-protein foods by non-protein calorie ratio
            const currentNonProteinCals = (current.carbs * 4) + (current.fat * 9);
            const newNonProteinCals = (preview.carbs * 4) + (preview.fat * 9);
            scaleFactor = currentNonProteinCals > 0 ? newNonProteinCals / currentNonProteinCals : 1;
          } else {
            scaleFactor = current.calories > 0 ? targetCalories / current.calories : 1;
          }

          const newGrams = Math.round(food.gram_amount * scaleFactor);
          const minGrams = MIN_GRAMS[category] || 5;
          const clampedGrams = Math.max(minGrams, newGrams);

          return { ...food, gram_amount: clampedGrams };
        }),
      })),
    }));

    onApply(newDays);
    onOpenChange(false);
  };

  const calDiff = preview.calories - current.calories;
  const calPct = current.calories > 0 ? Math.round((calDiff / current.calories) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" /> Adjust Client Macros
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Quick Presets */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Quick Adjust</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {QUICK_PRESETS.map(preset => (
                <button
                  key={preset.label}
                  onClick={() => applyPreset(preset.factor)}
                  className="flex items-center justify-center gap-1 py-2 rounded-lg border border-border text-xs font-medium hover:bg-secondary/60 transition-colors"
                >
                  <preset.icon className={cn("h-3 w-3", preset.color)} />
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Protein Priority Toggle */}
          <label className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 cursor-pointer hover:bg-secondary/30 transition-colors">
            <input
              type="checkbox"
              checked={preserveProtein}
              onChange={(e) => setPreserveProtein(e.target.checked)}
              className="rounded"
            />
            <div>
              <span className="text-sm font-medium text-foreground">Preserve Protein</span>
              <p className="text-[10px] text-muted-foreground">Reduce carbs & fats first, maintain protein foods</p>
            </div>
          </label>

          {/* Target Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Target Calories</Label>
              <Input
                type="number"
                value={targetCalories}
                onChange={(e) => setTargetCalories(parseInt(e.target.value) || 0)}
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs">Target Protein (g)</Label>
              <Input
                type="number"
                value={targetProtein}
                onChange={(e) => setTargetProtein(parseInt(e.target.value) || 0)}
                className="h-9"
                disabled={preserveProtein}
              />
            </div>
            <div>
              <Label className="text-xs">Target Carbs (g)</Label>
              <Input
                type="number"
                value={preview.carbs}
                onChange={(e) => setTargetCarbs(parseInt(e.target.value) || 0)}
                className="h-9"
                disabled={preserveProtein}
              />
            </div>
            <div>
              <Label className="text-xs">Target Fat (g)</Label>
              <Input
                type="number"
                value={preview.fat}
                onChange={(e) => setTargetFat(parseInt(e.target.value) || 0)}
                className="h-9"
                disabled={preserveProtein}
              />
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">Preview</span>
              {calDiff !== 0 && (
                <Badge variant={calDiff < 0 ? "destructive" : "default"} className="text-[10px]">
                  {calDiff > 0 ? "+" : ""}{calDiff} cal ({calPct > 0 ? "+" : ""}{calPct}%)
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { label: "Calories", before: current.calories, after: preview.calories, color: "text-foreground" },
                { label: "Protein", before: current.protein, after: preview.protein, suffix: "g", color: "text-red-400" },
                { label: "Carbs", before: current.carbs, after: preview.carbs, suffix: "g", color: "text-blue-400" },
                { label: "Fat", before: current.fat, after: preview.fat, suffix: "g", color: "text-yellow-400" },
              ].map(m => (
                <div key={m.label}>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{m.label}</p>
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-xs text-muted-foreground">{m.before}{m.suffix}</span>
                    <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                    <span className={cn("text-xs font-bold", m.color)}>{m.after}{m.suffix}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Apply */}
          <Button onClick={handleApply} className="w-full gap-2" disabled={current.calories === 0}>
            <Zap className="h-4 w-4" />
            Apply Adjustment
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AdjustMacrosModal;
