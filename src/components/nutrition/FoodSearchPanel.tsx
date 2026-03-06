import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import FoodIcon from "@/lib/foodIcons";
import CustomFoodCreator from "./CustomFoodCreator";
import {
  Search,
  Star,
  Clock,
  TrendingUp,
  Plus,
  Loader2,
  Database,
  Filter,
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
  source?: "local" | "usda";
  fdcId?: number;
  isFavorite?: boolean;
}

interface FoodSearchPanelProps {
  onSelect: (food: FoodResult) => void;
  onClose: () => void;
}

type FilterTab = "all" | "favorites" | "recent" | "branded" | "generic";
type SortBy = "relevance" | "calories" | "protein" | "alpha";

const FoodSearchPanel = ({ onSelect, onClose }: FoodSearchPanelProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const [query, setQuery] = useState("");
  const [localResults, setLocalResults] = useState<FoodResult[]>([]);
  const [usdaResults, setUsdaResults] = useState<FoodResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [usdaLoading, setUsdaLoading] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [recentFoods, setRecentFoods] = useState<FoodResult[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [sortBy, setSortBy] = useState<SortBy>("relevance");
  const [showCustomFood, setShowCustomFood] = useState(false);

  // Load favorites and recents on mount
  useEffect(() => {
    if (!user) return;
    loadFavorites();
    loadRecents();
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
        .select("id, name, brand, calories, protein, carbs, fat, fiber, sugar, serving_size, serving_unit, is_verified, data_source")
        .in("id", ids);
      if (foods) {
        // Preserve order from recents
        const ordered = ids
          .map((id) => foods.find((f) => f.id === id))
          .filter(Boolean) as FoodResult[];
        setRecentFoods(ordered.map((f) => ({ ...f, source: "local" as const })));
      }
    }
  };

  const toggleFavorite = async (foodId: string) => {
    if (!user) return;
    const isFav = favorites.has(foodId);

    if (isFav) {
      await supabase
        .from("coach_favorite_foods")
        .delete()
        .eq("coach_id", user.id)
        .eq("food_item_id", foodId);
      setFavorites((prev) => {
        const next = new Set(prev);
        next.delete(foodId);
        return next;
      });
    } else {
      await supabase
        .from("coach_favorite_foods")
        .insert({ coach_id: user.id, food_item_id: foodId });
      setFavorites((prev) => new Set(prev).add(foodId));
    }
  };

  const trackUsage = async (foodId: string) => {
    if (!user) return;
    // Upsert recent usage
    const { data: existing } = await supabase
      .from("coach_recent_foods")
      .select("id, use_count")
      .eq("coach_id", user.id)
      .eq("food_item_id", foodId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("coach_recent_foods")
        .update({ used_at: new Date().toISOString(), use_count: (existing.use_count || 0) + 1 })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("coach_recent_foods")
        .insert({ coach_id: user.id, food_item_id: foodId });
    }
  };

  const searchLocal = async (q: string) => {
    let qb = supabase
      .from("food_items")
      .select("id, name, brand, calories, protein, carbs, fat, fiber, sugar, serving_size, serving_unit, is_verified, data_source")
      .ilike("name", `%${q}%`)
      .order("is_verified", { ascending: false })
      .limit(25);

    const { data } = await qb;
    return (data || []).map((f) => ({ ...f, source: "local" as const }));
  };

  const searchUSDA = async (q: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("usda-food-search", {
        body: { action: "search", query: q, pageSize: 15 },
      });
      if (error) throw error;
      return (data?.foods || []).map((f: any) => ({
        id: `usda-${f.fdcId}`,
        fdcId: f.fdcId,
        name: f.description,
        brand: f.brandOwner || f.brandName || null,
        calories: Math.round(f.calories || 0),
        protein: Math.round(f.protein || 0),
        carbs: Math.round(f.carbs || 0),
        fat: Math.round(f.fat || 0),
        fiber: Math.round(f.fiber || 0),
        sugar: Math.round(f.total_sugars || 0),
        serving_size: f.servingSize || 100,
        serving_unit: f.servingSizeUnit || "g",
        is_verified: true,
        data_source: f.dataType === "Branded" ? "branded" : "usda",
        source: "usda" as const,
      }));
    } catch {
      return [];
    }
  };

  const handleSearch = useCallback(
    (q: string) => {
      setQuery(q);
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (q.length < 2) {
        setLocalResults([]);
        setUsdaResults([]);
        return;
      }

      setLoading(true);
      debounceRef.current = setTimeout(async () => {
        // Search local DB first (fast)
        const local = await searchLocal(q);
        setLocalResults(local);
        setLoading(false);

        // Then search USDA in background
        setUsdaLoading(true);
        const usda = await searchUSDA(q);
        // Filter out USDA results that already exist locally
        const localNames = new Set(local.map((l) => l.name.toLowerCase()));
        const filtered = usda.filter(
          (u: FoodResult) => !localNames.has(u.name.toLowerCase())
        );
        setUsdaResults(filtered);
        setUsdaLoading(false);
      }, 150);
    },
    []
  );

  const handleSelect = async (food: FoodResult) => {
    if (food.source === "usda" && food.fdcId) {
      // Import from USDA first
      try {
        const { data: detail, error } = await supabase.functions.invoke("usda-food-search", {
          body: { action: "detail", fdcId: food.fdcId },
        });
        if (error) throw error;

        const foodItem = {
          name: detail.description || food.name,
          brand: detail.brandOwner || food.brand || null,
          serving_size: detail.servingSize || 100,
          serving_unit: detail.servingSizeUnit || "g",
          calories: Math.round(detail.calories || 0),
          protein: Math.round(detail.protein || 0),
          carbs: Math.round(detail.carbs || 0),
          fat: Math.round(detail.fat || 0),
          fiber: Math.round(detail.fiber || 0),
          sugar: Math.round(detail.total_sugars || 0),
          sodium: Math.round(detail.sodium || 0),
          usda_fdc_id: String(food.fdcId),
          data_source: "usda",
          created_by: user!.id,
          is_verified: true,
        };

        const { data: inserted, error: insertErr } = await supabase
          .from("food_items")
          .insert(foodItem)
          .select("id, name, brand, calories, protein, carbs, fat, fiber, sugar, serving_size, serving_unit, is_verified, data_source")
          .single();

        if (insertErr) throw insertErr;

        const result = { ...inserted, source: "local" as const };
        await trackUsage(result.id);
        onSelect(result);
      } catch (err: any) {
        toast({ title: "Import failed", description: err.message, variant: "destructive" });
      }
    } else {
      await trackUsage(food.id);
      onSelect(food);
    }
  };

  const onCustomFoodCreated = (food: any) => {
    setShowCustomFood(false);
    const result: FoodResult = {
      ...food,
      source: "local",
    };
    onSelect(result);
  };

  // Dedup + filter zero-macro orphans
  const deduplicateAndFilter = (foods: FoodResult[]): FoodResult[] => {
    // Remove zero-macro orphan entries
    const valid = foods.filter(f =>
      (f.calories > 0 || f.protein > 0 || f.carbs > 0 || f.fat > 0)
    );
    // Deduplicate by name+brand
    return valid.filter((food, index, self) =>
      index === self.findIndex(f =>
        f.name.toLowerCase().trim() === food.name.toLowerCase().trim() &&
        (f.brand ?? '').toLowerCase().trim() === (food.brand ?? '').toLowerCase().trim()
      )
    );
  };

  // Build display list
  const getDisplayList = (): FoodResult[] => {
    if (query.length < 2) {
      if (activeFilter === "favorites") {
        return deduplicateAndFilter(recentFoods.filter((f) => favorites.has(f.id)));
      }
      if (activeFilter === "recent") return deduplicateAndFilter(recentFoods);
      // Default: show favorites first, then recents
      const favFoods = recentFoods.filter((f) => favorites.has(f.id));
      const nonFavRecents = recentFoods.filter((f) => !favorites.has(f.id));
      return deduplicateAndFilter([...favFoods, ...nonFavRecents]);
    }

    let combined = [...localResults];

    // Apply filter
    if (activeFilter === "favorites") {
      combined = combined.filter((f) => favorites.has(f.id));
    } else if (activeFilter === "branded") {
      combined = combined.filter((f) => f.brand);
    } else if (activeFilter === "generic") {
      combined = combined.filter((f) => !f.brand);
    }

    // Sort favorites to top
    combined.sort((a, b) => {
      const aFav = favorites.has(a.id) ? 1 : 0;
      const bFav = favorites.has(b.id) ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;
      return 0;
    });

    // Apply sort
    if (sortBy === "calories") combined.sort((a, b) => a.calories - b.calories);
    else if (sortBy === "protein") combined.sort((a, b) => b.protein - a.protein);
    else if (sortBy === "alpha") combined.sort((a, b) => a.name.localeCompare(b.name));

    // Append USDA results at end
    if (activeFilter === "all" || activeFilter === "branded") {
      combined = [...combined, ...usdaResults];
    }

    return deduplicateAndFilter(combined);
  };

  const displayList = getDisplayList();
  const showingRecents = query.length < 2;

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
            onChange={(e) => handleSearch(e.target.value)}
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
        {displayList.length === 0 && !loading && !usdaLoading ? (
          <p className="text-center text-[11px] text-muted-foreground py-6">
            {query.length >= 2 ? "No results found" : "Start typing to search foods"}
          </p>
        ) : (
          displayList.map((food) => (
            <button
              key={food.id}
              onClick={() => handleSelect(food)}
              className="w-full text-left rounded px-2 py-1.5 text-xs hover:bg-secondary transition-colors flex items-center gap-2 group"
            >
              <FoodIcon name={food.name} size={24} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="font-medium text-foreground truncate">{food.name}</span>
                  {food.is_verified && (
                    <Badge className="h-3.5 px-1 text-[8px] bg-green-500/20 text-green-400">✓</Badge>
                  )}
                  {food.source === "usda" && (
                    <Badge variant="outline" className="h-3.5 px-1 text-[8px]">USDA</Badge>
                  )}
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
                  if (food.source !== "usda") toggleFavorite(food.id);
                }}
                className={cn(
                  "h-5 w-5 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity",
                  food.source !== "usda" && "hover:bg-primary/10"
                )}
              >
                {food.source !== "usda" && (
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
        {usdaLoading && (
          <div className="flex items-center justify-center gap-2 py-3 text-[10px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Searching USDA database...
          </div>
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
