import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, X, Search, Loader2, Minus } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface StagedItem {
  food_item_id?: string;
  food_name: string;
  quantity: number;
  base_quantity: number;
  serving_unit: string;
  base_calories: number;
  base_protein: number;
  base_carbs: number;
  base_fat: number;
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

const recalcMacros = (item: StagedItem, newQty: number): StagedItem => {
  const mult = item.base_quantity > 0 ? newQty / item.base_quantity : 1;
  return {
    ...item,
    quantity: newQty,
    calories: Math.round(item.base_calories * mult),
    protein: Math.round(item.base_protein * mult * 10) / 10,
    carbs: Math.round(item.base_carbs * mult * 10) / 10,
    fat: Math.round(item.base_fat * mult * 10) / 10,
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

  const totals = items.reduce((acc, item) => ({
    calories: acc.calories + item.calories,
    protein: acc.protein + item.protein,
    carbs: acc.carbs + item.carbs,
    fat: acc.fat + item.fat,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const handleClose = () => {
    if (name.trim() || items.length > 0) {
      setShowDiscard(true);
    } else {
      onClose();
    }
  };

  const searchFoods = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const { data, error } = await supabase.rpc("search_foods", { search_query: q, result_limit: 15 });
    if (!error && data) {
      setSearchResults(data);
    } else {
      const { data: fallback } = await supabase
        .from("food_items")
        .select("id, name, brand, serving_size, serving_unit, calories, protein, carbs, fat")
        .ilike("name", `%${q}%`)
        .limit(10);
      setSearchResults(fallback || []);
    }
    setSearching(false);
  };

  const addFoodToStaged = (food: any) => {
    const qty = food.serving_size || 1;
    const cal = food.calories || 0;
    const pro = food.protein || 0;
    const carb = food.carbs || 0;
    const f = food.fat || 0;
    setItems(prev => [...prev, {
      food_item_id: food.id,
      food_name: food.name,
      quantity: qty,
      base_quantity: qty,
      serving_unit: food.serving_unit || "g",
      base_calories: cal,
      base_protein: pro,
      base_carbs: carb,
      base_fat: f,
      calories: cal,
      protein: pro,
      carbs: carb,
      fat: f,
    }]);
    setSearchQuery("");
    setSearchResults([]);
    setShowFoodSearch(false);
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
    if (editingIndex === index) setEditingIndex(null);
  };

  const updateQuantity = (index: number, newQty: number) => {
    setItems(prev => prev.map((item, i) => i === index ? recalcMacros(item, newQty) : item));
  };

  const adjustQuantity = (index: number, delta: number) => {
    const item = items[index];
    const step = item.serving_unit === "g" ? 10 : 0.5;
    const newQty = Math.max(0, item.quantity + delta * step);
    updateQuantity(index, newQty);
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
        serving_unit: item.serving_unit,
        calories: Math.round(item.calories),
        protein: Math.round(item.protein),
        carbs: Math.round(item.carbs),
        fat: Math.round(item.fat),
      }));

      await supabase.from("saved_meal_items" as any).insert(mealItems);
    }

    toast({ title: "Meal saved!" });
    setSaving(false);
    onSaved();
  };

  if (showFoodSearch) {
    return (
      <div className="fixed inset-0 z-[60] bg-background flex flex-col animate-fade-in">
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border">
          <button onClick={() => setShowFoodSearch(false)} className="p-1.5 rounded-lg hover:bg-secondary">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <h1 className="text-base font-semibold text-foreground">Add Ingredient</h1>
        </div>
        <div className="px-4 pt-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search foods..."
              value={searchQuery}
              onChange={e => searchFoods(e.target.value)}
              className="pl-10 h-11 rounded-xl bg-secondary border-0"
              autoFocus
            />
            {searching && <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4">
          {searchResults.map((food: any) => (
            <button
              key={food.id}
              onClick={() => addFoodToStaged(food)}
              className="w-full text-left rounded-xl bg-card border border-border/50 px-4 py-3 mb-1.5 hover:bg-secondary transition-colors"
            >
              <div className="text-sm font-medium text-foreground truncate">{food.name}</div>
              <div className="text-xs text-muted-foreground">
                {food.calories} cal · {food.protein}P · {food.carbs}C · {food.fat}F
                {food.serving_size && ` · ${food.serving_size}${food.serving_unit}`}
              </div>
            </button>
          ))}
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
                      <div className="text-sm font-medium text-foreground truncate">{item.food_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.quantity} {item.serving_unit} · {Math.round(item.calories)} cal · {Math.round(item.protein)}P · {Math.round(item.carbs)}C · {Math.round(item.fat)}F
                      </div>
                    </button>
                    <button onClick={() => removeItem(i)} className="ml-2 p-1.5 rounded-lg hover:bg-destructive/10">
                      <X className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  </div>

                  {/* Inline quantity editor */}
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
                          <span className="text-xs text-muted-foreground">{item.serving_unit}</span>
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
