import { useState, useEffect, useRef, useCallback } from "react";
import { FrequentMealsSection } from "@/components/nutrition/FrequentMealsSection";
import type { MealFood } from "@/services/mealTemplateService";
import FoodDetailScreen from "@/components/nutrition/FoodDetailScreen";
import type { FoodDetailFood, FoodDetailEntry } from "@/components/nutrition/FoodDetailScreen";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getMilestoneMessage } from "@/hooks/useLoggingStreak";
import {
  ArrowLeft,
  Search,
  ScanBarcode,
  Camera,
  Zap,
  Mic,
  Plus,
  ChevronDown,
  ChevronUp,
  BadgeCheck,
  Clock,
  TrendingUp,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getFoodEmoji } from "@/utils/foodEmoji";
import { Badge } from "@/components/ui/badge";
import BarcodeScanner from "@/components/nutrition/BarcodeScanner";
import MealScanCapture from "@/components/nutrition/MealScanCapture";
import CreateRecipeScreen from "@/components/nutrition/CreateRecipeScreen";
import CreateFoodScreen from "@/components/nutrition/CreateFoodScreen";

interface FoodItem {
  id: string;
  name: string;
  brand: string | null;
  serving_size: number;
  serving_unit: string;
  serving_description?: string | null;
  additional_serving_sizes?: Array<{ description: string; size_g: number }> | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  is_verified?: boolean;
  data_source?: string;
  category?: string;
  relevance_score?: number;
  source?: "local" | "off" | "usda";
  is_branded?: boolean;
  image_url?: string | null;
  calories_per_100g?: number;
  protein_per_100g?: number;
  carbs_per_100g?: number;
  fat_per_100g?: number;
  fiber_per_100g?: number;
  sugar_per_100g?: number;
  sodium_per_100g?: number;
}

interface AddFoodScreenProps {
  mealType: string;
  mealLabel: string;
  logDate?: string;
  open: boolean;
  onClose: () => void;
  onLogged: () => void;
}

type TabKey = "all" | "my-meals" | "my-recipes" | "my-foods";
type HistorySort = "recent" | "frequent";
type ServingUnit = "serving" | "g" | "oz";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "my-meals", label: "My Meals" },
  { key: "my-recipes", label: "My Recipes" },
  { key: "my-foods", label: "My Foods" },
];

