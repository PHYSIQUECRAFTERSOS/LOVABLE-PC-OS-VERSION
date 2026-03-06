import { useState } from "react";
import {
  FrequentMealTemplate,
  dismissFrequentMeal,
  pinFrequentMeal,
} from "@/services/mealTemplateService";
import { Button } from "@/components/ui/button";
import { Pin, X, Repeat } from "lucide-react";

interface Props {
  template: FrequentMealTemplate;
  onLogMeal: (foods: FrequentMealTemplate["foods"]) => void;
  onDismiss: (id: string) => void;
}

export function FrequentMealCard({ template, onLogMeal, onDismiss }: Props) {
  const [pinned, setPinned] = useState(template.is_pinned);

  const handlePin = async () => {
    const next = !pinned;
    setPinned(next);
    await pinFrequentMeal(template.id, next);
  };

  const handleDismiss = async () => {
    await dismissFrequentMeal(template.id);
    onDismiss(template.id);
  };

  const cal = template.total_cal ?? 0;
  const prot = template.total_protein ?? 0;
  const carb = template.total_carbs ?? 0;
  const fat = template.total_fat ?? 0;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Repeat className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-sm font-medium text-foreground truncate">
              {template.template_name}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Logged {template.occurrence_count}× · {Math.round(cal)} cal · {Math.round(prot)}P · {Math.round(carb)}C · {Math.round(fat)}F
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={handlePin} className="p-1 rounded hover:bg-secondary">
            <Pin className={`h-3 w-3 ${pinned ? "text-primary fill-primary" : "text-muted-foreground"}`} />
          </button>
          <button onClick={handleDismiss} className="p-1 rounded hover:bg-secondary">
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {template.foods.map((food, i) => (
          <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
            {food.name.split(" ").slice(0, 3).join(" ")}
          </span>
        ))}
      </div>

      <Button
        size="sm"
        onClick={() => onLogMeal(template.foods)}
        className="w-full h-8 text-xs"
      >
        Log This Meal
      </Button>
    </div>
  );
}
