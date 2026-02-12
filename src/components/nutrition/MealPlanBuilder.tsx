import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Search, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FoodItem {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving_size: number;
  serving_unit: string;
}

interface PlanItem {
  food_item_id?: string;
  custom_name?: string;
  meal_type: string;
  servings: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface Client {
  user_id: string;
  full_name: string | null;
}

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "pre-workout", "post-workout"];

const MealPlanBuilder = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [planName, setPlanName] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<PlanItem[]>([]);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<FoodItem[]>([]);
  const [addingMeal, setAddingMeal] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("coach_clients")
      .select("client_id")
      .eq("coach_id", user.id)
      .eq("status", "active")
      .then(async ({ data }) => {
        if (data && data.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, full_name")
            .in("user_id", data.map(d => d.client_id));
          setClients((profiles as Client[]) || []);
        }
      });
  }, [user]);

  const handleSearch = async (q: string) => {
    setSearch(q);
    if (q.length < 2) { setSearchResults([]); return; }
    const { data } = await supabase
      .from("food_items")
      .select("*")
      .ilike("name", `%${q}%`)
      .limit(8);
    setSearchResults((data as FoodItem[]) || []);
  };

  const addFood = (food: FoodItem) => {
    setItems([...items, {
      food_item_id: food.id,
      custom_name: food.name,
      meal_type: addingMeal || "snack",
      servings: 1,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
    }]);
    setSearch("");
    setSearchResults([]);
    setAddingMeal("");
  };

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!user || !planName) return;
    setLoading(true);

    const { data: plan, error } = await supabase
      .from("meal_plans")
      .insert({
        coach_id: user.id,
        client_id: selectedClient || null,
        name: planName,
        description,
        is_template: !selectedClient,
      })
      .select("id")
      .single();

    if (error || !plan) {
      toast({ title: "Error", description: error?.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    if (items.length > 0) {
      const planItems = items.map((item, idx) => ({
        meal_plan_id: plan.id,
        food_item_id: item.food_item_id || null,
        custom_name: item.custom_name,
        meal_type: item.meal_type,
        servings: item.servings,
        calories: Math.round(item.calories * item.servings),
        protein: Math.round(item.protein * item.servings),
        carbs: Math.round(item.carbs * item.servings),
        fat: Math.round(item.fat * item.servings),
        item_order: idx,
      }));
      await supabase.from("meal_plan_items").insert(planItems);
    }

    setLoading(false);
    toast({ title: "Meal plan saved!" });
    setPlanName(""); setDescription(""); setItems([]); setSelectedClient("");
  };

  const totals = items.reduce(
    (acc, i) => ({
      calories: acc.calories + Math.round(i.calories * i.servings),
      protein: acc.protein + Math.round(i.protein * i.servings),
      carbs: acc.carbs + Math.round(i.carbs * i.servings),
      fat: acc.fat + Math.round(i.fat * i.servings),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" /> Meal Plan Builder
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><Label>Plan Name</Label><Input value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="e.g. Cutting Phase Week 1" /></div>
          <div>
            <Label>Assign to Client (optional)</Label>
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger><SelectValue placeholder="Template (no client)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Template (no client)</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.user_id} value={c.user_id}>
                    {c.full_name || "Unnamed"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Add food to plan */}
        <div className="space-y-2">
          <Label>Add Food Items</Label>
          <div className="flex gap-2">
            <Select value={addingMeal} onValueChange={setAddingMeal}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Meal" /></SelectTrigger>
              <SelectContent>
                {MEAL_TYPES.map(m => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search food..." value={search} onChange={(e) => handleSearch(e.target.value)} className="pl-9" />
            </div>
          </div>

          {searchResults.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded border border-border p-1 space-y-0.5">
              {searchResults.map(f => (
                <button key={f.id} onClick={() => addFood(f)} className="w-full text-left rounded px-3 py-1.5 text-sm hover:bg-secondary transition-colors">
                  <span className="font-medium text-foreground">{f.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">{f.calories}cal · {f.protein}P · {f.carbs}C · {f.fat}F</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Items list */}
        {items.length > 0 && (
          <div className="space-y-1">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between rounded border border-border px-3 py-2">
                <div>
                  <span className="text-sm font-medium text-foreground">{item.custom_name}</span>
                  <span className="ml-2 text-xs text-muted-foreground capitalize">({item.meal_type})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{item.calories}cal</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeItem(idx)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
            <div className="text-xs text-muted-foreground pt-2 text-right">
              Total: {totals.calories} cal · {totals.protein}P · {totals.carbs}C · {totals.fat}F
            </div>
          </div>
        )}

        <Button onClick={handleSave} disabled={loading || !planName} className="w-full">
          {loading ? "Saving..." : "Save Meal Plan"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default MealPlanBuilder;
