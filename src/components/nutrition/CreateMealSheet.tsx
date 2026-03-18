import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { getFoodEmoji } from "@/utils/foodEmoji";
import {
  ArrowLeft, Plus, X, Search, Loader2, Minus, ScanBarcode, Clock, Star, ChevronDown,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export interface StagedItem {
  food_item_id?: string;
  food_name: string;
  brand?: string | null;
  quantity: number;
  serving_unit: "serving" | "g";
  serving_size_g: number;
  serving_label: string;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface CreateMealSheetProps {
  mealType: string;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Compute macros from per-100g values, quantity, and unit mode.
 * serving mode: quantity = number of servings, grams = quantity * serving_size_g
 * gram mode: quantity = grams directly
 */
const computeMacros = (item: StagedItem, newQty: number, unit: "serving" | "g"): StagedItem => {
  const grams = unit === "g" ? newQty : newQty * item.serving_size_g;
  const factor = grams / 100;
  return {
    ...item,
    quantity: newQty,
    serving_unit: unit,
    calories: Math.round(item.calories_per_100g * factor),
    protein: Math.round(item.protein_per_100g * factor * 10) / 10,
    carbs: Math.round(item.carbs_per_100g * factor * 10) / 10,
    fat: Math.round(item.fat_per_100g * factor * 10) / 10,
  };
};

const CreateMealSheet = ({ mealType, onClose, onSaved }: CreateMealSheetProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [items, setItems] = useState<StagedItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const [showFoodSearch, setShowFoodSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totals = items.reduce((acc, item) => ({
    calories: acc.calories + item.calories,
    protein: acc.protein + item.protein,
    carbs: acc.carbs + item.carbs,
    fat: acc.fat + item.fat,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  // Load history when food search opens
  useEffect(() => {
    if (showFoodSearch && user) {
      fetchHistory();
      setTimeout(() => searchRef.current?.focus(), 150);
    }
  }, [showFoodSearch, user]);

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
          // Fallback to RPC
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

  const mapFoodToStaged = (food: any): StagedItem => {
    // Determine per-100g values
    let cal100 = food.calories_per_100g ?? food.calories_per_100 ?? 0;
    let pro100 = food.protein_per_100g ?? food.protein_per_100 ?? 0;
    let carb100 = food.carbs_per_100g ?? food.carbs_per_100 ?? 0;
    let fat100 = food.fat_per_100g ?? food.fat_per_100 ?? 0;
    const servingSizeG = food.serving_size_g ?? food.serving_size ?? 100;

    // If no per-100g values, compute from per-serving
    if (cal100 === 0 && food.calories > 0 && servingSizeG > 0) {
      cal100 = food.calories / servingSizeG * 100;
      pro100 = (food.protein || 0) / servingSizeG * 100;
      carb100 = (food.carbs || 0) / servingSizeG * 100;
      fat100 = (food.fat || 0) / servingSizeG * 100;
    }

    // Determine serving label
    const servingDesc = food.serving_description || food.serving_label || null;
    const rawUnit = food.serving_unit ?? "g";
    let servingLabel = servingDesc || (rawUnit !== "g" ? `1 ${rawUnit}` : `${servingSizeG}g`);
    const isNativeServing = rawUnit !== "g" || !!servingDesc;

    // Start with 1 serving if native, or serving_size_g if grams
    const initialUnit: "serving" | "g" = isNativeServing ? "serving" : "g";
    const initialQty = isNativeServing ? 1 : servingSizeG;
    const grams = isNativeServing ? servingSizeG : servingSizeG;
    const factor = grams / 100;

    return {
      food_item_id: food.id,
      food_name: food.name,
      brand: food.brand || null,
      quantity: initialQty,
      serving_unit: initialUnit,
      serving_size_g: servingSizeG,
      serving_label: servingLabel,
      calories_per_100g: cal100,
      protein_per_100g: pro100,
      carbs_per_100g: carb100,
      fat_per_100g: fat100,
      calories: Math.round(cal100 * factor),
      protein: Math.round(pro100 * factor * 10) / 10,
      carbs: Math.round(carb100 * factor * 10) / 10,
      fat: Math.round(fat100 * factor * 10) / 10,
    };
  };

  const addFoodToStaged = (food: any) => {
    const staged = mapFoodToStaged(food);
    setItems(prev => [...prev, staged]);
    setSearchQuery("");
    setSearchResults([]);
    setShowFoodSearch(false);
  };


  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
    if (editingIndex === index) setEditingIndex(null);
  };

  const updateQuantity = (index: number, newQty: number) => {
    setItems(prev => prev.map((item, i) => i === index ? computeMacros(item, newQty, item.serving_unit) : item));
  };

  const changeUnit = (index: number, newUnit: "serving" | "g") => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      // Convert quantity between units
      let newQty: number;
      if (newUnit === "g") {
        newQty = Math.round(item.quantity * item.serving_size_g);
      } else {
        newQty = Math.round((item.quantity / item.serving_size_g) * 10) / 10 || 1;
      }
      return computeMacros(item, newQty, newUnit);
    }));
  };

  const adjustQuantity = (index: number, delta: number) => {
    const item = items[index];
    const step = item.serving_unit === "g" ? 10 : 1;
    const newQty = Math.max(0, item.quantity + delta * step);
    updateQuantity(index, newQty);
  };

  const handleClose = () => {
    if (name.trim() || items.length > 0) {
      setShowDiscard(true);
    } else {
      onClose();
    }
  };

  const save = async () => {
    if (!user || !name.trim()) return;
    setSaving(true);

    const { data: meal, error } = await supabase
      .from("saved_meals")
      .insert({
        client_id: user.id,
        name: name.trim(),
        meal_type: mealType,
        calories: Math.round(totals.calories),
        protein: Math.round(totals.protein),
        carbs: Math.round(totals.carbs),
        fat: Math.round(totals.fat),
        servings: 1,
      } as any)
      .select()
      .single();

    if (error || !meal) {
      toast({ title: "Couldn't save meal." });
      setSaving(false);
      return;
    }

    if (items.length > 0) {
      const mealItems = items.map(item => ({
        saved_meal_id: meal.id,
        food_item_id: item.food_item_id || null,
        food_name: item.food_name,
        quantity: item.quantity,
        serving_unit: item.serving_unit === "g" ? "g" : item.serving_label,
        calories: Math.round(item.calories),
        protein: Math.round(item.protein),
        carbs: Math.round(item.carbs),
        fat: Math.round(item.fat),
        serving_size_g: item.serving_size_g,
        calories_per_100g: item.calories_per_100g,
        protein_per_100g: item.protein_per_100g,
        carbs_per_100g: item.carbs_per_100g,
        fat_per_100g: item.fat_per_100g,
      }));

      await supabase.from("saved_meal_items" as any).insert(mealItems);
    }

    toast({ title: "Meal saved!" });
    setSaving(false);
    onSaved();
  };

  const displayList = searchQuery.length >= 2 ? searchResults : history;

  // Barcode removed for now — uses different API pattern

  if (showFoodSearch) {
    return (
      <div className="fixed inset-0 z-[60] bg-background flex flex-col animate-fade-in">
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border">
          <button onClick={() => setShowFoodSearch(false)} className="p-1.5 rounded-lg hover:bg-secondary">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <h1 className="text-base font-semibold text-foreground">Add Ingredient</h1>
        </div>

        {/* Search + Barcode */}
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

        {/* Section Label */}
        {searchQuery.length < 2 && displayList.length > 0 && (
          <div className="flex items-center gap-1.5 px-4 pt-1 pb-1">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">History</span>
          </div>
        )}

        {/* Results */}
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
            const pro = food.protein_per_100g
              ? Math.round(food.protein_per_100g * servingSize / 100)
              : (food.protein || 0);
            const servingDesc = food.serving_description || food.serving_label || null;
            const unitLabel = servingDesc || `${servingSize}${food.serving_unit ?? "g"}`;

            return (
              <button
                key={food.id}
                onClick={() => addFoodToStaged(food)}
                className="w-full text-left rounded-xl bg-card border border-border/50 px-4 py-3 mb-1.5 hover:bg-secondary transition-colors flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0 text-lg">
                  {getFoodEmoji(food)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{food.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {cal} cal · {pro}P · {unitLabel}
                    {food.brand && <span className="ml-1 opacity-70">· {food.brand}</span>}
                  </div>
                </div>
                <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[55] bg-background flex flex-col animate-fade-in">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border">
        <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-secondary">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="text-base font-semibold text-foreground">Create Meal</h1>
      </div>

      {/* Live Macro Summary */}
      <div className="px-4 py-3 border-b border-border">
        <div className="grid grid-cols-4 gap-3 text-center">
          <div>
            <div className="text-lg font-bold text-foreground">{Math.round(totals.calories)}</div>
            <div className="text-[10px] text-muted-foreground uppercase">Cal</div>
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

      <div className="flex-1 overflow-y-auto px-4 pb-36 space-y-4 pt-4">
        <div>
          <Label>Meal Name</Label>
          <Input
            placeholder="Name your meal"
            value={name}
            onChange={e => setName(e.target.value)}
            className="mt-1"
            autoFocus
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Meal Items</Label>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowFoodSearch(true)}>
              <Plus className="h-3 w-3 mr-1" /> Add Items
            </Button>
          </div>

          {items.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              No items added yet. Tap "Add Items" to search for foods.
            </p>
          ) : (
            <div className="space-y-1.5">
              {items.map((item, i) => (
                <div key={i} className="rounded-xl bg-card border border-border/50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3">
                    <button
                      onClick={() => setEditingIndex(editingIndex === i ? null : i)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="text-sm font-medium text-foreground truncate">
                        {item.food_name}
                        {item.brand && <span className="text-muted-foreground font-normal"> · {item.brand}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.serving_unit === "g"
                          ? `${item.quantity}g`
                          : `${item.quantity} × ${item.serving_label}`
                        }
                        {" · "}{Math.round(item.calories)} cal · {Math.round(item.protein)}P · {Math.round(item.carbs)}C · {Math.round(item.fat)}F
                      </div>
                    </button>
                    <button onClick={() => removeItem(i)} className="ml-2 p-1.5 rounded-lg hover:bg-destructive/10">
                      <X className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  </div>

                  {editingIndex === i && (
                    <div className="px-4 pb-3 pt-1 border-t border-border/30 animate-fade-in">
                      <div className="flex items-center justify-center gap-3">
                        <button
                          onClick={() => adjustQuantity(i, -1)}
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
                              updateQuantity(i, val);
                            }}
                            className="h-8 w-20 text-sm text-center bg-secondary border-0 rounded-lg"
                          />
                          <Select
                            value={item.serving_unit}
                            onValueChange={(v) => changeUnit(i, v as "serving" | "g")}
                          >
                            <SelectTrigger className="h-8 w-auto min-w-[60px] text-xs bg-secondary border-0 rounded-lg">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="serving">{item.serving_label}</SelectItem>
                              <SelectItem value="g">g</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <button
                          onClick={() => adjustQuantity(i, 1)}
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
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-background border-t border-border z-[60]">
        <Button
          onClick={save}
          disabled={saving || !name.trim()}
          className="w-full h-[52px] text-base font-semibold bg-primary text-primary-foreground rounded-xl"
        >
          {saving ? "Saving..." : "Save Meal"}
        </Button>
      </div>

      <AlertDialog open={showDiscard} onOpenChange={setShowDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this meal?</AlertDialogTitle>
            <AlertDialogDescription>Your changes will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction onClick={onClose}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CreateMealSheet;
