import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { getFoodEmoji } from "@/utils/foodEmoji";
import { useFoodSearch, Food } from "@/hooks/useFoodSearch";
import CustomFoodCreator, { CustomFoodData } from "./CustomFoodCreator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search,
  Star,
  Clock,
  Plus,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";

export interface FoodResult {
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
  serving_unit: string;
  is_verified?: boolean;
  data_source?: string;
  category?: string;
  source?: "local" | "off";
  fdcId?: number;
  isFavorite?: boolean;
  relevance_score?: number;
  /** per-100g values passed through from foods table — used for accurate macro scaling */
  calories_per_100?: number | null;
  protein_per_100?: number | null;
  carbs_per_100?: number | null;
  fat_per_100?: number | null;
  fiber_per_100?: number | null;
  sugar_per_100?: number | null;
}

interface FoodSearchPanelProps {
  onSelect: (food: FoodResult) => void;
  onClose: () => void;
  onSelectSavedMeal?: (foods: FoodResult[]) => void;
}

type FilterTab = "all" | "favorites" | "recent" | "custom" | "branded" | "generic" | "saved";
type SortBy = "relevance" | "calories" | "protein" | "alpha";

const FoodSearchPanel = ({ onSelect, onClose, onSelectSavedMeal }: FoodSearchPanelProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const { results: searchResults, isLoading: loading, query, setQuery: doSearchSetQuery } = useFoodSearch();

  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [recentFoods, setRecentFoods] = useState<FoodResult[]>([]);
  const [customFoods, setCustomFoods] = useState<FoodResult[]>([]);
  const [savedMeals, setSavedMeals] = useState<any[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [sortBy, setSortBy] = useState<SortBy>("relevance");
  const [showCustomFood, setShowCustomFood] = useState(false);
  const [editingFood, setEditingFood] = useState<CustomFoodData | null>(null);
  const [deletingFood, setDeletingFood] = useState<FoodResult | null>(null);

  useEffect(() => {
    if (!user) return;
    loadFavorites();
    loadRecents();
    loadCustomFoods();
    loadSavedMeals();
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [user]);

  const loadFavorites = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("coach_favorite_foods")
      .select("food_item_id")
      .eq("coach_id", user.id);
    if (data) setFavorites(new Set(data.map((d) => d.food_item_id)));
  };

  const loadRecents = async () => {
    if (!user) return;
    const { data: userRecents } = await supabase
      .from("user_recent_foods")
      .select("food_id, food_name, food_data")
      .eq("user_id", user.id)
      .order("selected_at", { ascending: false })
      .limit(20);

    if (userRecents && userRecents.length > 0) {
      const ids = userRecents.filter(r => r.food_id).map(r => r.food_id!);
      if (ids.length > 0) {
        const { data: foods } = await supabase
          .from("food_items")
          .select("id, name, brand, calories, protein, carbs, fat, fiber, sugar, serving_size, serving_unit, is_verified, data_source, category")
          .in("id", ids);
        if (foods) {
          const ordered = ids
            .map((id) => foods.find((f) => f.id === id))
            .filter(Boolean) as FoodResult[];
          setRecentFoods(ordered.map((f) => ({ ...f, source: "local" as const })));
          return;
        }
      }
    }

    const { data: recents } = await supabase
      .from("coach_recent_foods")
      .select("food_item_id")
      .eq("coach_id", user.id)
      .order("used_at", { ascending: false })
      .limit(20);

    if (recents && recents.length > 0) {
      const ids = recents.map((r) => r.food_item_id);
      const { data: foods } = await supabase
        .from("food_items")
        .select("id, name, brand, calories, protein, carbs, fat, fiber, sugar, serving_size, serving_unit, is_verified, data_source, category")
        .in("id", ids);
      if (foods) {
        const ordered = ids
          .map((id) => foods.find((f) => f.id === id))
          .filter(Boolean) as FoodResult[];
        setRecentFoods(ordered.map((f) => ({ ...f, source: "local" as const })));
      }
    }
  };

  const loadCustomFoods = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("food_items")
      .select("id, name, brand, calories, protein, carbs, fat, fiber, sugar, serving_size, serving_unit, is_verified, data_source, category")
      .eq("data_source", "custom")
      .eq("created_by", user.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data) setCustomFoods(data.map((f: any) => ({ ...f, source: "local" as const })));
  };

  const loadSavedMeals = async () => {
    if (!user) return;
    const { data: meals } = await supabase
      .from("saved_meals")
      .select("id, name, calories, protein, carbs, fat, fiber, sugar")
      .eq("client_id", user.id)
      .order("created_at", { ascending: false });
    if (!meals || meals.length === 0) { setSavedMeals([]); return; }

    const mealIds = meals.map((m: any) => m.id);
    const { data: items } = await supabase
      .from("saved_meal_items")
      .select("*")
      .in("saved_meal_id", mealIds);

    setSavedMeals(meals.map((m: any) => ({
      ...m,
      items: (items || []).filter((i: any) => i.saved_meal_id === m.id),
    })));
  };

  const handleSelectSavedMeal = (meal: any) => {
    if (!onSelectSavedMeal) return;
    const foods: FoodResult[] = meal.items.map((item: any) => ({
      id: item.food_item_id || crypto.randomUUID(),
      name: item.food_name,
      brand: null,
      calories: item.calories || 0,
      protein: item.protein || 0,
      carbs: item.carbs || 0,
      fat: item.fat || 0,
      fiber: 0,
      sugar: 0,
      serving_size: item.serving_size_g || item.quantity || 100,
      serving_unit: item.serving_unit || "g",
      source: "local" as const,
      calories_per_100: item.calories_per_100g || null,
      protein_per_100: item.protein_per_100g || null,
      carbs_per_100: item.carbs_per_100g || null,
      fat_per_100: item.fat_per_100g || null,
      gram_amount: item.quantity,
    }));
    onSelectSavedMeal(foods);
  };

  const deleteSavedMeal = async (mealId: string) => {
    const { error } = await supabase.from("saved_meals").delete().eq("id", mealId);
    if (error) {
      toast({ title: "Error deleting", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved meal deleted" });
      loadSavedMeals();
    }
  };

  const toggleFavorite = async (foodId: string) => {
    if (!user) return;
    const isFav = favorites.has(foodId);
    if (isFav) {
      await supabase.from("coach_favorite_foods").delete().eq("coach_id", user.id).eq("food_item_id", foodId);
      setFavorites((prev) => { const next = new Set(prev); next.delete(foodId); return next; });
    } else {
      await supabase.from("coach_favorite_foods").insert({ coach_id: user.id, food_item_id: foodId });
      setFavorites((prev) => new Set(prev).add(foodId));
    }
  };

  const trackUsage = async (foodId: string, foodName: string) => {
    if (!user) return;
    try {
      await supabase.from("user_recent_foods").upsert(
        { user_id: user.id, food_id: foodId, food_name: foodName, selected_at: new Date().toISOString() },
        { onConflict: "user_id,food_id", ignoreDuplicates: false }
      );
    } catch { /* ignore */ }
    
    const { data: existing } = await supabase
      .from("coach_recent_foods")
      .select("id, use_count")
      .eq("coach_id", user.id)
      .eq("food_item_id", foodId)
      .maybeSingle();
    if (existing) {
      await supabase.from("coach_recent_foods").update({ used_at: new Date().toISOString(), use_count: (existing.use_count || 0) + 1 }).eq("id", existing.id);
    } else {
      await supabase.from("coach_recent_foods").insert({ coach_id: user.id, food_item_id: foodId });
    }
  };

  const localResults: FoodResult[] = searchResults.map(r => ({
    id: r.id ?? crypto.randomUUID(),
    name: r.name,
    brand: r.brand ?? null,
    calories: Math.round((r.calories_per_100g ?? 0) * (r.serving_size_g ?? 100) / 100),
    protein: parseFloat(((r.protein_per_100g ?? 0) * (r.serving_size_g ?? 100) / 100).toFixed(1)),
    carbs: parseFloat(((r.carbs_per_100g ?? 0) * (r.serving_size_g ?? 100) / 100).toFixed(1)),
    fat: parseFloat(((r.fat_per_100g ?? 0) * (r.serving_size_g ?? 100) / 100).toFixed(1)),
    fiber: parseFloat(((r.fiber_per_100g ?? 0) * (r.serving_size_g ?? 100) / 100).toFixed(1)),
    sugar: parseFloat(((r.sugar_per_100g ?? 0) * (r.serving_size_g ?? 100) / 100).toFixed(1)),
    serving_size: r.serving_size_g ?? 100,
    serving_unit: r.serving_unit ?? "g",
    is_verified: r.is_verified,
    data_source: r.is_custom ? "custom" : (r.source ?? "open_food_facts"),
    source: r.source === "open_food_facts" ? "off" as const : "local" as const,
    is_branded: r.is_branded,
    // Pass per-100g values directly for accurate macro scaling in MealPlanBuilder
    calories_per_100: r.calories_per_100g ?? null,
    protein_per_100: r.protein_per_100g ?? null,
    carbs_per_100: r.carbs_per_100g ?? null,
    fat_per_100: r.fat_per_100g ?? null,
    fiber_per_100: r.fiber_per_100g ?? null,
    sugar_per_100: r.sugar_per_100g ?? null,
  }));

  const handleSelect = async (food: FoodResult) => {
    if (food.source === "off") {
      try {
        const foodItem = {
          name: food.name,
          brand: food.brand || null,
          serving_size: food.serving_size || 100,
          serving_unit: food.serving_unit || "g",
          calories: Math.round(food.calories || 0),
          protein: Math.round(food.protein || 0),
          carbs: Math.round(food.carbs || 0),
          fat: Math.round(food.fat || 0),
          fiber: Math.round(food.fiber || 0),
          sugar: Math.round(food.sugar || 0),
          sodium: 0,
          category: food.category || null,
          data_source: "open_food_facts",
          created_by: user!.id,
          is_verified: false,
        };

        const { data: inserted, error: insertErr } = await supabase
          .from("food_items")
          .insert(foodItem)
          .select("id, name, brand, calories, protein, carbs, fat, fiber, sugar, serving_size, serving_unit, is_verified, data_source, category")
          .single();

        if (insertErr) throw insertErr;
        const result = { ...inserted, source: "local" as const };
        await trackUsage(result.id, result.name);
        onSelect(result);
      } catch (err: any) {
        toast({ title: "Import failed", description: err.message, variant: "destructive" });
      }
    } else {
      await trackUsage(food.id, food.name);
      onSelect(food);
    }
  };

  const onCustomFoodCreated = async (food: any) => {
    setShowCustomFood(false);
    setEditingFood(null);
    if (food.id) {
      await trackUsage(food.id, food.name);
    }
    loadCustomFoods();
    onSelect({ ...food, source: "local" });
  };

  const handleEditFood = (food: FoodResult) => {
    setEditingFood({
      id: food.id,
      name: food.name,
      brand: food.brand,
      serving_size: food.serving_size,
      serving_unit: food.serving_unit,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      fiber: food.fiber,
      sugar: food.sugar,
    });
    setShowCustomFood(true);
  };

  const handleDeleteFood = async () => {
    if (!deletingFood || !user) return;
    const { error } = await supabase
      .from("food_items")
      .delete()
      .eq("id", deletingFood.id)
      .eq("created_by", user.id);

    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${deletingFood.name} deleted` });
      loadCustomFoods();
    }
    setDeletingFood(null);
  };

  const deduplicateAndFilter = (foods: FoodResult[]): FoodResult[] => {
    const valid = foods.filter(f => {
      if (f.calories > 10 && f.protein === 0 && f.carbs === 0 && f.fat === 0) return false;
      return f.calories > 0 || f.protein > 0 || f.carbs > 0 || f.fat > 0;
    });
    return valid.filter((food, index, self) =>
      index === self.findIndex(f =>
        f.name.toLowerCase().trim() === food.name.toLowerCase().trim() &&
        (f.brand ?? '').toLowerCase().trim() === (food.brand ?? '').toLowerCase().trim()
      )
    );
  };

  const getDisplayList = (): FoodResult[] => {
    if (query.length < 2) {
      if (activeFilter === "favorites") return deduplicateAndFilter(recentFoods.filter(f => favorites.has(f.id)));
      if (activeFilter === "recent") return deduplicateAndFilter(recentFoods);
      if (activeFilter === "custom") return customFoods;
      const favFoods = recentFoods.filter(f => favorites.has(f.id));
      const nonFavRecents = recentFoods.filter(f => !favorites.has(f.id));
      return deduplicateAndFilter([...favFoods, ...nonFavRecents]);
    }

    let combined = [...localResults];

    if (activeFilter === "favorites") {
      combined = combined.filter(f => favorites.has(f.id));
    } else if (activeFilter === "custom") {
      // Client-side filter on already-loaded customFoods array
      const q = query.toLowerCase();
      const matchingCustom = customFoods.filter(f =>
        f.name.toLowerCase().includes(q) ||
        (f.brand ?? "").toLowerCase().includes(q)
      );
      // Merge with any edge-function results tagged as custom (dedup by id)
      const edgeCustom = localResults.filter(f => f.data_source === "custom");
      const seenIds = new Set(matchingCustom.map(f => f.id));
      combined = [...matchingCustom, ...edgeCustom.filter(f => !seenIds.has(f.id))];
    } else if (activeFilter === "branded") {
      combined = combined.filter(f => f.brand);
    } else if (activeFilter === "generic") {
      combined = combined.filter(f => !f.brand);
    } else {
      // "All" tab — boost custom foods matching the query to the top
      const q = query.toLowerCase();
      const matchingCustom = customFoods.filter(f =>
        f.name.toLowerCase().includes(q) ||
        (f.brand ?? "").toLowerCase().includes(q)
      );
      const customIds = new Set(matchingCustom.map(f => f.id));
      combined = [...matchingCustom, ...combined.filter(f => !customIds.has(f.id))];
    }

    combined.sort((a, b) => {
      const aFav = favorites.has(a.id) ? 1 : 0;
      const bFav = favorites.has(b.id) ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;
      return 0;
    });

    if (sortBy === "calories") combined.sort((a, b) => a.calories - b.calories);
    else if (sortBy === "protein") combined.sort((a, b) => b.protein - a.protein);
    else if (sortBy === "alpha") combined.sort((a, b) => a.name.localeCompare(b.name));

    return deduplicateAndFilter(combined);
  };

  const displayList = getDisplayList();
  const showingRecents = query.length < 2;
  const isCustomTab = activeFilter === "custom";

  const getSourceBadge = (food: FoodResult) => {
    if (food.data_source === "custom") {
      return <Badge className="h-3.5 px-1 text-[8px] bg-primary/20 text-primary">Custom</Badge>;
    }
    if (food.source === "off" || food.data_source === "open_food_facts") {
      return <Badge variant="outline" className="h-3.5 px-1 text-[8px]">Branded</Badge>;
    }
    if (food.data_source === "usda") {
      return <Badge variant="outline" className="h-3.5 px-1 text-[8px]">USDA</Badge>;
    }
    if (food.brand) {
      return <Badge variant="outline" className="h-3.5 px-1 text-[8px]">Branded</Badge>;
    }
    if (food.is_verified) {
      return <Badge className="h-3.5 px-1 text-[8px] bg-green-500/20 text-green-400">✓</Badge>;
    }
    return null;
  };

  const FILTERS: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "favorites", label: "★ Favorites" },
    { key: "recent", label: "Recent" },
    { key: "custom", label: "Custom Foods" },
    { key: "branded", label: "Branded" },
    { key: "generic", label: "Generic" },
  ];

  return (
    <div className="space-y-2">
      {/* Search Input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder="Search 200k+ foods..."
            value={query}
            onChange={(e) => doSearchSetQuery(e.target.value)}
            className="h-9 pl-8 text-xs"
          />
          {loading && (
            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </div>
        <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => { setEditingFood(null); setShowCustomFood(true); }}>
          <Plus className="h-3 w-3 mr-1" /> Custom
        </Button>
        <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={onClose}>
          Cancel
        </Button>
      </div>

      {/* Filter Pills */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveFilter(f.key)}
            className={cn(
              "whitespace-nowrap px-2.5 py-1 text-[10px] font-medium rounded-full transition-all",
              activeFilter === f.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            {f.label}
          </button>
        ))}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="ml-auto text-[10px] bg-transparent text-muted-foreground border-0 outline-none cursor-pointer"
        >
          <option value="relevance">Sort: Relevance</option>
          <option value="protein">Sort: Protein ↓</option>
          <option value="calories">Sort: Calories ↑</option>
          <option value="alpha">Sort: A-Z</option>
        </select>
      </div>

      {/* Section Label */}
      {showingRecents && displayList.length > 0 && (
        <div className="flex items-center gap-1.5 pt-1">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {activeFilter === "favorites" ? "Favorite Foods" : activeFilter === "custom" ? "Your Custom Foods" : "Recently Used"}
          </span>
        </div>
      )}

      {/* Results */}
      <div className="max-h-52 overflow-y-auto space-y-0.5 rounded border border-border p-1">
        {displayList.length === 0 && !loading ? (
          <div className="text-center py-6">
            <p className="text-[11px] text-muted-foreground">
              {isCustomTab && query.length < 2
                ? "No custom foods yet. Create one!"
                : query.length >= 2
                  ? `No results found for "${query}". Try a different spelling or add a custom food.`
                  : "Start typing to search foods"}
            </p>
            {(query.length >= 2 || isCustomTab) && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 text-xs"
                onClick={() => { setEditingFood(null); setShowCustomFood(true); }}
              >
                <Plus className="h-3 w-3 mr-1" /> Add Custom Food
              </Button>
            )}
          </div>
        ) : (
          displayList.map((food) => (
            <div
              key={food.id}
              className="w-full text-left rounded px-2 py-1.5 text-xs hover:bg-secondary transition-colors flex items-center gap-2 group"
            >
              <button
                onClick={() => handleSelect(food)}
                className="flex items-center gap-2 flex-1 min-w-0"
              >
                <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0 text-lg">
                  {getFoodEmoji(food)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-foreground truncate">{food.name}</span>
                    {getSourceBadge(food)}
                  </div>
                  {food.brand && (
                    <span className="text-[10px] text-muted-foreground">{food.brand}</span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {food.calories}cal · {food.protein}P · {food.carbs}C · {food.fat}F
                </span>
              </button>

              {/* Action buttons */}
              <div className="flex items-center gap-0.5 shrink-0">
                {isCustomTab && food.data_source === "custom" && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEditFood(food); }}
                      className="h-6 w-6 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/10"
                      title="Edit"
                    >
                      <Pencil className="h-3 w-3 text-muted-foreground" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeletingFood(food); }}
                      className="h-6 w-6 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10"
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </button>
                  </>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (food.source === "local") toggleFavorite(food.id);
                  }}
                  className={cn(
                    "h-5 w-5 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity",
                    food.source === "local" && "hover:bg-primary/10"
                  )}
                >
                  {food.source === "local" && (
                    <Star
                      className={cn(
                        "h-3 w-3",
                        favorites.has(food.id) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
                      )}
                    />
                  )}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showCustomFood && (
        <CustomFoodCreator
          open={showCustomFood}
          onOpenChange={(open) => { setShowCustomFood(open); if (!open) setEditingFood(null); }}
          onCreated={onCustomFoodCreated}
          editFood={editingFood}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingFood} onOpenChange={(open) => { if (!open) setDeletingFood(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Custom Food</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingFood?.name}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFood} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FoodSearchPanel;
