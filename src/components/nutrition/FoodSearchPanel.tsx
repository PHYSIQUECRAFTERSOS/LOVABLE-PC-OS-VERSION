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
import CustomFoodCreator from "./CustomFoodCreator";
import {
  Search,
  Star,
  Clock,
  TrendingUp,
  Plus,
  Loader2,
  X,
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
}

interface FoodSearchPanelProps {
  onSelect: (food: FoodResult) => void;
  onClose: () => void;
}

type FilterTab = "all" | "favorites" | "recent" | "custom" | "branded" | "generic";
type SortBy = "relevance" | "calories" | "protein" | "alpha";

const FoodSearchPanel = ({ onSelect, onClose }: FoodSearchPanelProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const { results: searchResults, isLoading: loading, query, setQuery: doSearchSetQuery } = useFoodSearch();

  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [recentFoods, setRecentFoods] = useState<FoodResult[]>([]);
  const [customFoods, setCustomFoods] = useState<FoodResult[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [sortBy, setSortBy] = useState<SortBy>("relevance");
  const [showCustomFood, setShowCustomFood] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadFavorites();
    loadRecents();
    loadCustomFoods();
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
      .limit(50);
    if (data) setCustomFoods(data.map((f: any) => ({ ...f, source: "local" as const })));
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

  // Convert search results to FoodResult format
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
    data_source: r.source ?? "open_food_facts",
    source: r.source === "open_food_facts" ? "off" as const : "local" as const,
    is_branded: r.is_branded,
  }));

  const handleSelect = async (food: FoodResult) => {
    if (food.source === "off") {
      // Import from Open Food Facts into local DB
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
    if (food.id) {
      await trackUsage(food.id, food.name);
    }
    // Refresh custom foods list
    loadCustomFoods();
    onSelect({ ...food, source: "local" });
  };

  const deduplicateAndFilter = (foods: FoodResult[]): FoodResult[] => {
    // Exclude foods with calories > 10 but all macros at 0
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
      if (activeFilter === "custom") return deduplicateAndFilter(customFoods);
      const favFoods = recentFoods.filter(f => favorites.has(f.id));
      const nonFavRecents = recentFoods.filter(f => !favorites.has(f.id));
      return deduplicateAndFilter([...favFoods, ...nonFavRecents]);
    }

    let combined = [...localResults];

    if (activeFilter === "favorites") combined = combined.filter(f => favorites.has(f.id));
    else if (activeFilter === "custom") combined = combined.filter(f => f.data_source === "custom");
    else if (activeFilter === "branded") combined = combined.filter(f => f.brand);
    else if (activeFilter === "generic") combined = combined.filter(f => !f.brand);

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

  const getSourceBadge = (food: FoodResult) => {
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
        <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => setShowCustomFood(true)}>
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
            {activeFilter === "favorites" ? "Favorite Foods" : "Recently Used"}
          </span>
        </div>
      )}

      {/* Results */}
      <div className="max-h-52 overflow-y-auto space-y-0.5 rounded border border-border p-1">
        {displayList.length === 0 && !loading ? (
          <div className="text-center py-6">
            <p className="text-[11px] text-muted-foreground">
              {query.length >= 2
                ? `No results found for "${query}". Try a different spelling or add a custom food.`
                : "Start typing to search foods"}
            </p>
            {query.length >= 2 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 text-xs"
                onClick={() => setShowCustomFood(true)}
              >
                <Plus className="h-3 w-3 mr-1" /> Add Custom Food
              </Button>
            )}
          </div>
        ) : (
          displayList.map((food) => (
            <button
              key={food.id}
              onClick={() => handleSelect(food)}
              className="w-full text-left rounded px-2 py-1.5 text-xs hover:bg-secondary transition-colors flex items-center gap-2 group"
            >
              {/* Emoji Icon */}
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
            </button>
          ))
        )}
      </div>

      {showCustomFood && (
        <CustomFoodCreator
          open={showCustomFood}
          onOpenChange={setShowCustomFood}
          onCreated={onCustomFoodCreated}
        />
      )}
    </div>
  );
};

export default FoodSearchPanel;
