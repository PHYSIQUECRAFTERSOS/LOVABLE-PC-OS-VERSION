import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Trash2, Pencil, Plus, Minus } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

const SavedMealDetail = ({ meal, mealType, mealLabel, logDate, onBack, onLogged, onDeleted, onUpdated }: SavedMealDetailProps) => {
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
    setItems((data as any[]) || []);
    setLoading(false);
  };

  const totals = items.reduce((acc, item) => ({
    calories: acc.calories + (item.calories || 0),
    protein: acc.protein + (item.protein || 0),
    carbs: acc.carbs + (item.carbs || 0),
    fat: acc.fat + (item.fat || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const addToLog = async () => {
    if (!user || items.length === 0) return;
    setLogging(true);

    if (items.length === 0) {
      await supabase.from("nutrition_logs").insert({
        client_id: user.id,
        custom_name: meal.name,
        meal_type: mealType,
        servings: 1,
        calories: meal.calories || 0,
        protein: meal.protein || 0,
        carbs: meal.carbs || 0,
        fat: meal.fat || 0,
        logged_at: logDate,
        tz_corrected: true,
      });
    } else {
      const entries = items.map(item => ({
        client_id: user.id,
        food_item_id: item.food_item_id || null,
        custom_name: item.food_item_id ? null : item.food_name,
        meal_type: mealType,
        servings: item.quantity || 1,
        calories: Math.round(item.calories || 0),
        protein: Math.round(item.protein || 0),
        carbs: Math.round(item.carbs || 0),
        fat: Math.round(item.fat || 0),
        logged_at: logDate,
        tz_corrected: true,
      }));

      const { error } = await supabase.from("nutrition_logs").insert(entries);
      if (error) {
        toast({ title: "Couldn't log meal. Please try again." });
        setLogging(false);
        return;
      }
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

  const updateItemQuantity = async (itemId: string, newQty: number) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    
    const baseQty = item.base_quantity || item.quantity || 1;
    const mult = baseQty > 0 ? newQty / baseQty : 1;
    const baseCal = item.base_calories ?? item.calories ?? 0;
    const basePro = item.base_protein ?? item.protein ?? 0;
    const baseCarb = item.base_carbs ?? item.carbs ?? 0;
    const baseFat = item.base_fat ?? item.fat ?? 0;

    const updated = {
      ...item,
      quantity: newQty,
      calories: Math.round(baseCal * mult),
      protein: Math.round(basePro * mult * 10) / 10,
      carbs: Math.round(baseCarb * mult * 10) / 10,
      fat: Math.round(baseFat * mult * 10) / 10,
    };

    setItems(prev => prev.map(i => i.id === itemId ? updated : i));
  };

  const saveItemEdit = async (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    setSavingItem(true);

    await supabase.from("saved_meal_items" as any).update({
      quantity: item.quantity,
      calories: Math.round(item.calories),
      protein: Math.round(item.protein),
      carbs: Math.round(item.carbs),
      fat: Math.round(item.fat),
    } as any).eq("id", itemId);

    // Recalc parent totals
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
  };

  const adjustItemQty = (itemId: string, delta: number) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    const step = item.serving_unit === "g" ? 10 : 0.5;
    const newQty = Math.max(0, (item.quantity || 0) + delta * step);
    updateItemQuantity(itemId, newQty);
  };

  // Store base values when editing starts
  const startEditItem = (itemId: string) => {
    setItems(prev => prev.map(i => {
      if (i.id === itemId && !i.base_quantity) {
        return { ...i, base_quantity: i.quantity, base_calories: i.calories, base_protein: i.protein, base_carbs: i.carbs, base_fat: i.fat };
      }
      return i;
    }));
    setEditingItemId(itemId);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col animate-fade-in">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border">
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
        ) : items.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-12">
            No items in this meal. This meal uses flat macro totals.
          </p>
        ) : (
          <div className="space-y-1.5 py-3">
            {items.map((item: any) => (
              <div key={item.id} className="rounded-xl bg-card border border-border/50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3">
                  <button
                    onClick={() => editingItemId === item.id ? setEditingItemId(null) : startEditItem(item.id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="text-sm font-medium text-foreground truncate">{item.food_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.quantity} {item.serving_unit} · {Math.round(item.calories)} cal · {Math.round(item.protein)}P · {Math.round(item.carbs)}C · {Math.round(item.fat)}F
                    </div>
                  </button>
                  <button onClick={() => removeItem(item.id)} className="ml-2 p-1.5 rounded-lg hover:bg-destructive/10 transition-colors">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>

                {/* Inline quantity editor */}
                {editingItemId === item.id && (
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
                        <span className="text-xs text-muted-foreground">{item.serving_unit}</span>
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
            ))}
          </div>
        )}
      </div>

      {/* Add to Log Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-background border-t border-border z-[60]">
        <Button
          onClick={addToLog}
          disabled={logging}
          className="w-full h-[52px] text-base font-semibold bg-primary text-primary-foreground rounded-xl"
        >
          {logging ? "Adding..." : `Add to ${mealLabel}`}
        </Button>
      </div>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {meal.name}?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteMeal} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SavedMealDetail;
