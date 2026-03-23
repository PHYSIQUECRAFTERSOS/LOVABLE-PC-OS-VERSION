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
  UtensilsCrossed,
  Plus,
  ChevronDown,
  ChevronUp,
  BadgeCheck,
  Clock,
  TrendingUp,
  Loader2,
  Youtube,
  Star,
  Info,
  Trash2,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { getFoodEmoji } from "@/utils/foodEmoji";
import { Badge } from "@/components/ui/badge";
import BarcodeScanner from "@/components/nutrition/BarcodeScanner";
import MealScanCapture from "@/components/nutrition/MealScanCapture";
import SavedMealDetail from "@/components/nutrition/SavedMealDetail";
import CreateMealSheet from "@/components/nutrition/CreateMealSheet";
import CopyPreviousMealSheet from "@/components/nutrition/CopyPreviousMealSheet";
import PCRecipeDetail from "@/components/nutrition/PCRecipeDetail";
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
  is_recent?: boolean;
  is_favorite?: boolean;
  log_count?: number;
  calories_per_100g?: number;
  protein_per_100g?: number;
  carbs_per_100g?: number;
  fat_per_100g?: number;
  fiber_per_100g?: number;
  sugar_per_100g?: number;
  sodium_per_100g?: number;
  // Micronutrient data from USDA (per 100g)
  _micros_per_100g?: Record<string, number | null>;
}

interface AddFoodScreenProps {
  mealType: string;
  mealLabel: string;
  logDate?: string;
  open: boolean;
  onClose: () => void;
  onLogged: () => void;
}

type TabKey = "all" | "favorites" | "my-meals" | "custom" | "pc-recipes";
type HistorySort = "recent" | "frequent";
type ServingUnit = "serving" | "g" | "oz";

