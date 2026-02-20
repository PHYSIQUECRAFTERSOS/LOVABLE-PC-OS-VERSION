import { RotateCcw, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface QuickAddItem {
  id: string;
  food_item_id: string | null;
  custom_name: string | null;
  meal_type: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar: number | null;
  sodium: number | null;
  servings: number;
}

interface QuickAddSuggestion {
  type: "yesterday" | "usual";
  label: string;
  calories: number;
  items: QuickAddItem[];
}

interface QuickAddPreviousMealProps {
  mealType: string;
  suggestion: QuickAddSuggestion | null;
  onQuickAdd: (mealType: string, items: QuickAddItem[]) => Promise<boolean>;
  onLogged: () => void;
}

const QuickAddPreviousMeal = ({ mealType, suggestion, onQuickAdd, onLogged }: QuickAddPreviousMealProps) => {
  const { toast } = useToast();

  if (!suggestion) return null;

  const handleTap = async () => {
    const success = await onQuickAdd(mealType, suggestion.items);
    if (success) {
      toast({ title: `${suggestion.items.length} item${suggestion.items.length > 1 ? "s" : ""} added` });
      onLogged();
    } else {
      toast({ title: "Failed to add", variant: "destructive" });
    }
  };

  const Icon = suggestion.type === "usual" ? Zap : RotateCcw;

  return (
    <button
      onClick={handleTap}
      className={cn(
        "flex items-center gap-2 w-full px-4 py-2 text-xs transition-colors",
        "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
        "border-b border-border/20"
      )}
    >
      <Icon className="h-3 w-3 shrink-0 text-primary/70" />
      <span className="truncate">
        {suggestion.label} — <span className="font-medium">{suggestion.calories} cal</span>
      </span>
    </button>
  );
};

export default QuickAddPreviousMeal;
