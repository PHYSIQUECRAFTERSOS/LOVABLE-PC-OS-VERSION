import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getFrequentMeals, FrequentMealTemplate } from "@/services/mealTemplateService";
import { FrequentMealCard } from "./FrequentMealCard";

interface Props {
  mealName: string;
  onLogMeal: (foods: FrequentMealTemplate["foods"]) => void;
}

export function FrequentMealsSection({ mealName, onLogMeal }: Props) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<FrequentMealTemplate[]>([]);

  useEffect(() => {
    if (!user?.id || !mealName) return;
    getFrequentMeals(user.id, mealName).then(setTemplates);
  }, [user?.id, mealName]);

  const handleDismiss = (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
  };

  if (templates.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        🔄 Frequent Meals
      </p>
      <div className="space-y-2">
        {templates.map(t => (
          <FrequentMealCard
            key={t.id}
            template={t}
            onLogMeal={onLogMeal}
            onDismiss={handleDismiss}
          />
        ))}
      </div>
    </div>
  );
}
