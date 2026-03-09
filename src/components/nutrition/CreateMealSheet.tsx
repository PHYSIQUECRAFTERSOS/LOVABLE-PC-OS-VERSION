import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, X, Search, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface StagedItem {
  food_item_id?: string;
  food_name: string;
  quantity: number;
  serving_unit: string;
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
    try {
      const { data, error } = await supabase.functions.invoke("search-foods", {
        body: { query: q, limit: 20, user_id: user?.id ?? null },
      });
      if (!error && data?.foods?.length > 0) {
        setSearchResults(data.foods.map((f: any) => ({
          id: f.id,
          name: f.name,
          brand: f.brand || null,
          serving_size: f.serving_size_g ?? 100,
          serving_unit: f.serving_unit ?? "g",
          calories: Math.round((f.calories_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100),
          protein: Math.round((f.protein_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100),
          carbs: Math.round((f.carbs_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100),
          fat: Math.round((f.fat_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100),
        })));
      } else {
        throw new Error("Edge function empty");
      }
    } catch {
      const { data: fallback } = await supabase
        .from("food_items")
        .select("id, name, brand, serving_size, serving_unit, calories, protein, carbs, fat")
        .or(`name.ilike.%${q}%,brand.ilike.%${q}%`)
        .order("is_verified", { ascending: false })
        .limit(20);
      setSearchResults(fallback || []);
    }
    setSearching(false);
  };

  const addFoodToStaged = (food: any) => {
    setItems(prev => [...prev, {
      food_item_id: food.id,
      food_name: food.name,
      quantity: food.serving_size || 1,
      serving_unit: food.serving_unit || "g",
      calories: food.calories || 0,
      protein: food.protein || 0,
      carbs: food.carbs || 0,
      fat: food.fat || 0,
    }]);
    setSearchQuery("");
    setSearchResults([]);
    setShowFoodSearch(false);
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
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

      <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-4 pt-4">
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
                <div key={i} className="flex items-center justify-between rounded-xl bg-card border border-border/50 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{item.food_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.quantity} {item.serving_unit} · {Math.round(item.calories)} cal
                    </div>
                  </div>
                  <button onClick={() => removeItem(i)} className="ml-2 p-1.5 rounded-lg hover:bg-destructive/10">
                    <X className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border">
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
