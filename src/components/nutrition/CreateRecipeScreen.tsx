import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Trash2, ChefHat } from "lucide-react";
import { getFoodEmoji } from "@/utils/foodEmoji";
import AddFoodScreen from "./AddFoodScreen";

interface Ingredient {
  id: string;
  food_name: string;
  brand: string;
  quantity: number;
  serving_size: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface CreateRecipeScreenProps {
  onClose: () => void;
  onSaved: () => void;
}

const CreateRecipeScreen = ({ onClose, onSaved }: CreateRecipeScreenProps) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [servings, setServings] = useState("1");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [showIngredientSearch, setShowIngredientSearch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const totals = ingredients.reduce(
    (acc, ing) => ({
      calories: acc.calories + (ing.calories || 0),
      protein: acc.protein + (ing.protein || 0),
      carbs: acc.carbs + (ing.carbs || 0),
      fat: acc.fat + (ing.fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const numServings = parseFloat(servings) || 1;
  const perServing = {
    calories: Math.round(totals.calories / numServings),
    protein: Math.round(totals.protein / numServings),
    carbs: Math.round(totals.carbs / numServings),
    fat: Math.round(totals.fat / numServings),
  };

  const addIngredient = (food: any) => {
    setIngredients((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        food_name: food.name || food.custom_name || "Unknown",
        brand: food.brand || "",
        quantity: 1,
        serving_size: `${food.serving_size || 100}${food.serving_unit || "g"}`,
        calories: food.calories || 0,
        protein: food.protein || 0,
        carbs: food.carbs || 0,
        fat: food.fat || 0,
      },
    ]);
    setShowIngredientSearch(false);
  };

  const removeIngredient = (id: string) => {
    setIngredients((prev) => prev.filter((i) => i.id !== id));
  };

  const handleSave = async () => {
    if (!user) return;
    if (!name.trim()) { setError("Please enter a recipe name"); return; }
    if (ingredients.length === 0) { setError("Add at least one ingredient"); return; }

    setSaving(true);
    setError("");
    try {
      const { data: recipe, error: recipeError } = await supabase
        .from("client_recipes")
        .insert({
          client_id: user.id,
          name: name.trim(),
          servings: numServings,
          total_calories: totals.calories,
          total_protein: totals.protein,
          total_carbs: totals.carbs,
          total_fat: totals.fat,
          calories_per_serving: perServing.calories,
          protein_per_serving: perServing.protein,
          carbs_per_serving: perServing.carbs,
          fat_per_serving: perServing.fat,
        } as any)
        .select("id")
        .single();

      if (recipeError) throw recipeError;

      const ingredientRows = ingredients.map((ing) => ({
        recipe_id: recipe.id,
        food_name: ing.food_name,
        brand: ing.brand || null,
        quantity: ing.quantity,
        serving_size: ing.serving_size,
        calories: ing.calories,
        protein: ing.protein,
        carbs: ing.carbs,
        fat: ing.fat,
      }));

      const { error: ingError } = await supabase
        .from("client_recipe_ingredients")
        .insert(ingredientRows as any);

      if (ingError) throw ingError;

      toast({ title: "Recipe saved!" });
      onSaved();
    } catch (err: any) {
      console.error("Save recipe error:", err);
      setError(err.message || "Failed to save recipe");
    } finally {
      setSaving(false);
    }
  };

  if (showIngredientSearch) {
    return (
      <AddFoodScreen
        mealType="ingredient"
        mealLabel="Add Ingredient"
        open={true}
        onClose={() => setShowIngredientSearch(false)}
        onLogged={() => {}}
      />
    );
  }

  const canSave = name.trim() && ingredients.length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border">
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="flex-1 text-center text-base font-semibold text-foreground">Add Recipe</h1>
        <button
          onClick={handleSave}
          disabled={saving || !canSave}
          className="text-sm font-semibold text-primary disabled:text-muted-foreground"
        >
          {saving ? "..." : "Save"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Recipe Info */}
        <div className="px-4 py-2 bg-secondary/30">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recipe Information</span>
        </div>
        <div className="divide-y divide-border/50">
          <div className="flex items-center justify-between px-4 py-3.5">
            <span className="text-sm text-foreground">Title</span>
            <Input
              placeholder="Recipe Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="max-w-[200px] h-8 text-sm text-right bg-transparent border-0 focus-visible:ring-0 placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <span className="text-sm text-foreground">Servings</span>
            <Input
              type="number"
              inputMode="decimal"
              placeholder="1"
              value={servings}
              onChange={(e) => setServings(e.target.value)}
              className="max-w-[80px] h-8 text-sm text-right bg-transparent border-0 focus-visible:ring-0"
            />
          </div>
        </div>

        {/* Ingredients */}
        <div className="px-4 py-2 bg-secondary/30 mt-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Ingredients</span>
        </div>

        {ingredients.map((ing) => (
          <div key={ing.id} className="flex items-center gap-3 px-4 py-3 border-b border-border/30">
            <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-base">
              {getFoodEmoji({ name: ing.food_name } as any)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground truncate">{ing.food_name}</div>
              <div className="text-xs text-muted-foreground">
                {ing.calories} cal · {ing.serving_size}
              </div>
            </div>
            <button
              onClick={() => removeIngredient(ing.id)}
              className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </button>
          </div>
        ))}

        <button
          onClick={() => setShowIngredientSearch(true)}
          className="flex items-center gap-2 px-4 py-3.5 w-full text-left text-primary font-semibold text-sm hover:bg-secondary/50 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Ingredient
        </button>

        {/* Live Totals */}
        {ingredients.length > 0 && (
          <div className="mx-4 mt-4 rounded-xl bg-card border border-border/50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Totals</div>
            <div className="flex justify-between text-center">
              <div>
                <div className="text-lg font-bold text-foreground">{totals.calories}</div>
                <div className="text-[10px] text-muted-foreground">Total Cal</div>
              </div>
              <div>
                <div className="text-lg font-bold text-foreground">{perServing.calories}</div>
                <div className="text-[10px] text-muted-foreground">Per Serving</div>
              </div>
              <div>
                <div className="text-lg font-bold text-red-400">{perServing.protein}g</div>
                <div className="text-[10px] text-muted-foreground">Protein</div>
              </div>
              <div>
                <div className="text-lg font-bold text-blue-400">{perServing.carbs}g</div>
                <div className="text-[10px] text-muted-foreground">Carbs</div>
              </div>
              <div>
                <div className="text-lg font-bold text-primary">{perServing.fat}g</div>
                <div className="text-[10px] text-muted-foreground">Fat</div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive px-4 pt-3">{error}</p>
        )}

        {/* Save Button */}
        <div className="px-4 py-6">
          <Button
            onClick={handleSave}
            disabled={saving || !canSave}
            className="w-full h-12 text-base font-bold rounded-xl"
          >
            <ChefHat className="h-5 w-5 mr-2" />
            {saving ? "Saving..." : "Save Recipe"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CreateRecipeScreen;
