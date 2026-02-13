import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BookmarkIcon, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SavedMeal {
  id: string;
  name: string;
  meal_type: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
}

interface SavedMealsProps {
  onSelectMeal: (meal: SavedMeal) => void;
}

const SavedMeals = ({ onSelectMeal }: SavedMealsProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchMeals = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("saved_meals")
      .select("*")
      .eq("client_id", user.id)
      .order("created_at", { ascending: false });
    setMeals((data as SavedMeal[]) || []);
  };

  useEffect(() => {
    if (open) {
      fetchMeals();
    }
  }, [open, user]);

  const deleteMeal = async (id: string) => {
    setLoading(true);
    const { error } = await supabase
      .from("saved_meals")
      .delete()
      .eq("id", id);
    setLoading(false);

    if (error) {
      toast({ title: "Error deleting meal", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Meal deleted" });
      fetchMeals();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <BookmarkIcon className="h-4 w-4" /> Saved Meals
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Your Saved Meals</DialogTitle>
        </DialogHeader>

        {meals.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            No saved meals yet. Log food and save a meal to use it again.
          </p>
        ) : (
          <div className="space-y-2">
            {meals.map((meal) => (
              <div
                key={meal.id}
                className="flex items-center justify-between rounded-md border border-border bg-card p-3"
              >
                <button
                  onClick={() => {
                    onSelectMeal(meal);
                    setOpen(false);
                  }}
                  className="flex-1 text-left"
                >
                  <div className="font-medium text-foreground text-sm">{meal.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {meal.calories} cal · {meal.protein}P · {meal.carbs}C · {meal.fat}F
                    {meal.fiber ? ` · ${meal.fiber}F` : ""}
                    {meal.sugar ? ` · ${meal.sugar}S` : ""}
                    {meal.sodium ? ` · ${meal.sodium}mg Na` : ""}
                  </div>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteMeal(meal.id)}
                  disabled={loading}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SavedMeals;
