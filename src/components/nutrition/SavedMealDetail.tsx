import { useState, useEffect, useRef, useCallback } from "react";
import { useIOSOverlayRepaint, OverlayPortal } from "@/hooks/useIOSOverlayRepaint";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getFoodEmoji } from "@/utils/foodEmoji";
import {
  ArrowLeft, Trash2, Pencil, Plus, Minus, Search, Loader2, Clock,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface SavedMealDetailProps {
  meal: any;
  mealType: string;
  mealLabel: string;
  logDate: string;
  onBack: () => void;
  onLogged: () => void;
  onDeleted: () => void;
  onUpdated: () => void;
}

/**
 * Compute macros from per-100g values.
 */
const computeMacros = (item: any, newQty: number, unit: string) => {
  const servingSizeG = item.serving_size_g || item.base_serving_size_g || 100;
  const cal100 = item.calories_per_100g ?? 0;
  const pro100 = item.protein_per_100g ?? 0;
  const carb100 = item.carbs_per_100g ?? 0;
  const fat100 = item.fat_per_100g ?? 0;

  const grams = unit === "g" ? newQty : newQty * servingSizeG;
  const factor = grams / 100;

  return {
    ...item,
    quantity: newQty,
    active_unit: unit,
    calories: Math.round(cal100 * factor),
    protein: Math.round(pro100 * factor * 10) / 10,
    carbs: Math.round(carb100 * factor * 10) / 10,
    fat: Math.round(fat100 * factor * 10) / 10,
  };
};

const SavedMealDetail = ({ meal, mealType, mealLabel, logDate, onBack, onLogged, onDeleted, onUpdated }: SavedMealDetailProps) => {
  useIOSOverlayRepaint();
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [logging, setLogging] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(meal.name);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [savingItem, setSavingItem] = useState(false);

  // Food search state for adding items
  const [showAddFood, setShowAddFood] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchItems();
  }, [meal.id]);

  const fetchItems = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("saved_meal_items" as any)
      .select("*")
      .eq("saved_meal_id", meal.id)
      .order("created_at");

    const rawItems = (data as any[] || []);

    // Fetch food_items metadata for fallback serving info on legacy items
    const foodIds = rawItems.map(i => i.food_item_id).filter(Boolean) as string[];
    let foodMetaMap: Record<string, { serving_size: number | null; serving_unit: string | null }> = {};
    if (foodIds.length > 0) {
      const { data: foodMeta } = await supabase
        .from("food_items")
        .select("id, serving_size, serving_unit")
        .in("id", foodIds);
      if (foodMeta) {
        foodMeta.forEach((f: any) => { foodMetaMap[f.id] = { serving_size: f.serving_size, serving_unit: f.serving_unit }; });
      }
    }

    const enriched = rawItems.map((item: any) => {
      // If per-100g values are stored, use them. Otherwise, compute from per-serving.
      let cal100 = item.calories_per_100g ?? 0;
      let pro100 = item.protein_per_100g ?? 0;
      let carb100 = item.carbs_per_100g ?? 0;
      let fat100 = item.fat_per_100g ?? 0;
      let servingSizeG = item.serving_size_g || 100;

      // Fallback: if quantity is 1 and serving_unit is generic, use food_items metadata
      const isLegacyItem = (item.quantity === 1 || !item.quantity) && (!item.serving_unit || item.serving_unit === "serving" || item.serving_unit === "g") && !item.serving_size_g;
      if (isLegacyItem && item.food_item_id && foodMetaMap[item.food_item_id]) {
        const meta = foodMetaMap[item.food_item_id];
        if (meta.serving_size && meta.serving_size > 0) {
          servingSizeG = meta.serving_size;
          // Recalculate quantity from stored macros if we have a real serving size
          if (!item.serving_unit || item.serving_unit === "serving" || item.serving_unit === "g") {
            item.quantity = meta.serving_size;
            item.serving_unit = meta.serving_unit || "g";
          }
        }
      }

      if (cal100 === 0 && item.calories > 0) {
        // Derive from stored serving data: macros are for quantity of serving_unit
        const storedQty = item.quantity || 1;
        const storedGrams = (item.serving_unit === "g") ? storedQty : storedQty * servingSizeG;
        if (storedGrams > 0) {
          cal100 = (item.calories / storedGrams) * 100;
          pro100 = ((item.protein || 0) / storedGrams) * 100;
          carb100 = ((item.carbs || 0) / storedGrams) * 100;
          fat100 = ((item.fat || 0) / storedGrams) * 100;
        }
      }

      // Determine serving label and active unit
      const rawUnit = item.serving_unit || "g";
      const isGramUnit = rawUnit === "g";
      const servingLabel = isGramUnit ? `${servingSizeG}g` : rawUnit;

      return {
        ...item,
        calories_per_100g: cal100,
        protein_per_100g: pro100,
        carbs_per_100g: carb100,
        fat_per_100g: fat100,
        serving_size_g: servingSizeG,
        serving_label: servingLabel,
        active_unit: isGramUnit ? "g" : "serving",
      };
    });

    setItems(enriched);
    setLoading(false);
  };

  const totals = items.reduce((acc, item) => ({
    calories: acc.calories + (item.calories || 0),
    protein: acc.protein + (item.protein || 0),
    carbs: acc.carbs + (item.carbs || 0),
    fat: acc.fat + (item.fat || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  // --- Food search for adding items ---
  useEffect(() => {
    if (showAddFood && user) {
      fetchHistory();
      setTimeout(() => searchRef.current?.focus(), 400);
    }
  }, [showAddFood, user]);

  const fetchHistory = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("nutrition_logs")
      .select("food_item_id, custom_name")
      .eq("client_id", user.id)
      .not("food_item_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(40);
    if (!data || data.length === 0) return;
    const foodIds = [...new Set(data.map(d => d.food_item_id!))].slice(0, 20);
    const { data: foods } = await supabase
      .from("food_items")
      .select("id, name, brand, serving_size, serving_unit, calories, protein, carbs, fat, is_verified, data_source")
      .in("id", foodIds);
    if (foods) {
      const ordered = foodIds.map(id => foods.find(f => f.id === id)).filter(Boolean);
      setHistory(ordered);
    }
  };

  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("search-foods", {
          body: { query: q, limit: 25, user_id: user?.id ?? null },
        });
        if (!error && data?.foods?.length > 0) {
          setSearchResults(data.foods);
        } else {
          const { data: rpcData } = await supabase.rpc("search_foods", { search_query: q, result_limit: 15 });
          setSearchResults((rpcData || []).map((f: any) => ({
            ...f,
            calories_per_100g: f.calories > 0 && f.serving_size > 0 ? (f.calories / f.serving_size * 100) : f.calories,
            protein_per_100g: f.protein > 0 && f.serving_size > 0 ? (f.protein / f.serving_size * 100) : f.protein,
            carbs_per_100g: f.carbs > 0 && f.serving_size > 0 ? (f.carbs / f.serving_size * 100) : f.carbs,
            fat_per_100g: f.fat > 0 && f.serving_size > 0 ? (f.fat / f.serving_size * 100) : f.fat,
            serving_size_g: f.serving_size || 100,
          })));
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [user]);

  const addNewFood = async (food: any) => {
    const servingSizeG = food.serving_size_g ?? food.serving_size ?? 100;
    let cal100 = food.calories_per_100g ?? 0;
    let pro100 = food.protein_per_100g ?? 0;
    let carb100 = food.carbs_per_100g ?? 0;
    let fat100 = food.fat_per_100g ?? 0;

    if (cal100 === 0 && food.calories > 0 && servingSizeG > 0) {
      cal100 = food.calories / servingSizeG * 100;
      pro100 = (food.protein || 0) / servingSizeG * 100;
      carb100 = (food.carbs || 0) / servingSizeG * 100;
      fat100 = (food.fat || 0) / servingSizeG * 100;
    }

    const rawUnit = food.serving_unit ?? "g";
    const servingDesc = food.serving_description || food.serving_label || null;
    const isNativeServing = rawUnit !== "g" || !!servingDesc;
    const servingLabel = servingDesc || (isNativeServing ? `1 ${rawUnit}` : `${servingSizeG}g`);
    const activeUnit = isNativeServing ? "serving" : "g";
    const qty = isNativeServing ? 1 : servingSizeG;
    const factor = servingSizeG / 100;

    const newItem = {
      saved_meal_id: meal.id,
      food_item_id: food.id || null,
      food_name: food.name,
      quantity: qty,
      serving_unit: activeUnit === "g" ? "g" : servingLabel,
      calories: Math.round(cal100 * factor),
      protein: Math.round(pro100 * factor * 10) / 10,
      carbs: Math.round(carb100 * factor * 10) / 10,
      fat: Math.round(fat100 * factor * 10) / 10,
      serving_size_g: servingSizeG,
      calories_per_100g: cal100,
      protein_per_100g: pro100,
      carbs_per_100g: carb100,
      fat_per_100g: fat100,
    };

    let inserted: any = null;
    const { data: ins1, error: err1 } = await supabase
      .from("saved_meal_items" as any)
      .insert(newItem)
      .select()
      .single();

    if (err1) {
      // FK violation likely — food_id from cache table, not food_items. Retry without FK.
      console.warn("[addNewFood] Insert failed, retrying without food_item_id:", err1.message);
      const { data: ins2, error: err2 } = await supabase
        .from("saved_meal_items" as any)
        .insert({ ...newItem, food_item_id: null })
        .select()
        .single();
      if (err2) {
        console.error("[addNewFood] Retry also failed:", err2.message);
        toast({ title: "Couldn't add food.", description: err2.message, variant: "destructive" });
        return;
      }
      inserted = ins2;
    } else {
      inserted = ins1;
    }

    // Update parent totals
    const updatedItems = [...items, {
      ...(inserted as any),
      serving_label: servingLabel,
      active_unit: activeUnit,
      calories_per_100g: cal100,
      protein_per_100g: pro100,
      carbs_per_100g: carb100,
      fat_per_100g: fat100,
      serving_size_g: servingSizeG,
    }];
    setItems(updatedItems);

    const newTotals = updatedItems.reduce((acc: any, it: any) => ({
      calories: acc.calories + (it.calories || 0),
      protein: acc.protein + (it.protein || 0),
      carbs: acc.carbs + (it.carbs || 0),
      fat: acc.fat + (it.fat || 0),
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

    await supabase.from("saved_meals").update({
      calories: Math.round(newTotals.calories),
      protein: Math.round(newTotals.protein),
      carbs: Math.round(newTotals.carbs),
      fat: Math.round(newTotals.fat),
    } as any).eq("id", meal.id);

    setSearchQuery("");
    setSearchResults([]);
    setShowAddFood(false);
    onUpdated();
    toast({ title: `${food.name} added` });
  };


  // --- Existing item operations ---
  const addToLog = async () => {
    if (!user || items.length === 0) return;
    setLogging(true);

    // Fetch micros for items that have food_item_ids
    const foodItemIds = items.filter(i => i.food_item_id).map(i => i.food_item_id);
    const microsMap: Record<string, Record<string, number>> = {};
    if (foodItemIds.length > 0) {
      try {
        const { extractMicros } = await import("@/utils/micronutrientHelper");
        const { data: foodItems } = await supabase
          .from("food_items")
          .select("*")
          .in("id", foodItemIds);
        if (foodItems) {
          foodItems.forEach((fi: any) => {
            microsMap[fi.id] = extractMicros(fi, 1);
          });
        }
      } catch (err) {
        console.warn("[SavedMealDetail] Could not fetch micros:", err);
      }
    }

    const entries = items.map(item => {
      const servings = item.quantity || 1;
      const itemMicros = item.food_item_id && microsMap[item.food_item_id]
        ? Object.fromEntries(
            Object.entries(microsMap[item.food_item_id]).map(([k, v]) => [k, Math.round(v * servings * 100) / 100])
          )
        : {};
      return {
        client_id: user.id,
        food_item_id: item.food_item_id || null,
        custom_name: item.food_item_id ? null : item.food_name,
        meal_type: mealType,
        servings,
        calories: Math.round(item.calories || 0),
        protein: Math.round(item.protein || 0),
        carbs: Math.round(item.carbs || 0),
        fat: Math.round(item.fat || 0),
        logged_at: logDate,
        tz_corrected: true,
        ...itemMicros,
      };
    });

    const { error } = await supabase.from("nutrition_logs").insert(entries);
    if (error) {
      toast({ title: "Couldn't log meal. Please try again." });
      setLogging(false);
      return;
    }

    toast({ title: `${meal.name} added to ${mealLabel}` });
    setLogging(false);
    onLogged();
  };

  const deleteMeal = async () => {
    const { error } = await supabase.from("saved_meals").delete().eq("id", meal.id);
    if (error) {
      toast({ title: "Couldn't delete meal." });
    } else {
      toast({ title: "Meal deleted" });
      onDeleted();
    }
  };

  const updateName = async () => {
    if (!editName.trim()) return;
    await supabase.from("saved_meals").update({ name: editName.trim() } as any).eq("id", meal.id);
    setEditing(false);
    onUpdated();
  };

  const removeItem = async (itemId: string) => {
    await supabase.from("saved_meal_items" as any).delete().eq("id", itemId);
    const remaining = items.filter(i => i.id !== itemId);
    setItems(remaining);
    const newTotals = remaining.reduce((acc: any, item: any) => ({
      calories: acc.calories + (item.calories || 0),
      protein: acc.protein + (item.protein || 0),
      carbs: acc.carbs + (item.carbs || 0),
      fat: acc.fat + (item.fat || 0),
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
    await supabase.from("saved_meals").update(newTotals as any).eq("id", meal.id);
    onUpdated();
  };

  const updateItemQuantity = (itemId: string, newQty: number) => {
    setItems(prev => prev.map(i => {
      if (i.id !== itemId) return i;
      return computeMacros(i, newQty, i.active_unit || "g");
    }));
  };

  const changeItemUnit = (itemId: string, newUnit: string) => {
    setItems(prev => prev.map(i => {
      if (i.id !== itemId) return i;
      const servingSizeG = i.serving_size_g || 100;
      let newQty: number;
      if (newUnit === "g") {
        newQty = Math.round((i.active_unit === "serving" ? i.quantity : i.quantity) * (i.active_unit === "serving" ? servingSizeG : 1));
      } else {
        newQty = Math.round((i.quantity / servingSizeG) * 10) / 10 || 1;
      }
      return computeMacros(i, newQty, newUnit);
    }));
  };

  const adjustItemQty = (itemId: string, delta: number) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    const unit = item.active_unit || "g";
    const step = unit === "g" ? 10 : 1;
    const newQty = Math.max(0, (item.quantity || 0) + delta * step);
    updateItemQuantity(itemId, newQty);
  };

  const saveItemEdit = async (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    setSavingItem(true);

    await supabase.from("saved_meal_items" as any).update({
      quantity: item.quantity,
      serving_unit: item.active_unit === "g" ? "g" : item.serving_label,
      calories: Math.round(item.calories),
      protein: Math.round(item.protein),
      carbs: Math.round(item.carbs),
      fat: Math.round(item.fat),
    } as any).eq("id", itemId);

    const newTotals = items.reduce((acc: any, it: any) => ({
      calories: acc.calories + (it.calories || 0),
      protein: acc.protein + (it.protein || 0),
      carbs: acc.carbs + (it.carbs || 0),
      fat: acc.fat + (it.fat || 0),
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
    await supabase.from("saved_meals").update({
      calories: Math.round(newTotals.calories),
      protein: Math.round(newTotals.protein),
      carbs: Math.round(newTotals.carbs),
      fat: Math.round(newTotals.fat),
    } as any).eq("id", meal.id);

    setSavingItem(false);
    setEditingItemId(null);
    onUpdated();
    toast({ title: "Changes saved" });
  };

  // --- Render ---

  if (showAddFood) {
    const displayList = searchQuery.length >= 2 ? searchResults : history;
    return (
      <OverlayPortal><div className="overlay-fullscreen z-[55] animate-fade-in">
        <div className="flex items-center gap-3 px-4 pt-2 pb-3 border-b border-border">
          <button onClick={() => setShowAddFood(false)} className="p-1.5 rounded-lg hover:bg-secondary">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <h1 className="text-base font-semibold text-foreground">Add to {meal.name}</h1>
        </div>
        <div className="px-4 pt-3 pb-2 space-y-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchRef}
              placeholder="Search foods..."
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              className="pl-10 h-11 rounded-xl bg-secondary border-0"
              autoFocus
            />
            {searching && <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </div>
        {searchQuery.length < 2 && displayList.length > 0 && (
          <div className="flex items-center gap-1.5 px-4 pt-1 pb-1">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">History</span>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {displayList.length === 0 && !searching && (
            <p className="text-center text-sm text-muted-foreground py-8">
              {searchQuery.length >= 2 ? `No results for "${searchQuery}"` : "Start typing to search foods"}
            </p>
          )}
          {displayList.map((food: any) => {
            const servingSize = food.serving_size_g ?? food.serving_size ?? 100;
            const cal = food.calories_per_100g
              ? Math.round(food.calories_per_100g * servingSize / 100)
              : (food.calories || 0);
            return (
              <button
                key={food.id}
                onClick={() => addNewFood(food)}
                className="w-full text-left rounded-xl bg-card border border-border/50 px-4 py-3 mb-1.5 hover:bg-secondary transition-colors flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0 text-lg">
                  {getFoodEmoji(food)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{food.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {cal} cal · {servingSize}{food.serving_unit ?? "g"}
                    {food.brand && <span className="ml-1 opacity-70">· {food.brand}</span>}
                  </div>
                </div>
                <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </div>
      </div></OverlayPortal>
    );
  }

  return (
    <OverlayPortal><div className="overlay-fullscreen z-[70] animate-fade-in">
      <div className="flex items-center gap-3 px-4 pt-2 pb-3 border-b border-border">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex gap-2">
              <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-8 text-sm" autoFocus />
              <Button size="sm" className="h-8" onClick={updateName}>Save</Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          ) : (
            <h1 className="text-base font-semibold text-foreground truncate">{meal.name}</h1>
          )}
        </div>
        {!editing && (
          <div className="flex gap-1">
            <button onClick={() => setEditing(true)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
              <Pencil className="h-4 w-4 text-muted-foreground" />
            </button>
            <button onClick={() => setShowDelete(true)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
              <Trash2 className="h-4 w-4 text-destructive" />
            </button>
          </div>
        )}
      </div>

      {/* Macro Summary */}
      <div className="px-4 py-3 border-b border-border">
        <div className="grid grid-cols-4 gap-3 text-center">
          <div>
            <div className="text-lg font-bold text-foreground">{Math.round(totals.calories)}</div>
            <div className="text-[10px] text-muted-foreground uppercase">Calories</div>
          </div>
          <div>
            <div className="text-lg font-bold text-red-400">{Math.round(totals.protein)}g</div>
            <div className="text-[10px] text-muted-foreground uppercase">Protein</div>
          </div>
          <div>
            <div className="text-lg font-bold text-blue-400">{Math.round(totals.carbs)}g</div>
            <div className="text-[10px] text-muted-foreground uppercase">Carbs</div>
          </div>
          <div>
            <div className="text-lg font-bold text-yellow-400">{Math.round(totals.fat)}g</div>
            <div className="text-[10px] text-muted-foreground uppercase">Fat</div>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-4 pb-36">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Add Items button */}
            <div className="flex justify-end py-3">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowAddFood(true)}>
                <Plus className="h-3 w-3" /> Add Items
              </Button>
            </div>

            {items.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">
                No items in this meal. Tap "Add Items" to add foods.
              </p>
            ) : (
              <div className="space-y-1.5">
                {items.map((item: any) => {
                  const isEditing = editingItemId === item.id;
                  const activeUnit = item.active_unit || "g";
                  const servingLabel = item.serving_label || `${item.serving_size_g || 100}g`;

                  return (
                    <div key={item.id} className="rounded-xl bg-card border border-border/50 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3">
                        <button
                          onClick={() => setEditingItemId(isEditing ? null : item.id)}
                          className="flex-1 min-w-0 text-left"
                        >
                          <div className="text-sm font-medium text-foreground truncate">{item.food_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {activeUnit === "g"
                              ? `${item.quantity}g`
                              : `${item.quantity} × ${servingLabel}`
                            }
                            {" · "}{Math.round(item.calories)} cal · {Math.round(item.protein)}P · {Math.round(item.carbs)}C · {Math.round(item.fat)}F
                          </div>
                        </button>
                        <button onClick={() => removeItem(item.id)} className="ml-2 p-1.5 rounded-lg hover:bg-destructive/10 transition-colors">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </button>
                      </div>

                      {isEditing && (
                        <div className="px-4 pb-3 pt-1 border-t border-border/30 animate-fade-in">
                          <div className="flex items-center justify-center gap-3">
                            <button
                              onClick={() => adjustItemQty(item.id, -1)}
                              className="h-8 w-8 flex items-center justify-center rounded-full bg-secondary hover:bg-secondary/80 transition-colors"
                            >
                              <Minus className="h-3.5 w-3.5 text-foreground" />
                            </button>
                            <div className="flex items-center gap-1.5">
                              <Input
                                type="text"
                                inputMode="decimal"
                                value={item.quantity || ""}
                                placeholder="0"
                                onFocus={e => e.target.select()}
                                onChange={e => {
                                  const val = parseFloat(e.target.value) || 0;
                                  updateItemQuantity(item.id, val);
                                }}
                                className="h-8 w-20 text-sm text-center bg-secondary border-0 rounded-lg"
                              />
                              <Select
                                value={activeUnit}
                                onValueChange={(v) => changeItemUnit(item.id, v)}
                              >
                                <SelectTrigger className="h-8 w-auto min-w-[60px] text-xs bg-secondary border-0 rounded-lg">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="serving">{servingLabel}</SelectItem>
                                  <SelectItem value="g">g</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <button
                              onClick={() => adjustItemQty(item.id, 1)}
                              className="h-8 w-8 flex items-center justify-center rounded-full bg-secondary hover:bg-secondary/80 transition-colors"
                            >
                              <Plus className="h-3.5 w-3.5 text-foreground" />
                            </button>
                          </div>
                          <div className="grid grid-cols-4 gap-2 mt-2 text-center text-xs">
                            <div><span className="font-semibold text-foreground">{Math.round(item.calories)}</span><br /><span className="text-muted-foreground">Cal</span></div>
                            <div><span className="font-semibold text-red-400">{Math.round(item.protein)}g</span><br /><span className="text-muted-foreground">P</span></div>
                            <div><span className="font-semibold text-blue-400">{Math.round(item.carbs)}g</span><br /><span className="text-muted-foreground">C</span></div>
                            <div><span className="font-semibold text-yellow-400">{Math.round(item.fat)}g</span><br /><span className="text-muted-foreground">F</span></div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => saveItemEdit(item.id)}
                            disabled={savingItem}
                            className="w-full mt-2 h-8 text-xs rounded-lg"
                          >
                            {savingItem ? "Saving..." : "Save Changes"}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Add to Log Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-background border-t border-border z-[60]">
        <Button
          onClick={addToLog}
          disabled={logging || items.length === 0}
          className="w-full h-[52px] text-base font-semibold bg-primary text-primary-foreground rounded-xl"
        >
          {logging ? "Adding..." : `Add to ${mealLabel}`}
        </Button>
      </div>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent className="z-[80]">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete?</AlertDialogTitle>
            <AlertDialogDescription>"{meal.name}" will be permanently removed from your saved meals. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteMeal} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete Now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div></OverlayPortal>
  );
};

export default SavedMealDetail;
