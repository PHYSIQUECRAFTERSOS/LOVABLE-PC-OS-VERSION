import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Search, ChefHat, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import FoodIcon from "@/lib/foodIcons";

interface FoodItem {
  id: string;
  name: string;
  brand: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  serving_size: number;
}

interface Ingredient {
  id: string;
  food: FoodItem;
  gram_amount: number;
}

const RecipeBuilder = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [recipeName, setRecipeName] = useState("");
  const [description, setDescription] = useState("");
  const [totalWeight, setTotalWeight] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<FoodItem[]>([]);
  const [saving, setSaving] = useState(false);

  // Fetch existing recipes
  const { data: recipes } = useQuery({
    queryKey: ["recipes", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("recipes")
        .select("*")
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const handleSearch = async (q: string) => {
    setSearch(q);
    if (q.length < 2) { setResults([]); return; }
    const { data } = await supabase
      .from("food_items")
      .select("id, name, brand, calories, protein, carbs, fat, fiber, sugar, serving_size")
      .ilike("name", `%${q}%`)
      .order("is_verified", { ascending: false })
      .limit(10);
    setResults((data as FoodItem[]) || []);
  };

  const addIngredient = (food: FoodItem) => {
    setIngredients((prev) => [
      ...prev,
      { id: crypto.randomUUID(), food, gram_amount: food.serving_size || 100 },
    ]);
    setSearch("");
    setResults([]);
  };

  const updateIngredientGrams = (id: string, grams: number) => {
    setIngredients((prev) => prev.map((i) => (i.id === id ? { ...i, gram_amount: grams } : i)));
  };

  const removeIngredient = (id: string) => {
    setIngredients((prev) => prev.filter((i) => i.id !== id));
  };

  // Calculate totals from all ingredients
  const rawTotals = ingredients.reduce(
    (acc, ing) => {
      const m = ing.gram_amount / ing.food.serving_size;
      return {
        calories: acc.calories + ing.food.calories * m,
        protein: acc.protein + ing.food.protein * m,
        carbs: acc.carbs + ing.food.carbs * m,
        fat: acc.fat + ing.food.fat * m,
        fiber: acc.fiber + (ing.food.fiber || 0) * m,
        sugar: acc.sugar + (ing.food.sugar || 0) * m,
        weight: acc.weight + ing.gram_amount,
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, weight: 0 }
  );

  const effectiveWeight = parseFloat(totalWeight) || rawTotals.weight;
  const per100g = effectiveWeight > 0
    ? {
        calories: Math.round((rawTotals.calories / effectiveWeight) * 100),
        protein: +((rawTotals.protein / effectiveWeight) * 100).toFixed(1),
        carbs: +((rawTotals.carbs / effectiveWeight) * 100).toFixed(1),
        fat: +((rawTotals.fat / effectiveWeight) * 100).toFixed(1),
        fiber: +((rawTotals.fiber / effectiveWeight) * 100).toFixed(1),
        sugar: +((rawTotals.sugar / effectiveWeight) * 100).toFixed(1),
      }
    : { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 };

  const handleSave = async () => {
    if (!user || !recipeName || ingredients.length === 0) return;
    setSaving(true);

    try {
      const { data: recipe, error } = await supabase
        .from("recipes")
        .insert({
          name: recipeName,
          description: description || null,
          total_weight_g: effectiveWeight,
          calories_per_100g: per100g.calories,
          protein_per_100g: per100g.protein,
          carbs_per_100g: per100g.carbs,
          fat_per_100g: per100g.fat,
          fiber_per_100g: per100g.fiber,
          sugar_per_100g: per100g.sugar,
          created_by: user.id,
          is_public: isPublic,
        })
        .select("id")
        .single();

      if (error || !recipe) throw error;

      const ingredientRows = ingredients.map((ing, idx) => ({
        recipe_id: recipe.id,
        food_item_id: ing.food.id,
        gram_amount: ing.gram_amount,
        ingredient_order: idx,
      }));

      await supabase.from("recipe_ingredients").insert(ingredientRows);

      // Also save as a food_item so it's searchable in meal plans and tracker
      await supabase.from("food_items").insert({
        name: `🍳 ${recipeName}`,
        serving_size: 100,
        serving_unit: "g",
        calories: per100g.calories,
        protein: per100g.protein,
        carbs: per100g.carbs,
        fat: per100g.fat,
        fiber: per100g.fiber,
        sugar: per100g.sugar,
        created_by: user.id,
        data_source: "recipe",
        is_verified: false,
      });

      toast({ title: "Recipe saved!" });
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      setRecipeName("");
      setDescription("");
      setTotalWeight("");
      setIngredients([]);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ChefHat className="h-5 w-5" /> Recipe Builder
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Recipe Name</Label>
              <Input value={recipeName} onChange={(e) => setRecipeName(e.target.value)} placeholder="e.g. Protein Overnight Oats" />
            </div>
            <div>
              <Label>Total Cooked Weight (g) <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                type="number"
                value={totalWeight}
                onChange={(e) => setTotalWeight(e.target.value)}
                placeholder={`Auto: ${Math.round(rawTotals.weight)}g`}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
            <Label className="text-sm">Available to all coaches</Label>
          </div>

          {/* Add ingredient search */}
          <div className="space-y-2">
            <Label>Ingredients</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search food to add..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {results.length > 0 && (
              <div className="max-h-36 overflow-y-auto space-y-0.5 rounded border border-border p-1">
                {results.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => addIngredient(f)}
                    className="w-full text-left rounded px-2 py-1.5 text-xs hover:bg-secondary transition-colors flex items-center gap-2"
                  >
                    <FoodIcon name={f.name} size={24} />
                    <span className="font-medium text-foreground">{f.name}</span>
                    {f.brand && <span className="text-muted-foreground ml-1">({f.brand})</span>}
                    <span className="text-muted-foreground ml-2">
                      {f.calories}cal / {f.serving_size}g
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Ingredients list */}
          {ingredients.length > 0 && (
            <div className="space-y-1 rounded-lg border border-border divide-y divide-border/50">
              {ingredients.map((ing) => {
                const m = ing.gram_amount / ing.food.serving_size;
                return (
                   <div key={ing.id} className="flex items-center gap-2 px-3 py-2">
                    <FoodIcon name={ing.food.name} size={26} />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-foreground truncate block">{ing.food.name}</span>
                    </div>
                    <Input
                      type="number"
                      min="1"
                      value={ing.gram_amount}
                      onChange={(e) => updateIngredientGrams(ing.id, parseFloat(e.target.value) || 0)}
                      className="h-6 w-16 text-[11px] text-center bg-secondary border-0 rounded"
                    />
                    <span className="text-[10px] text-muted-foreground">g</span>
                    <span className="text-[10px] text-muted-foreground hidden sm:inline">
                      {Math.round(ing.food.calories * m)}cal
                    </span>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeIngredient(ing.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Per 100g summary */}
          {ingredients.length > 0 && (
            <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3">
              <div className="text-xs font-semibold text-muted-foreground mb-1">
                Per 100g (Total: {Math.round(effectiveWeight)}g)
              </div>
              <div className="flex gap-3 text-xs">
                <span className="font-bold text-foreground">{per100g.calories} cal</span>
                <span className="text-red-400 font-medium">{per100g.protein}P</span>
                <span className="text-blue-400 font-medium">{per100g.carbs}C</span>
                <span className="text-yellow-400 font-medium">{per100g.fat}F</span>
                <span className="text-muted-foreground">{per100g.fiber}Fi</span>
                <span className="text-muted-foreground">{per100g.sugar}S</span>
              </div>
            </div>
          )}

          <Button onClick={handleSave} disabled={saving || !recipeName || ingredients.length === 0} className="w-full">
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save Recipe"}
          </Button>
        </CardContent>
      </Card>

      {/* Existing recipes */}
      {recipes && recipes.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Your Recipes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {recipes.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                  <div>
                    <div className="text-sm font-medium text-foreground">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.calories_per_100g}cal · {r.protein_per_100g}P · {r.carbs_per_100g}C · {r.fat_per_100g}F per 100g
                      <span className="ml-2">({Math.round(r.total_weight_g)}g total)</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default RecipeBuilder;