const AddFoodScreen = ({ mealType, mealLabel, logDate, open, onClose, onLogged }: AddFoodScreenProps) => {
  const effectiveDate = logDate || new Date().toLocaleDateString("en-CA");
  const { user } = useAuth();
  const { toast } = useToast();
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRequestIdRef = useRef(0);

  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<FoodItem[]>([]);
  const [offResults, setOffResults] = useState<FoodItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [offSearching, setOffSearching] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historySort, setHistorySort] = useState<HistorySort>("recent");
  const [history, setHistory] = useState<FoodItem[]>([]);
  const [savedMeals, setSavedMeals] = useState<any[]>([]);
  const [userRecipes, setUserRecipes] = useState<any[]>([]);
  const [customFoods, setCustomFoods] = useState<FoodItem[]>([]);
  const [servings, setServings] = useState<Record<string, string>>({});
  const [servingUnits, setServingUnits] = useState<Record<string, ServingUnit>>({});

  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickCal, setQuickCal] = useState("");
  const [quickProtein, setQuickProtein] = useState("");
  const [quickCarbs, setQuickCarbs] = useState("");
  const [quickFat, setQuickFat] = useState("");

  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [mealScanOpen, setMealScanOpen] = useState(false);
  const [detailFood, setDetailFood] = useState<FoodItem | null>(null);
  const [showCreateRecipe, setShowCreateRecipe] = useState(false);
  const [showCreateFood, setShowCreateFood] = useState(false);
  const [clientRecipes, setClientRecipes] = useState<any[]>([]);
  const [clientCustomFoods, setClientCustomFoods] = useState<any[]>([]);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 100);
      fetchHistory();
      fetchSavedMeals();
      fetchUserRecipes();
      fetchCustomFoods();
      fetchClientRecipes();
      fetchClientCustomFoods();
    }
  }, [open]);

  const fetchHistory = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("nutrition_logs")
      .select("food_item_id, custom_name, calories, protein, carbs, fat")
      .eq("client_id", user.id)
      .not("food_item_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(30);

    if (!data || data.length === 0) return;

    const foodIds = [...new Set(data.map(d => d.food_item_id!))];
    const { data: foods } = await supabase
      .from("food_items")
      .select("id, name, brand, serving_size, serving_unit, calories, protein, carbs, fat, fiber, sugar, sodium, is_verified, data_source, category")
      .in("id", foodIds);

    if (foods) {
      if (historySort === "recent") {
        const ordered = foodIds.map(id => foods.find(f => f.id === id)).filter(Boolean) as FoodItem[];
        setHistory(ordered);
      } else {
        const freq: Record<string, number> = {};
        data.forEach(d => { freq[d.food_item_id!] = (freq[d.food_item_id!] || 0) + 1; });
        const sorted = [...foods].sort((a, b) => (freq[b.id] || 0) - (freq[a.id] || 0));
        setHistory(sorted as FoodItem[]);
      }
    }
  };

  const fetchSavedMeals = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("saved_meals")
      .select("*")
      .eq("client_id", user.id)
      .order("created_at", { ascending: false });
    setSavedMeals(data || []);
  };

  const fetchUserRecipes = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("recipes")
      .select("*")
      .eq("created_by", user.id)
      .order("created_at", { ascending: false });
    setUserRecipes(data || []);
  };

  const fetchCustomFoods = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("food_items")
      .select("id, name, brand, serving_size, serving_unit, calories, protein, carbs, fat, fiber, sugar, sodium, is_verified, data_source, category")
      .eq("created_by", user.id)
      .in("data_source", ["custom", "recipe"])
      .order("created_at", { ascending: false })
      .limit(50);
    setCustomFoods((data || []) as FoodItem[]);
  };

  const logRecipe = async (recipe: any) => {
    if (!user) return;
    // Log 100g serving of the recipe
    const { error } = await supabase.from("nutrition_logs").insert({
      client_id: user.id,
      custom_name: `🍳 ${recipe.name} (100g)`,
      meal_type: mealType,
      servings: 1,
      calories: Math.round(recipe.calories_per_100g || 0),
      protein: Math.round(recipe.protein_per_100g || 0),
      carbs: Math.round(recipe.carbs_per_100g || 0),
      fat: Math.round(recipe.fat_per_100g || 0),
      fiber: Math.round(recipe.fiber_per_100g || 0),
      sugar: Math.round(recipe.sugar_per_100g || 0),
      logged_at: effectiveDate,
      tz_corrected: true,
    });

    if (error) {
      toast({ title: "Couldn't log recipe. Please try again." });
    } else {
      toast({ title: `${recipe.name} logged` });
      onLogged();
    }
  };

  useEffect(() => { fetchHistory(); }, [historySort]);

  const handleSearch = useCallback(async (q: string) => {
    setSearch(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const requestId = ++searchRequestIdRef.current;

    if (q.length < 2) {
      setSearching(false);
      setOffSearching(false);
      setResults([]);
      setOffResults([]);
      return;
    }

    setSearching(true);

    debounceRef.current = setTimeout(async () => {
      try {
        if (activeTab === "my-foods" && user) {
          const { data } = await supabase
            .from("food_items")
            .select("id, name, brand, serving_size, serving_unit, calories, protein, carbs, fat, fiber, sugar, sodium, is_verified, data_source, category")
            .eq("created_by", user.id)
            .or(`name.ilike.%${q}%,brand.ilike.%${q}%`)
            .limit(20);

          if (searchRequestIdRef.current !== requestId) return;
          setResults((data || []) as FoodItem[]);
          setOffResults([]);
          setSearching(false);
          setOffSearching(false);
          return;
        }

        // Use the new search-foods edge function
        const { data, error } = await supabase.functions.invoke("search-foods", {
          body: { query: q, limit: 25, user_id: user?.id ?? null },
        });

        if (searchRequestIdRef.current !== requestId) return;

        if (error) {
          console.error("[AddFoodScreen] Edge function error:", error);
          setResults([]);
          setOffResults([]);
          return;
        }

        const foods = (data?.foods ?? []).map((f: any) => ({
          id: f.id,
          name: f.name,
          brand: f.brand || null,
          serving_size: f.serving_size_g ?? 100,
          serving_unit: f.serving_unit ?? "g",
          serving_description: f.serving_description ?? null,
          additional_serving_sizes: f.additional_serving_sizes ?? null,
          calories: Math.round((f.calories_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100),
          protein: Math.round((f.protein_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100),
          carbs: Math.round((f.carbs_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100),
          fat: Math.round((f.fat_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100),
          fiber: Math.round((f.fiber_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100),
          sugar: Math.round((f.sugar_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100),
          sodium: Math.round((f.sodium_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100),
          calories_per_100g: f.calories_per_100g ?? 0,
          protein_per_100g: f.protein_per_100g ?? 0,
          carbs_per_100g: f.carbs_per_100g ?? 0,
          fat_per_100g: f.fat_per_100g ?? 0,
          fiber_per_100g: f.fiber_per_100g ?? 0,
          sugar_per_100g: f.sugar_per_100g ?? 0,
          sodium_per_100g: f.sodium_per_100g ?? 0,
          is_verified: f.is_verified,
          data_source: f.source ?? "open_food_facts",
          category: null,
          source: f.source === "usda" ? "usda" as const : f.source === "open_food_facts" ? "off" as const : "local" as const,
          is_branded: f.is_branded,
          image_url: f.image_url,
        } as FoodItem));

        setResults(foods);
        setOffResults([]);
      } catch (err) {
        console.error("[AddFoodScreen] Search error:", err);
        if (searchRequestIdRef.current !== requestId) return;
        setResults([]);
        setOffResults([]);
      } finally {
        if (searchRequestIdRef.current === requestId) {
          setSearching(false);
          setOffSearching(false);
        }
      }
    }, 300);
  }, [activeTab, user]);

  const importOFFFood = async (food: FoodItem): Promise<FoodItem | null> => {
    if (!user) return null;
    try {
      // The food is already cached in the `foods` table by the edge function.
      // We need to insert into `food_items` for nutrition_logs compatibility.
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
        sodium: Math.round(food.sodium || 0),
        category: food.category || null,
        data_source: "open_food_facts",
        created_by: user.id,
        is_verified: false,
      };

      const { data: inserted, error } = await supabase
        .from("food_items")
        .insert(foodItem)
        .select("id, name, brand, serving_size, serving_unit, calories, protein, carbs, fat, fiber, sugar, sodium, is_verified, data_source, category")
        .single();
      if (error) throw error;
      return { ...inserted, source: "local" as const } as FoodItem;
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
      return null;
    }
  };

  const logFood = async (item: FoodItem) => {
    if (!user) return;

    // If from OFF, import first
    let foodToLog = item;
    if (item.source === "off") {
      const imported = await importOFFFood(item);
      if (!imported) return;
      foodToLog = imported;
    }

    const unit = servingUnits[item.id] || "g";
    const inputVal = parseFloat(servings[item.id] || (foodToLog.serving_size > 0 ? String(foodToLog.serving_size) : "1")) || 0;
    
    let quantityGrams: number;
    let multiplier: number;
    const baseSizeG = foodToLog.serving_unit === "oz" ? foodToLog.serving_size * 28.3495 : foodToLog.serving_size;

    if (unit === "g") {
      quantityGrams = inputVal;
      multiplier = inputVal / baseSizeG;
    } else if (unit === "oz") {
      quantityGrams = inputVal * 28.3495;
      multiplier = quantityGrams / baseSizeG;
    } else {
      quantityGrams = inputVal * baseSizeG;
      multiplier = inputVal;
    }

    const { error } = await supabase.from("nutrition_logs").insert({
      client_id: user.id,
      food_item_id: foodToLog.id,
      meal_type: mealType,
      servings: multiplier,
      calories: Math.round(foodToLog.calories * multiplier),
      protein: Math.round(foodToLog.protein * multiplier),
      carbs: Math.round(foodToLog.carbs * multiplier),
      fat: Math.round(foodToLog.fat * multiplier),
      fiber: Math.round((foodToLog.fiber || 0) * multiplier),
      sugar: Math.round((foodToLog.sugar || 0) * multiplier),
      sodium: Math.round((foodToLog.sodium || 0) * multiplier),
      quantity_display: inputVal,
      quantity_unit: unit,
      logged_at: effectiveDate,
      tz_corrected: true,
    });

    if (error) {
      console.error("[NutritionLog] Insert error:", error);
      toast({ title: "Couldn't save this food. Please try again." });
    } else {
      toast({ title: `${foodToLog.name} logged` });
      // Check streak milestone
      try {
        const { getLocalDateString: getLocalDate } = await import("@/utils/localDate");
        const { data: streakData } = await supabase.rpc("get_logging_streak_v2" as any, { p_user_id: user.id, p_today: getLocalDate() });
        const newStreak = streakData as unknown as number;
        const msg = getMilestoneMessage(newStreak);
        if (msg) {
          setTimeout(() => toast({ title: `🔥 ${newStreak} day streak!`, description: msg }), 1500);
        }
      } catch { /* ignore */ }
      onLogged();
    }
  };

  const logSavedMeal = async (meal: any) => {
    if (!user) return;
    const { error } = await supabase.from("nutrition_logs").insert({
      client_id: user.id,
      custom_name: meal.name,
      meal_type: mealType,
      servings: 1,
      calories: meal.calories || 0,
      protein: meal.protein || 0,
      carbs: meal.carbs || 0,
      fat: meal.fat || 0,
      fiber: meal.fiber || 0,
      sugar: meal.sugar || 0,
      sodium: meal.sodium || 0,
      logged_at: effectiveDate,
      tz_corrected: true,
    });

    if (error) {
      console.error("[NutritionLog] Insert error:", error);
      toast({ title: "Couldn't save this food. Please try again." });
    } else {
      toast({ title: `${meal.name} logged` });
      onLogged();
    }
  };

  const handleQuickAdd = async () => {
    if (!user || !quickName) return;
    const { error } = await supabase.from("nutrition_logs").insert({
      client_id: user.id,
      custom_name: quickName,
      meal_type: mealType,
      servings: 1,
      calories: parseInt(quickCal) || 0,
      protein: parseInt(quickProtein) || 0,
      carbs: parseInt(quickCarbs) || 0,
      fat: parseInt(quickFat) || 0,
      logged_at: effectiveDate,
      tz_corrected: true,
    });

    if (error) {
      console.error("[NutritionLog] Insert error:", error);
      toast({ title: "Couldn't save this food. Please try again." });
    } else {
      toast({ title: "Logged!" });
      setQuickAddOpen(false);
      setQuickName(""); setQuickCal(""); setQuickProtein(""); setQuickCarbs(""); setQuickFat("");
      onLogged();
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const openFoodDetail = (item: FoodItem) => {
    setDetailFood(item);
  };

  const handleDetailConfirm = async (entry: FoodDetailEntry) => {
    if (!user) return;

    // Import if needed
    let foodItemId = detailFood?.id;
    if (detailFood?.source === "off") {
      const imported = await importOFFFood(detailFood);
      if (!imported) return;
      foodItemId = imported.id;
    }

    const { error } = await supabase.from("nutrition_logs").insert({
      client_id: user.id,
      food_item_id: foodItemId,
      meal_type: mealType,
      servings: entry.quantity,
      calories: Math.round(entry.calories),
      protein: Math.round(entry.protein),
      carbs: Math.round(entry.carbs),
      fat: Math.round(entry.fat),
      fiber: Math.round(entry.fiber),
      sugar: Math.round(entry.sugar),
      sodium: Math.round(entry.sodium),
      quantity_display: entry.quantity,
      quantity_unit: "serving",
      logged_at: effectiveDate,
      tz_corrected: true,
    });

    if (error) {
      console.error("[NutritionLog] Insert error:", error);
      toast({ title: "Couldn't save this food. Please try again." });
    } else {
      toast({ title: `${entry.food.name} logged` });
      // Upsert serving memory silently
      if (foodItemId) {
        const servingUnit = entry.servingDescription;
        const servingSize = entry.quantity;
        supabase.from("user_food_serving_memory" as any).upsert({
          user_id: user.id,
          food_id: foodItemId,
          serving_size: servingSize,
          serving_unit: servingUnit,
          last_logged_at: new Date().toISOString(),
          log_count: 1,
        } as any, { onConflict: "user_id,food_id" }).then(({ error: memErr }) => {
          if (memErr) console.warn("[ServingMemory] upsert failed:", memErr);
        });
      }
      setDetailFood(null);
      try {
        const { getLocalDateString: getLocalDate } = await import("@/utils/localDate");
        const { data: streakData } = await supabase.rpc("get_logging_streak_v2" as any, { p_user_id: user.id, p_today: getLocalDate() });
        const newStreak = streakData as unknown as number;
        const msg = getMilestoneMessage(newStreak);
        if (msg) {
          setTimeout(() => toast({ title: `🔥 ${newStreak} day streak!`, description: msg }), 1500);
        }
      } catch { /* ignore */ }
      onLogged();
    }
  };

  if (!open) return null;

  // Show food detail screen
  if (detailFood) {
    return (
      <FoodDetailScreen
        food={{
          id: detailFood.id,
          name: detailFood.name,
          brand: detailFood.brand,
          calories_per_100g: detailFood.calories_per_100g ?? (detailFood.calories / (detailFood.serving_size / 100)),
          protein_per_100g: detailFood.protein_per_100g ?? (detailFood.protein / (detailFood.serving_size / 100)),
          carbs_per_100g: detailFood.carbs_per_100g ?? (detailFood.carbs / (detailFood.serving_size / 100)),
          fat_per_100g: detailFood.fat_per_100g ?? (detailFood.fat / (detailFood.serving_size / 100)),
          fiber_per_100g: detailFood.fiber_per_100g ?? ((detailFood.fiber ?? 0) / (detailFood.serving_size / 100)),
          sugar_per_100g: detailFood.sugar_per_100g ?? ((detailFood.sugar ?? 0) / (detailFood.serving_size / 100)),
          sodium_per_100g: detailFood.sodium_per_100g ?? ((detailFood.sodium ?? 0) / (detailFood.serving_size / 100)),
          serving_size_g: detailFood.serving_size,
          serving_unit: detailFood.serving_unit,
          serving_description: detailFood.serving_description,
          additional_serving_sizes: detailFood.additional_serving_sizes,
          source: detailFood.source,
          is_branded: detailFood.is_branded,
          image_url: detailFood.image_url,
        }}
        mealType={mealType}
        mealLabel={mealLabel}
        onConfirm={handleDetailConfirm}
        onBack={() => setDetailFood(null)}
      />
    );
  }

  const allDisplayItems = [
    ...results,
    ...offResults.filter(o => !results.some(r => r.name.toLowerCase() === o.name.toLowerCase())),
  ];
  const displayItems = search.length >= 2 ? allDisplayItems : [];
  const showHistory = search.length < 2 && activeTab === "all";
  const showMeals = activeTab === "my-meals";
  const showRecipes = activeTab === "my-recipes";
  const showMyFoods = activeTab === "my-foods";

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border">
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="flex-1 text-center text-base font-semibold text-foreground tracking-tight">
          {mealLabel}
        </h1>
        <div className="w-8" />
      </div>

      {/* Search Bar */}
      <div className="px-4 pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchRef}
            placeholder="Search food or brand..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10 h-11 rounded-xl bg-secondary border-0 text-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/50"
          />
          {(searching || offSearching) && (
            <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 pb-2">
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); if (search.length >= 2) handleSearch(search); }}
              className={cn(
                "whitespace-nowrap px-3.5 py-1.5 text-xs font-medium rounded-full transition-all",
                activeTab === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-24">
        {/* Quick Actions */}
        {search.length < 2 && !showMeals && (
          <div className="grid grid-cols-4 gap-2.5 py-3">
            <QuickActionCard icon={ScanBarcode} label="Barcode" onClick={() => setBarcodeOpen(true)} />
            <QuickActionCard icon={Camera} label="Meal Scan" onClick={() => setMealScanOpen(true)} />
            <QuickActionCard icon={Zap} label="Quick Add" onClick={() => setQuickAddOpen(true)} />
            <QuickActionCard icon={Mic} label="Voice Log" onClick={() => toast({ title: "Coming Soon", description: "Voice logging is under development." })} />
          </div>
        )}

        {/* Quick Add Panel */}
        {quickAddOpen && (
          <div className="mb-4 rounded-xl border border-border bg-card p-4 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Quick Add</span>
              <button onClick={() => setQuickAddOpen(false)} className="text-xs text-muted-foreground">Cancel</button>
            </div>
            <Input placeholder="Food name" value={quickName} onChange={(e) => setQuickName(e.target.value)} className="h-9 text-sm bg-secondary border-0 rounded-lg" />
            <div className="grid grid-cols-4 gap-2">
              <Input placeholder="Cal" type="number" value={quickCal} onChange={(e) => setQuickCal(e.target.value)} className="h-9 text-sm bg-secondary border-0 rounded-lg text-center" />
              <Input placeholder="P" type="number" value={quickProtein} onChange={(e) => setQuickProtein(e.target.value)} className="h-9 text-sm bg-secondary border-0 rounded-lg text-center" />
              <Input placeholder="C" type="number" value={quickCarbs} onChange={(e) => setQuickCarbs(e.target.value)} className="h-9 text-sm bg-secondary border-0 rounded-lg text-center" />
              <Input placeholder="F" type="number" value={quickFat} onChange={(e) => setQuickFat(e.target.value)} className="h-9 text-sm bg-secondary border-0 rounded-lg text-center" />
            </div>
            <Button onClick={handleQuickAdd} disabled={!quickName} className="w-full h-9 text-sm rounded-lg">
              Log
            </Button>
          </div>
        )}

        {/* Saved Meals Tab */}
        {showMeals && (
          <div className="space-y-1.5 py-2">
            {savedMeals.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">No saved meals yet</p>
            ) : (
              savedMeals.map((meal) => (
                <div key={meal.id} className="flex items-center justify-between rounded-xl bg-card border border-border/50 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{meal.name}</div>
                    <div className="text-xs text-muted-foreground">{meal.calories} cal · {meal.protein}P · {meal.carbs}C · {meal.fat}F</div>
                  </div>
                  <button
                    onClick={() => logSavedMeal(meal)}
                    className="ml-3 h-8 w-8 flex items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* My Recipes Tab */}
        {showRecipes && (
          <div className="space-y-1.5 py-2">
            {userRecipes.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-muted-foreground">No recipes yet</p>
                <p className="text-xs text-muted-foreground mt-1">Create recipes from the Nutrition page to see them here.</p>
              </div>
            ) : (
              userRecipes.map((recipe) => (
                <div key={recipe.id} className="flex items-center justify-between rounded-xl bg-card border border-border/50 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">🍳 {recipe.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {recipe.calories_per_100g} cal · {recipe.protein_per_100g}P · {recipe.carbs_per_100g}C · {recipe.fat_per_100g}F
                      <span className="text-muted-foreground/60"> per 100g</span>
                      <span className="ml-1.5 text-muted-foreground/60">({Math.round(recipe.total_weight_g)}g total)</span>
                    </div>
                  </div>
                  <button
                    onClick={() => logRecipe(recipe)}
                    className="ml-3 h-8 w-8 flex items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* My Foods Tab */}
        {showMyFoods && search.length < 2 && (
          <div className="space-y-1.5 py-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your Custom Foods</span>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setQuickAddOpen(true)}>
                <Plus className="h-3 w-3 mr-1" /> Create
              </Button>
            </div>
            {customFoods.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-muted-foreground">No custom foods yet</p>
                <p className="text-xs text-muted-foreground mt-1">Use Quick Add or create custom foods to see them here.</p>
              </div>
            ) : (
              customFoods.map((item) => (
                <FoodRow
                  key={item.id}
                  item={item}
                  expanded={expandedId === item.id}
                  onToggle={() => toggleExpand(item.id)}
                  onAdd={() => logFood(item)}
                  servings={servings[item.id] || (item.serving_size > 0 ? String(item.serving_size) : "1")}
                  onServingsChange={(v) => setServings(prev => ({ ...prev, [item.id]: v }))}
                  servingUnit={servingUnits[item.id] || "g"}
                  onServingUnitChange={(u) => {
                    setServingUnits(prev => ({ ...prev, [item.id]: u }));
                    if (u === "serving") setServings(prev => ({ ...prev, [item.id]: "1" }));
                    else if (u === "g") setServings(prev => ({ ...prev, [item.id]: String(item.serving_size) }));
                    else if (u === "oz") setServings(prev => ({ ...prev, [item.id]: String(Math.round(item.serving_size / 28.3495 * 10) / 10) }));
                  }}
                />
              ))
            )}
          </div>
        )}

        {showHistory && !quickAddOpen && (
          <div className="py-2">
            <FrequentMealsSection
              mealName={mealType}
              onLogMeal={async (foods) => {
                for (const food of foods) {
                  await logFood({
                    id: food.id,
                    name: food.name,
                    brand: food.brand,
                    calories: food.calories ?? 0,
                    protein: food.protein ?? 0,
                    carbs: food.carbs ?? 0,
                    fat: food.fat ?? 0,
                    serving_size: food.serving_size,
                    serving_unit: food.serving_unit,
                  } as FoodItem);
                }
              }}
            />
          </div>
        )}

        {/* History Section */}
        {showHistory && !quickAddOpen && (
          <div className="py-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">History</span>
              <button
                onClick={() => setHistorySort(historySort === "recent" ? "frequent" : "recent")}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {historySort === "recent" ? (
                  <><Clock className="h-3 w-3" /> Recent</>
                ) : (
                  <><TrendingUp className="h-3 w-3" /> Frequent</>
                )}
              </button>
            </div>
            <div className="space-y-1">
              {history.map((item) => (
                <FoodRow
                  key={item.id}
                  item={item}
                  expanded={expandedId === item.id}
                  onToggle={() => toggleExpand(item.id)}
                  onAdd={() => logFood(item)}
                  servings={servings[item.id] || (item.serving_size > 0 ? String(item.serving_size) : "1")}
                  onServingsChange={(v) => setServings(prev => ({ ...prev, [item.id]: v }))}
                  servingUnit={servingUnits[item.id] || "g"}
                  onServingUnitChange={(u) => {
                    setServingUnits(prev => ({ ...prev, [item.id]: u }));
                    if (u === "serving") setServings(prev => ({ ...prev, [item.id]: "1" }));
                    else if (u === "g") setServings(prev => ({ ...prev, [item.id]: String(item.serving_size) }));
                    else if (u === "oz") setServings(prev => ({ ...prev, [item.id]: String(Math.round(item.serving_size / 28.3495 * 10) / 10) }));
                  }}
                />
              ))}
              {history.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-8">No history yet. Start logging!</p>
              )}
            </div>
          </div>
        )}

        {/* Search Results */}
        {search.length >= 2 && (
          <div className="space-y-1 py-2">
            {searching ? (
              <div className="flex justify-center py-12">
                <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : displayItems.length === 0 && !offSearching ? (
              <div className="text-center py-12">
                <p className="text-sm text-muted-foreground">No results found for "{search}"</p>
                <p className="text-xs text-muted-foreground mt-1">Try a different spelling or add a custom food.</p>
                <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={() => setQuickAddOpen(true)}>
                  <Plus className="h-3 w-3 mr-1" /> Add Custom Food
                </Button>
              </div>
            ) : (
              displayItems.map((item) => (
                <FoodRow
                  key={item.id}
                  item={item}
                  expanded={expandedId === item.id}
                  onToggle={() => openFoodDetail(item)}
                  onAdd={() => openFoodDetail(item)}
                  servings={servings[item.id] || (item.serving_size > 0 ? String(item.serving_size) : "1")}
                  onServingsChange={(v) => setServings(prev => ({ ...prev, [item.id]: v }))}
                  servingUnit={servingUnits[item.id] || "g"}
                  onServingUnitChange={(u) => {
                    setServingUnits(prev => ({ ...prev, [item.id]: u }));
                    if (u === "serving") setServings(prev => ({ ...prev, [item.id]: "1" }));
                    else if (u === "g") setServings(prev => ({ ...prev, [item.id]: String(item.serving_size) }));
                    else if (u === "oz") setServings(prev => ({ ...prev, [item.id]: String(Math.round(item.serving_size / 28.3495 * 10) / 10) }));
                  }}
                />
              ))
            )}
            {offSearching && (
              <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Searching branded foods...
              </div>
            )}
          </div>
        )}
      </div>

      <BarcodeScanner open={barcodeOpen} onOpenChange={setBarcodeOpen} onLogged={() => { setBarcodeOpen(false); onLogged(); }} />
      <MealScanCapture open={mealScanOpen} onClose={() => setMealScanOpen(false)} mealType={mealType} onLogged={onLogged} />
    </div>
  );
};

/* ── Food Row with Emoji Icons ── */

interface FoodRowProps {
  item: FoodItem;
  expanded: boolean;
  onToggle: () => void;
  onAdd: () => void;
  servings: string;
  onServingsChange: (v: string) => void;
  servingUnit: ServingUnit;
  onServingUnitChange: (u: ServingUnit) => void;
}

const FoodRow = ({ item, expanded, onToggle, onAdd, servings, onServingsChange, servingUnit, onServingUnitChange }: FoodRowProps) => {
  const inputVal = parseFloat(servings) || 0;
  let multiplier: number;
  if (servingUnit === "g") {
    const baseSizeG = item.serving_unit === "oz" ? item.serving_size * 28.3495 : item.serving_size;
    multiplier = inputVal / baseSizeG;
  } else if (servingUnit === "oz") {
    const baseSizeOz = item.serving_unit === "g" ? item.serving_size / 28.3495 : item.serving_size;
    multiplier = inputVal / baseSizeOz;
  } else {
    multiplier = inputVal;
  }

  const getSourceBadge = () => {
    if (item.source === "usda" || item.data_source === "usda") {
      return <Badge className="h-3.5 px-1 text-[8px] bg-green-500/20 text-green-400 border-green-500/30">✓ USDA</Badge>;
    }
    if (item.source === "off" || item.data_source === "open_food_facts") {
      return <Badge variant="outline" className="h-3.5 px-1 text-[8px]">Branded</Badge>;
    }
    if (item.brand) {
      return <Badge variant="outline" className="h-3.5 px-1 text-[8px]">Branded</Badge>;
    }
    if (item.is_verified) {
      return <Badge className="h-3.5 px-1 text-[8px] bg-green-500/20 text-green-400">✓</Badge>;
    }
    return null;
  };

  return (
    <div className="rounded-xl bg-card border border-border/50 overflow-hidden transition-all">
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Emoji Icon */}
        <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0 text-lg">
          {getFoodEmoji(item)}
        </div>
        <button onClick={onToggle} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-foreground truncate">{item.name}</span>
            {getSourceBadge()}
          </div>
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            <span className="text-xs text-muted-foreground">{item.calories} cal</span>
            {item.serving_description && (
              <span className="text-xs text-muted-foreground/60">· {item.serving_description}</span>
            )}
            {!item.serving_description && (
              <span className="text-xs text-muted-foreground/60">· {item.serving_size}{item.serving_unit}</span>
            )}
            {item.brand && <span className="text-xs text-muted-foreground/60">· {item.brand}</span>}
          </div>
        </button>
        <button onClick={onToggle} className="p-1 text-muted-foreground">
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={onAdd}
          className="h-8 w-8 flex items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-3 pt-0 border-t border-border/30 animate-fade-in">
          <div className="flex items-center gap-2 mb-3 mt-2">
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={servings}
              placeholder="0"
              onFocus={(e) => e.target.select()}
              onChange={(e) => onServingsChange(e.target.value)}
              className="h-7 w-20 text-xs text-center bg-secondary border-0 rounded-lg"
            />
            <div className="flex rounded-lg overflow-hidden border border-border/50">
              {(["g", "oz", "serving"] as ServingUnit[]).map((u) => (
                <button
                  key={u}
                  onClick={() => onServingUnitChange(u)}
                  className={cn(
                    "px-2 py-1 text-[10px] font-medium transition-colors",
                    servingUnit === u
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {u === "serving" ? `× ${item.serving_size}${item.serving_unit}` : u}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
            <MacroRow label="Protein" value={`${Math.round(item.protein * multiplier * 10) / 10}g`} color="text-red-400" />
            <MacroRow label="Carbs" value={`${Math.round(item.carbs * multiplier * 10) / 10}g`} color="text-blue-400" />
            <MacroRow label="Fat" value={`${Math.round(item.fat * multiplier * 10) / 10}g`} color="text-yellow-400" />
            <MacroRow label="Fiber" value={`${Math.round((item.fiber || 0) * multiplier * 10) / 10}g`} />
            <MacroRow label="Sugar" value={`${Math.round((item.sugar || 0) * multiplier * 10) / 10}g`} />
            <MacroRow label="Sodium" value={`${Math.round((item.sodium || 0) * multiplier)}mg`} />
          </div>
          <div className="mt-2 text-center">
            <span className="text-lg font-bold text-foreground">{Math.round(item.calories * multiplier)}</span>
            <span className="text-xs text-muted-foreground ml-1">cal total</span>
          </div>
        </div>
      )}
    </div>
  );
};

const MacroRow = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div className="flex justify-between">
    <span className="text-muted-foreground">{label}</span>
    <span className={cn("font-medium", color || "text-foreground")}>{value}</span>
  </div>
);

const QuickActionCard = ({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="flex flex-col items-center gap-1.5 rounded-xl border border-border/50 bg-card py-3 px-2 hover:bg-secondary transition-colors"
  >
    <Icon className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
    <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
  </button>
);

export default AddFoodScreen;
