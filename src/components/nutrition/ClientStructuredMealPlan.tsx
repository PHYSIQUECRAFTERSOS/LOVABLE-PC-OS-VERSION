import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronDown, ChevronUp, ClipboardList, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import FoodIcon from "@/lib/foodIcons";

interface MealPlanItem {
  id: string;
  food_item_id: string | null;
  custom_name: string | null;
  meal_name: string;
  gram_amount: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  meal_order: number;
  item_order: number;
  day_id: string | null;
}

interface MealPlanDay {
  id: string;
  day_type: string;
  day_order: number;
}

interface MealPlan {
  id: string;
  name: string;
  flexibility_mode: boolean;
  coach_id: string;
}

const ClientStructuredMealPlan = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [completedMeals, setCompletedMeals] = useState<Set<string>>(new Set());

  const { data: plan } = useQuery({
    queryKey: ["client-structured-plan", user?.id],
    queryFn: async () => {
      // Get the most recent assigned meal plan
      const { data: plans } = await supabase
        .from("meal_plans")
        .select("id, name, flexibility_mode, coach_id")
        .eq("client_id", user!.id)
        .eq("is_template", false)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!plans || plans.length === 0) return null;
      return plans[0] as MealPlan;
    },
    enabled: !!user,
  });

  const { data: days } = useQuery({
    queryKey: ["plan-days", plan?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("meal_plan_days")
        .select("*")
        .eq("meal_plan_id", plan!.id)
        .order("day_order");
      return (data || []) as MealPlanDay[];
    },
    enabled: !!plan,
  });

  const { data: items } = useQuery({
    queryKey: ["plan-items", plan?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("meal_plan_items")
        .select("*")
        .eq("meal_plan_id", plan!.id)
        .order("meal_order")
        .order("item_order");
      return (data || []) as MealPlanItem[];
    },
    enabled: !!plan,
  });

  const logFoodToTracker = async (item: MealPlanItem) => {
    if (!user) return;
    const { error } = await supabase.from("nutrition_logs").insert({
      client_id: user.id,
      food_item_id: item.food_item_id,
      custom_name: item.custom_name,
      meal_type: "custom",
      servings: 1,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${item.custom_name} logged to tracker` });
    }
  };

  const toggleMealComplete = (mealKey: string) => {
    setCompletedMeals((prev) => {
      const next = new Set(prev);
      if (next.has(mealKey)) next.delete(mealKey);
      else next.add(mealKey);
      return next;
    });
  };

  if (!plan) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">
            No structured meal plan assigned yet. Your coach will create one when ready.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!days || !items) return null;

  // Group items by day and meal
  const getItemsForDay = (dayId: string) => {
    const dayItems = items.filter((i) => i.day_id === dayId);
    const mealGroups: Record<string, { name: string; order: number; items: MealPlanItem[] }> = {};
    dayItems.forEach((item) => {
      if (!mealGroups[item.meal_name]) {
        mealGroups[item.meal_name] = { name: item.meal_name, order: item.meal_order, items: [] };
      }
      mealGroups[item.meal_name].items.push(item);
    });
    return Object.values(mealGroups).sort((a, b) => a.order - b.order);
  };

  const getDayTotals = (dayId: string) => {
    const dayItems = items.filter((i) => i.day_id === dayId);
    return dayItems.reduce(
      (acc, i) => ({
        calories: acc.calories + i.calories,
        protein: acc.protein + i.protein,
        carbs: acc.carbs + i.carbs,
        fat: acc.fat + i.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">{plan.name}</h3>
        {plan.flexibility_mode && (
          <Badge variant="secondary" className="text-xs">Flex Mode</Badge>
        )}
      </div>

      {days.map((day) => {
        const isExpanded = expandedDay === day.id;
        const totals = getDayTotals(day.id);
        const meals = getItemsForDay(day.id);

        return (
          <Card key={day.id}>
            <button
              onClick={() => setExpandedDay(isExpanded ? null : day.id)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors"
            >
              <span className="text-sm font-semibold text-foreground">{day.day_type}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {totals.calories}cal · {totals.protein}P · {totals.carbs}C · {totals.fat}F
                </span>
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </button>

            {isExpanded && (
              <CardContent className="pt-0 space-y-3">
                {meals.map((meal) => {
                  const mealKey = `${day.id}::${meal.name}`;
                  const isComplete = completedMeals.has(mealKey);
                  const mealTotals = meal.items.reduce(
                    (acc, i) => ({
                      calories: acc.calories + i.calories,
                      protein: acc.protein + i.protein,
                      carbs: acc.carbs + i.carbs,
                      fat: acc.fat + i.fat,
                    }),
                    { calories: 0, protein: 0, carbs: 0, fat: 0 }
                  );

                  return (
                    <div key={mealKey} className={cn(
                      "rounded-lg border overflow-hidden transition-opacity",
                      isComplete ? "border-primary/30 opacity-60" : "border-border"
                    )}>
                      <div className="flex items-center justify-between px-3 py-2 bg-secondary/30">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleMealComplete(mealKey)}
                            className={cn(
                              "h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors",
                              isComplete ? "bg-primary border-primary" : "border-muted-foreground/30"
                            )}
                          >
                            {isComplete && <Check className="h-3 w-3 text-primary-foreground" />}
                          </button>
                          <span className="text-xs font-semibold text-foreground">{meal.name}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {mealTotals.calories}cal · {mealTotals.protein}P · {mealTotals.carbs}C · {mealTotals.fat}F
                        </span>
                      </div>
                      <div className="divide-y divide-border/30">
                        {meal.items.map((item) => (
                          <div key={item.id} className="flex items-center gap-2 px-3 py-2">
                            <FoodIcon name={item.custom_name || ""} size={26} />
                            <div className="flex-1 min-w-0">
                              <span className="text-xs text-foreground">{item.custom_name}</span>
                              <span className="text-[10px] text-muted-foreground ml-2">{item.gram_amount}g</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              {item.calories}cal
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => logFoodToTracker(item)}
                              title="Log to tracker"
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
};

export default ClientStructuredMealPlan;