const TABS: { key: TabKey; label: string; stackedLabel?: string }[] = [
  { key: "all", label: "All" },
  { key: "favorites", label: "★ Favs" },
  { key: "my-meals", label: "My\nMeals", stackedLabel: "My\nMeals" },
  { key: "custom", label: "Custom Foods" },
  { key: "pc-recipes", label: "PC Recipes" },
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
  const [bestMatches, setBestMatches] = useState<FoodItem[]>([]);
  const [moreResultsList, setMoreResultsList] = useState<FoodItem[]>([]);
  const [wasWidened, setWasWidened] = useState(false);
  const [usedQuery, setUsedQuery] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [favoriteFoods, setFavoriteFoods] = useState<FoodItem[]>([]);
  const [offResults, setOffResults] = useState<FoodItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [offSearching, setOffSearching] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historySort, setHistorySort] = useState<HistorySort>("recent");
  const [history, setHistory] = useState<FoodItem[]>([]);
  const [savedMeals, setSavedMeals] = useState<any[]>([]);
  const [pcRecipes, setPcRecipes] = useState<any[]>([]);
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

  // My Meals sub-screens
  const [selectedMeal, setSelectedMeal] = useState<any>(null);
  const [showCreateMeal, setShowCreateMeal] = useState(false);
  const [showCopyMeal, setShowCopyMeal] = useState(false);

  // PC Recipes sub-screens
  const [selectedPCRecipe, setSelectedPCRecipe] = useState<any>(null);
  const [pcRecipeSearch, setPcRecipeSearch] = useState("");

  // Custom Foods
  const [customFoods, setCustomFoods] = useState<any[]>([]);
  const [showCreateFood, setShowCreateFood] = useState(false);
  const [editingCustomFood, setEditingCustomFood] = useState<any>(null);

  useEffect(() => {
    if (open) {
      setActiveTab("all");
      setTimeout(() => searchRef.current?.focus(), 100);
      fetchHistory();
      fetchSavedMeals();
      fetchPCRecipes();
      fetchCustomFoods();
      fetchFavoriteFoods();
    }
  }, [open]);

  const fetchFavoriteFoods = async () => {
    if (!user) return;
    try {
      const { data: historyRows } = await supabase
        .from("user_food_history" as any)
        .select("food_id")
        .eq("user_id", user.id)
        .eq("is_favorite", true)
        .order("last_logged_at", { ascending: false })
        .limit(100);
      if (!historyRows || historyRows.length === 0) {
        setFavoriteFoods([]);
        setFavorites(new Set());
        return;
      }
      const foodIds = (historyRows as any[]).map(r => r.food_id).filter(Boolean);
      setFavorites(new Set(foodIds));
      if (foodIds.length === 0) { setFavoriteFoods([]); return; }
      const { data: foods } = await supabase
        .from("food_items")
        .select("id, name, brand, serving_size, serving_unit, calories, protein, carbs, fat, fiber, sugar, sodium, is_verified, data_source, category")
        .in("id", foodIds);
      if (foods) {
        const ordered = foodIds.map(id => foods.find(f => f.id === id)).filter(Boolean) as FoodItem[];
        setFavoriteFoods(ordered);
      }
    } catch { setFavoriteFoods([]); }
  };

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

  const fetchPCRecipes = async () => {
    const { data } = await supabase
      .from("pc_recipes" as any)
      .select("*")
      .eq("is_published", true)
      .order("name");
    setPcRecipes((data as any[]) || []);
  };

  const fetchCustomFoods = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("client_custom_foods")
      .select("*")
      .eq("client_id", user.id)
      .order("created_at", { ascending: false });
    setCustomFoods(data || []);
  };

  useEffect(() => { fetchHistory(); }, [historySort]);

  const FALLBACK_BRAND_ALIASES: Record<string, string[]> = {
    costco: ["kirkland", "kirkland signature"],
    kirkland: ["costco"], "kirkland signature": ["costco"],
    "trader joe's": ["trader joes"], "trader joes": ["trader joe's"],
    walmart: ["great value"], "great value": ["walmart"],
  };

  const tokenizedFallbackSearch = async (q: string): Promise<FoodItem[]> => {
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    // Build tokenized OR conditions
    const orParts = tokens.flatMap(t => [`name.ilike.%${t}%`, `brand.ilike.%${t}%`]);
    // Add brand aliases
    const joined = tokens.join(" ");
    for (const [key, aliases] of Object.entries(FALLBACK_BRAND_ALIASES)) {
      if (joined.includes(key)) {
        for (const alias of aliases) orParts.push(`brand.ilike.%${alias}%`);
      }
    }

    // Try foods cache table first (has external results cached)
    const { data: cachedFoods } = await supabase
      .from("foods" as any)
      .select("id, name, brand, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g, sodium_per_100g, serving_size_g, serving_unit, serving_description, is_verified, source, is_branded, image_url")
      .or(orParts.join(","))
      .not("calories_per_100g", "is", null)
      .limit(50);

    if (cachedFoods && cachedFoods.length > 0) {
      return (cachedFoods as any[]).map((f: any) => ({
        id: f.id,
        name: f.name,
        brand: f.brand || null,
        serving_size: f.serving_size_g ?? 100,
        serving_unit: f.serving_unit ?? "g",
        serving_description: f.serving_description ?? null,
        calories: Math.round((f.calories_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100),
        protein: Math.round((f.protein_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100),
        carbs: Math.round((f.carbs_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100),
        fat: Math.round((f.fat_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100),
        fiber: Math.round((f.fiber_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100),
        sugar: Math.round((f.sugar_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100),
        sodium: Math.round((f.sodium_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100),
        is_verified: f.is_verified,
        source: f.source === "usda" ? "usda" as const : f.source === "open_food_facts" ? "off" as const : "local" as const,
        is_branded: f.is_branded,
        image_url: f.image_url,
      } as FoodItem));
    }

    // Fallback to food_items
    const { data: fallback } = await supabase
      .from("food_items")
      .select("id, name, brand, serving_size, serving_unit, calories, protein, carbs, fat, fiber, sugar, sodium, is_verified, data_source, category")
      .or(orParts.join(","))
      .order("is_verified", { ascending: false })
      .limit(50);

    return (fallback || []) as FoodItem[];
  };

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
        // Layer 1: Edge function
        const { data, error } = await supabase.functions.invoke("search-foods", {
          body: { query: q, limit: 25, user_id: user?.id ?? null },
        });

        if (searchRequestIdRef.current !== requestId) return;

        if (!error && data?.foods?.length > 0) {
          setWasWidened(data.wasWidened ?? false);
          setUsedQuery(data.usedQuery ?? q);
          const mapFood = (f: any): FoodItem => ({
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
            source: f.source === "usda" ? "usda" as const : (f.source === "local" ? "local" as const : "off" as const),
            is_branded: f.is_branded,
            image_url: f.image_url,
            _micros_per_100g: (() => {
              // Extract micros for ANY source that has them (USDA, local cached USDA, etc.)
              const micros: Record<string, number | null> = {};
              const microKeys = [
                "vitamin_a_mcg", "vitamin_c_mg", "vitamin_d_mcg", "vitamin_e_mg", "vitamin_k_mcg",
                "vitamin_b1_mg", "vitamin_b2_mg", "vitamin_b3_mg", "vitamin_b5_mg", "vitamin_b6_mg",
                "vitamin_b9_mcg", "vitamin_b12_mcg",
                "calcium_mg", "iron_mg", "magnesium_mg", "phosphorus_mg", "potassium_mg",
                "zinc_mg", "copper_mg", "manganese_mg", "selenium_mcg", "cholesterol",
                "omega_3", "omega_6", "saturated_fat", "trans_fat", "monounsaturated_fat", "polyunsaturated_fat",
              ];
              let hasAny = false;
              for (const key of microKeys) {
                const val = f[`${key}_per_100g`] ?? f[key] ?? null;
                if (val != null && typeof val === "number" && val > 0) {
                  micros[key] = val;
                  hasAny = true;
                }
              }
              return hasAny ? micros : undefined;
            })(),
          });

          const foods = data.foods.map(mapFood);
          setResults(foods);

          // Use grouped response if available
          if (data.bestMatches?.length > 0 || data.moreResults?.length > 0) {
            setBestMatches(data.bestMatches.map(mapFood));
            setMoreResultsList(data.moreResults.map(mapFood));
          } else {
            setBestMatches([]);
            setMoreResultsList([]);
          }
          // Track favorites from response
          const favSet = new Set<string>();
          data.foods.forEach((f: any) => { if (f.is_favorite) favSet.add(f.id); });
          if (favSet.size > 0) setFavorites(prev => new Set([...prev, ...favSet]));
          setOffResults([]);
        } else {
          console.log("[AddFoodScreen] Layer 1 empty/error, trying Layer 2 tokenized fallback");
          const fallbackResults = await tokenizedFallbackSearch(q);
          if (searchRequestIdRef.current !== requestId) return;
          setResults(fallbackResults);
          setBestMatches([]);
          setMoreResultsList([]);
          setOffResults([]);
        }
      } catch (err) {
        console.error("[AddFoodScreen] Search error:", err);
        try {
          const fallbackResults = await tokenizedFallbackSearch(q);
          if (searchRequestIdRef.current !== requestId) return;
          setResults(fallbackResults);
          setBestMatches([]);
          setMoreResultsList([]);
        } catch {
          setResults([]);
          setBestMatches([]);
          setMoreResultsList([]);
        }
        setOffResults([]);
      } finally {
        if (searchRequestIdRef.current === requestId) {
          setSearching(false);
          setOffSearching(false);
        }
      }
    }, 300);
  }, [user]);

  const importOFFFood = async (food: FoodItem): Promise<FoodItem | null> => {
    if (!user) return null;
    try {
      const foodItem: Record<string, any> = {
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
        data_source: food.source === "usda" ? "usda" : "open_food_facts",
        created_by: user.id,
        is_verified: food.source === "usda",
      };

      // Include micronutrient data if available (USDA foods carry this)
      if (food._micros_per_100g) {
        const servingRatio = (food.serving_size || 100) / 100;
        Object.entries(food._micros_per_100g).forEach(([key, val]) => {
          if (val != null && typeof val === "number" && val > 0) {
            foodItem[key] = Math.round(val * servingRatio * 100) / 100;
          }
        });
      }

      const { data: inserted, error } = await supabase
        .from("food_items")
        .insert(foodItem as any)
        .select("*")
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

    let foodToLog = item;
    let foodItemId: string | null = null;

    // Import external foods into food_items for FK reference
    if (item.source !== "local") {
      const imported = await importOFFFood(item);
      if (imported) {
        foodToLog = imported;
        foodItemId = imported.id;
      }
      // If import fails, we still log with custom_name — don't return early
    } else {
      foodItemId = item.id;
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

    // Fetch micronutrient data from food_items if we have a food_item_id
    let micros: Record<string, number> = {};
    if (foodItemId) {
      try {
        const { extractMicros } = await import("@/utils/micronutrientHelper");
        const { data: fullFood } = await supabase
          .from("food_items")
          .select("*")
          .eq("id", foodItemId)
          .maybeSingle();
        if (fullFood) {
          micros = extractMicros(fullFood, multiplier);
        }
      } catch (err) {
        console.warn("[logFood] Could not fetch micros:", err);
      }
    }

    const { error } = await supabase.from("nutrition_logs").insert({
      client_id: user.id,
      food_item_id: foodItemId,
      custom_name: foodToLog.name, // ALWAYS set custom_name as fallback
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
      ...micros,
    } as any);

    if (error) {
      console.error("[NutritionLog] Insert error:", error);
      toast({ title: "Couldn't save this food", description: error.message, variant: "destructive" });
    } else {
      const t = toast({ title: `${foodToLog.name} logged` });
      setTimeout(() => t.dismiss(), 1000);
      // Log to user_food_history (fire-and-forget)
      if (foodItemId) {
        supabase.rpc("log_food_to_history" as any, { p_user_id: user.id, p_food_id: foodItemId }).then(() => {});
      }
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

  const logSavedMealQuick = async (meal: any) => {
    if (!user) return;
    // Check if meal has individual items
    const { data: items } = await supabase
      .from("saved_meal_items" as any)
      .select("*")
      .eq("saved_meal_id", meal.id);

    if (items && (items as any[]).length > 0) {
      // Log each item individually
      const entries = (items as any[]).map(item => ({
        client_id: user.id,
        food_item_id: item.food_item_id || null,
        custom_name: item.food_item_id ? null : item.food_name,
        meal_type: mealType,
        servings: item.quantity || 1,
        calories: Math.round(item.calories || 0),
        protein: Math.round(item.protein || 0),
        carbs: Math.round(item.carbs || 0),
        fat: Math.round(item.fat || 0),
        logged_at: effectiveDate,
        tz_corrected: true,
      }));
      const { error } = await supabase.from("nutrition_logs").insert(entries);
      if (error) {
        toast({ title: "Couldn't log meal." });
      } else {
        const t = toast({ title: `${meal.name} added to ${mealLabel}` });
        setTimeout(() => t.dismiss(), 1000);
        onLogged();
      }
    } else {
      // Flat macro log
      const { error } = await supabase.from("nutrition_logs").insert({
        client_id: user.id,
        custom_name: meal.name,
        meal_type: mealType,
        servings: 1,
        calories: meal.calories || 0,
        protein: meal.protein || 0,
        carbs: meal.carbs || 0,
        fat: meal.fat || 0,
        logged_at: effectiveDate,
        tz_corrected: true,
      });
      if (error) {
        toast({ title: "Couldn't log meal." });
      } else {
        const t = toast({ title: `${meal.name} added to ${mealLabel}` });
        setTimeout(() => t.dismiss(), 1000);
        onLogged();
      }
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
      toast({ title: "Couldn't save this food. Please try again." });
    } else {
      const t = toast({ title: "Logged!" });
      setTimeout(() => t.dismiss(), 1000);
      setQuickAddOpen(false);
      setQuickName(""); setQuickCal(""); setQuickProtein(""); setQuickCarbs(""); setQuickFat("");
      onLogged();
    }
  };

  const logCustomFood = async (food: any, quantity?: number) => {
    if (!user) return;
    const ss = parseFloat(food.serving_size) || 100;
    const servingUnit = food.serving_unit || "serving";
    const qty = quantity ?? 1;
    const multiplier = qty;

    // Find or create a food_items entry so EditFoodModal can properly scale macros
    let foodItemId: string | null = null;
    try {
      const { data: existing } = await supabase
        .from("food_items")
        .select("id")
        .eq("name", food.name)
        .eq("created_by", user.id)
        .eq("data_source", "custom")
        .limit(1);

      if (existing && existing.length > 0) {
        foodItemId = existing[0].id;
      } else {
        const { data: newItem } = await supabase
          .from("food_items")
          .insert({
            name: food.name,
            brand: food.brand || null,
            serving_size: ss,
            serving_unit: servingUnit,
            calories: food.calories || 0,
            protein: food.protein || 0,
            carbs: food.carbs || 0,
            fat: food.fat || 0,
            fiber: food.fiber || 0,
            sugar: food.sugar || 0,
            sodium: food.sodium || 0,
            data_source: "custom",
            created_by: user.id,
          })
          .select("id")
          .single();
        if (newItem) foodItemId = newItem.id;
      }
    } catch (err) {
      console.warn("[logCustomFood] Could not create food_items entry:", err);
    }

    // Fetch micros from food_items if available
    let micros: Record<string, number> = {};
    if (foodItemId) {
      try {
        const { extractMicros } = await import("@/utils/micronutrientHelper");
        const { data: fullFood } = await supabase
          .from("food_items")
          .select("*")
          .eq("id", foodItemId)
          .maybeSingle();
        if (fullFood) {
          micros = extractMicros(fullFood, multiplier);
        }
      } catch (err) {
        console.warn("[logCustomFood] Could not fetch micros:", err);
      }
    }

    const displayName = food.name + (food.brand ? ` (${food.brand})` : "");
    const quantityDisplay = qty * ss;

    const { error } = await supabase.from("nutrition_logs").insert({
      client_id: user.id,
      food_item_id: foodItemId,
      custom_name: displayName,
      meal_type: mealType,
      servings: multiplier,
      calories: Math.round((food.calories || 0) * multiplier),
      protein: Math.round((food.protein || 0) * multiplier),
      carbs: Math.round((food.carbs || 0) * multiplier),
      fat: Math.round((food.fat || 0) * multiplier),
      fiber: Math.round((food.fiber || 0) * multiplier),
      sugar: Math.round((food.sugar || 0) * multiplier),
      sodium: Math.round((food.sodium || 0) * multiplier),
      quantity_display: quantityDisplay,
      quantity_unit: servingUnit === "g" ? "g" : servingUnit,
      logged_at: effectiveDate,
      tz_corrected: true,
      ...micros,
    } as any);
    if (error) {
      toast({ title: "Couldn't save this food. Please try again." });
    } else {
      const t = toast({ title: `${food.name} logged` });
      setTimeout(() => t.dismiss(), 1000);
      if (foodItemId) {
        supabase.rpc("log_food_to_history" as any, { p_user_id: user.id, p_food_id: foodItemId }).then(() => {});
      }
      onLogged();
    }
  };

  const deleteCustomFood = async (id: string) => {
    const { error } = await supabase.from("client_custom_foods").delete().eq("id", id);
    if (!error) {
      toast({ title: "Custom food deleted" });
      fetchCustomFoods();
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleToggleFavorite = async (foodId: string, foodItem?: FoodItem) => {
    if (!user) return;
    try {
      let localId = foodId;

      // If the food is non-local, import it first so toggle_food_favorite references a real food_items row
      if (foodItem && foodItem.source !== "local") {
        const imported = await importOFFFood(foodItem);
        if (imported?.id) {
          localId = imported.id;
          // Update the item in results so subsequent toggles use the correct ID
          setResults(prev => prev.map(r => r.id === foodId ? { ...r, id: localId, source: "local" as const } : r));
          setBestMatches(prev => prev.map(r => r.id === foodId ? { ...r, id: localId, source: "local" as const } : r));
          setMoreResultsList(prev => prev.map(r => r.id === foodId ? { ...r, id: localId, source: "local" as const } : r));
        } else {
          toast({ title: "Couldn't save this food to favorites" });
          return;
        }
      }

      const { data: newState } = await supabase.rpc("toggle_food_favorite" as any, {
        p_user_id: user.id,
        p_food_id: localId,
      });
      setFavorites(prev => {
        const next = new Set(prev);
        if (newState) next.add(localId);
        else next.delete(localId);
        return next;
      });
      // Refresh favorites list
      fetchFavoriteFoods();
    } catch { /* ignore */ }
  };

  const openFoodDetail = (item: FoodItem) => {
    setDetailFood(item);
  };

  const handleDetailConfirm = async (entry: FoodDetailEntry) => {
    if (!user) return;

    let foodItemId = detailFood?.id;
    
    // Import any non-local food (off, usda, fatsecret) into food_items for FK reference
    if (detailFood && detailFood.source !== "local") {
      const imported = await importOFFFood(detailFood);
      if (imported) {
        foodItemId = imported.id;
      } else {
        // Import failed — still log with custom_name only, no FK
        foodItemId = null;
      }
    }

    // Fetch micronutrient data for detail-logged food
    let micros: Record<string, number> = {};
    if (foodItemId) {
      try {
        const { extractMicros } = await import("@/utils/micronutrientHelper");
        const { data: fullFood } = await supabase
          .from("food_items")
          .select("*")
          .eq("id", foodItemId)
          .maybeSingle();
        if (fullFood) {
          micros = extractMicros(fullFood, entry.quantity);
        }
      } catch (err) {
        console.warn("[handleDetailConfirm] Could not fetch micros:", err);
      }
    }

    const insertPayload: Record<string, any> = {
      client_id: user.id,
      food_item_id: foodItemId,
      custom_name: entry.food.name, // ALWAYS set custom_name as fallback
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
      ...micros,
    };

    let { error } = await supabase.from("nutrition_logs").insert(insertPayload as any);

    // Retry without food_item_id if FK constraint fails
    if (error && foodItemId) {
      console.warn("[handleDetailConfirm] FK insert failed, retrying without food_item_id:", error.message);
      insertPayload.food_item_id = null;
      const retry = await supabase.from("nutrition_logs").insert(insertPayload as any);
      error = retry.error;
    }

    if (error) {
      toast({ title: "Couldn't save this food. Please try again." });
    } else {
      const t = toast({ title: `${entry.food.name} logged` });
      setTimeout(() => t.dismiss(), 1000);
      // Log to user_food_history (fire-and-forget)
      if (foodItemId) {
        supabase.rpc("log_food_to_history" as any, { p_user_id: user.id, p_food_id: foodItemId }).then(() => {});
        supabase.from("user_food_serving_memory" as any).upsert({
          user_id: user.id,
          food_id: foodItemId,
          serving_size: entry.quantity,
          serving_unit: entry.servingDescription,
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

  // Sub-screens
  if (selectedMeal) {
    return (
      <SavedMealDetail
        meal={selectedMeal}
        mealType={mealType}
        mealLabel={mealLabel}
        logDate={effectiveDate}
        onBack={() => setSelectedMeal(null)}
        onLogged={() => { setSelectedMeal(null); onLogged(); }}
        onDeleted={() => { setSelectedMeal(null); fetchSavedMeals(); }}
        onUpdated={() => fetchSavedMeals()}
      />
    );
  }

  if (showCreateMeal) {
    return (
      <CreateMealSheet
        mealType={mealType}
        onClose={() => setShowCreateMeal(false)}
        onSaved={() => { setShowCreateMeal(false); fetchSavedMeals(); }}
      />
    );
  }

  if (showCopyMeal) {
    return (
      <CopyPreviousMealSheet
        mealType={mealType}
        mealLabel={mealLabel}
        logDate={effectiveDate}
        onClose={() => setShowCopyMeal(false)}
        onCopied={() => { setShowCopyMeal(false); onLogged(); }}
      />
    );
  }

  // CreateFoodScreen is now a dialog, rendered inline below - not a sub-screen

  if (selectedPCRecipe) {
    return (
      <PCRecipeDetail
        recipe={selectedPCRecipe}
        mealType={mealType}
        mealLabel={mealLabel}
        logDate={effectiveDate}
        onBack={() => setSelectedPCRecipe(null)}
        onLogged={() => { setSelectedPCRecipe(null); onLogged(); }}
      />
    );
  }

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

  // Prepend matching custom foods to search results for top priority
  const matchingCustomFoods: FoodItem[] = search.length >= 2
    ? customFoods
        .filter((cf: any) => cf.name.toLowerCase().includes(search.toLowerCase()) || (cf.brand && cf.brand.toLowerCase().includes(search.toLowerCase())))
        .map((cf: any) => ({
          id: `custom-${cf.id}`,
          name: cf.name + (cf.brand ? ` (${cf.brand})` : ""),
          brand: cf.brand || null,
          serving_size: parseFloat(cf.serving_size) || 100,
          serving_unit: cf.serving_unit || "g",
          calories: cf.calories || 0,
          protein: cf.protein || 0,
          carbs: cf.carbs || 0,
          fat: cf.fat || 0,
          fiber: cf.fiber || 0,
          sugar: cf.sugar || 0,
          sodium: cf.sodium || 0,
          source: "local" as const,
          is_verified: false,
          data_source: "custom",
          category: "Custom Food",
          _isClientCustom: true,
          _customFoodRef: cf,
        } as FoodItem & { _isClientCustom?: boolean; _customFoodRef?: any }))
    : [];

  const allDisplayItems = [
    ...matchingCustomFoods,
    ...results,
    ...offResults.filter(o => !results.some(r => r.name.toLowerCase() === o.name.toLowerCase())),
  ];
  const displayItems = search.length >= 2 ? allDisplayItems : [];
  const showHistory = search.length < 2 && activeTab === "all";
  const showFavorites = activeTab === "favorites";
  const showMeals = activeTab === "my-meals";
  const showCustom = activeTab === "custom";
  const showRecipes = activeTab === "pc-recipes";

  const filteredPCRecipes = pcRecipeSearch
    ? pcRecipes.filter((r: any) => r.name.toLowerCase().includes(pcRecipeSearch.toLowerCase()))
    : pcRecipes;

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
        {search.trim().length === 1 && (
          <p className="text-xs text-muted-foreground text-center mt-1.5">Type at least 2 characters to search</p>
        )}
      </div>

      {/* Widening notice */}
      {wasWidened && usedQuery && search.length >= 2 && !searching && (
        <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-secondary/60 flex items-center gap-2">
          <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground">Showing results for &ldquo;<span className="text-foreground font-medium">{usedQuery}</span>&rdquo;</span>
        </div>
      )}

      {/* Tabs - styled with gold active indicator */}
      <div className="px-4 pb-2 sticky top-0 z-10">
        <div className="flex">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); if (search.length >= 2) handleSearch(search); }}
              className={cn(
                "flex-1 py-2 text-sm font-medium transition-all border-b-2 whitespace-pre-line leading-tight",
                activeTab === tab.key
                  ? "text-primary border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-24">
        {/* Quick Actions (All tab only) */}
        {search.length < 2 && activeTab === "all" && (
          <div className="grid grid-cols-4 gap-2.5 py-3">
            <QuickActionCard icon={ScanBarcode} label="Barcode" onClick={() => setBarcodeOpen(true)} />
            <QuickActionCard icon={Camera} label="Meal Scan" onClick={() => setMealScanOpen(true)} />
            <QuickActionCard icon={Zap} label="Quick Add" onClick={() => setQuickAddOpen(true)} />
            <QuickActionCard icon={UtensilsCrossed} label="Custom" onClick={() => setShowCreateFood(true)} />
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

        {/* ═══ MY MEALS TAB ═══ */}
        {showMeals && (
          <div className="space-y-3 py-2">
            {/* Action buttons always visible */}
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                onClick={() => setShowCreateMeal(true)}
                className="w-full h-11 border-primary text-primary hover:bg-primary/10"
              >
                <Plus className="h-4 w-4 mr-2" /> Create Meal
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowCopyMeal(true)}
                className="w-full h-11"
              >
                Copy Previous Meal
              </Button>
            </div>

            {savedMeals.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">No saved meals yet</p>
            ) : (
              <div className="space-y-1.5">
                {savedMeals.map((meal) => (
                  <div key={meal.id} className="flex items-center justify-between rounded-xl bg-card border border-border/50 px-4 py-3">
                    <button
                      onClick={() => setSelectedMeal(meal)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="text-sm font-medium text-foreground truncate">{meal.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {meal.calories} cal · {meal.protein}P · {meal.carbs}C · {meal.fat}F
                      </div>
                    </button>
                    <button
                      onClick={() => logSavedMealQuick(meal)}
                      className="ml-3 h-10 w-10 flex items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ PC RECIPES TAB ═══ */}
        {showRecipes && (
          <div className="space-y-3 py-2">
            {/* Client-side search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search recipes..."
                value={pcRecipeSearch}
                onChange={e => setPcRecipeSearch(e.target.value)}
                className="pl-9 h-10 rounded-xl bg-secondary border-0 text-sm"
              />
            </div>

            {pcRecipes.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-muted-foreground">No recipes available yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Check back soon!</p>
              </div>
            ) : filteredPCRecipes.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">No recipes match "{pcRecipeSearch}"</p>
            ) : (
              <div className="space-y-1.5">
                {filteredPCRecipes.map((recipe: any) => (
                  <div key={recipe.id} className="flex items-center justify-between rounded-xl bg-card border border-border/50 px-4 py-3">
                    <button
                      onClick={() => setSelectedPCRecipe(recipe)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-foreground truncate">{recipe.name}</span>
                        {recipe.youtube_url && recipe.youtube_url.trim() !== "" && (
                          <Youtube className="h-3.5 w-3.5 text-red-500 shrink-0" />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {recipe.servings} serving{recipe.servings !== 1 ? "s" : ""}
                        {recipe.description && (
                          <span className="ml-1.5">· {recipe.description.slice(0, 50)}{recipe.description.length > 50 ? "..." : ""}</span>
                        )}
                      </div>
                    </button>
                    <button
                      onClick={() => setSelectedPCRecipe(recipe)}
                      className="ml-3 h-10 w-10 flex items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ CUSTOM FOODS TAB ═══ */}
        {showCustom && (
          <div className="space-y-3 py-2">
            <Button
              variant="outline"
              onClick={() => setShowCreateFood(true)}
              className="w-full h-11 border-primary text-primary hover:bg-primary/10"
            >
              <Plus className="h-4 w-4 mr-2" /> Create Custom Food
            </Button>

            {customFoods.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">No custom foods yet</p>
            ) : (
              <div className="space-y-1.5">
                {customFoods.map((food: any) => (
                  <div key={food.id} className="flex items-center justify-between rounded-xl bg-card border border-border/50 px-4 py-3">
                    <button
                      onClick={() => logCustomFood(food)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="text-sm font-medium text-foreground truncate">
                        {food.name}
                        {food.brand && <span className="text-muted-foreground font-normal"> · {food.brand}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {food.serving_size}{food.serving_unit && food.serving_unit !== 'g' ? food.serving_unit : 'g'} · {food.calories} cal · {food.protein}P · {food.carbs}C · {food.fat}F
                      </div>
                    </button>
                    <div className="flex gap-1 ml-2">
                      <button
                        onClick={() => logCustomFood(food)}
                        className="h-8 w-8 flex items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => { setEditingCustomFood(food); setShowCreateFood(true); }}
                        className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-secondary transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => deleteCustomFood(food.id)}
                        className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ FAVORITES TAB ═══ */}
        {showFavorites && (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-1.5 pb-1">
              <Star className="h-3.5 w-3.5 text-primary fill-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your Favorite Foods</span>
            </div>
            {favoriteFoods.length === 0 ? (
              <div className="text-center py-12">
                <Star className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No favorites yet</p>
                <p className="text-xs text-muted-foreground mt-1">Tap the ★ on any food in search results to add it here</p>
              </div>
            ) : (
              <div className="space-y-1">
                {favoriteFoods.map((item) => (
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
                    isFavorite={true}
                    onToggleFavorite={() => handleToggleFavorite(item.id)}
                  />
                ))}
              </div>
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
        {search.length >= 2 && activeTab === "all" && (
          <div className="space-y-1 py-2">
            {searching ? (
              <div className="space-y-1.5 py-2">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border/50">
                    <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3.5 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                    <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  </div>
                ))}
              </div>
            ) : displayItems.length === 0 && !offSearching ? (
              <div className="text-center py-12">
                <p className="text-2xl mb-2">🔍</p>
                <p className="text-sm text-foreground font-medium">No results found</p>
                <p className="text-xs text-muted-foreground mt-1">Try a shorter or simpler search term.</p>
                <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={() => setQuickAddOpen(true)}>
                  <Plus className="h-3 w-3 mr-1" /> Add Custom Food
                </Button>
              </div>
            ) : bestMatches.length > 0 ? (
              <>
                {/* Best Match section */}
                <div className="flex items-center gap-2 pb-1.5 pt-1">
                  <BadgeCheck className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">Best Match</span>
                </div>
                {bestMatches.map((item) => (
                  <FoodRow
                    key={`best-${item.id}`}
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
                    isFavorite={favorites.has(item.id)}
                    onToggleFavorite={() => handleToggleFavorite(item.id)}
                  />
                ))}

                {/* More Results section */}
                {moreResultsList.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 pb-1.5 pt-3">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">More Results</span>
                    </div>
                    {moreResultsList.map((item) => (
                      <FoodRow
                        key={`more-${item.id}`}
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
                        isFavorite={favorites.has(item.id)}
                        onToggleFavorite={() => handleToggleFavorite(item.id)}
                      />
                    ))}
                  </>
                )}
              </>
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
                  isFavorite={favorites.has(item.id)}
                  onToggleFavorite={() => handleToggleFavorite(item.id)}
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

      <BarcodeScanner open={barcodeOpen} onOpenChange={setBarcodeOpen} defaultMealType={mealType} onLogged={() => { setBarcodeOpen(false); onLogged(); }} />
      <MealScanCapture open={mealScanOpen} onClose={() => setMealScanOpen(false)} mealType={mealType} logDate={effectiveDate} onLogged={onLogged} />
      <CreateFoodScreen
        open={showCreateFood}
        onOpenChange={(v) => { if (!v) { setShowCreateFood(false); setEditingCustomFood(null); } }}
        onSaved={() => { setShowCreateFood(false); setEditingCustomFood(null); fetchCustomFoods(); }}
        editFood={editingCustomFood}
      />
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
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

const FoodRow = ({ item, expanded, onToggle, onAdd, servings, onServingsChange, servingUnit, onServingUnitChange, isFavorite, onToggleFavorite }: FoodRowProps) => {
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
        {onToggleFavorite && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
            className="p-1 transition-colors shrink-0"
          >
            <Star className={cn("h-4 w-4", isFavorite ? "fill-primary text-primary" : "text-muted-foreground")} />
          </button>
        )}
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
