import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Search, Bookmark } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FoodItem {
  id: string;
  name: string;
  brand: string | null;
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
}

interface FoodLoggerProps {
  onLogged: () => void;
  mealType: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FoodLogger = ({ onLogged, mealType, open, onOpenChange }: FoodLoggerProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<FoodItem[]>([]);
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [servings, setServings] = useState("1");
  const [customName, setCustomName] = useState("");
  const [customCal, setCustomCal] = useState("");
  const [customProtein, setCustomProtein] = useState("");
  const [customCarbs, setCustomCarbs] = useState("");
  const [customFat, setCustomFat] = useState("");
  const [customFiber, setCustomFiber] = useState("");
  const [customSugar, setCustomSugar] = useState("");
  const [customSodium, setCustomSodium] = useState("");
  const [mode, setMode] = useState<"search" | "custom">("search");
  const [loading, setLoading] = useState(false);
  const [saveMealName, setSaveMealName] = useState("");

  const MEAL_LABELS: Record<string, string> = {
    breakfast: "Breakfast",
    "pre-workout": "Pre-Workout Meal",
    "post-workout": "Post-Workout Meal",
    lunch: "Lunch",
    dinner: "Dinner",
    snack: "Snacks",
  };

  const handleSearch = async (q: string) => {
    setSearch(q);
    if (q.length < 2) { setResults([]); return; }
    const { data } = await supabase
      .from("food_items")
      .select("*")
      .ilike("name", `%${q}%`)
      .order("is_verified", { ascending: false })
      .limit(10);
    setResults((data as FoodItem[]) || []);
  };

  const handleLog = async () => {
    if (!user) return;
    setLoading(true);
    const s = parseFloat(servings) || 1;

    const entry = mode === "search" && selected
      ? {
          client_id: user.id,
          food_item_id: selected.id,
          meal_type: mealType,
          servings: s,
          calories: Math.round(selected.calories * s),
          protein: Math.round(selected.protein * s),
          carbs: Math.round(selected.carbs * s),
          fat: Math.round(selected.fat * s),
          fiber: Math.round((selected.fiber || 0) * s),
          sugar: Math.round((selected.sugar || 0) * s),
          sodium: Math.round((selected.sodium || 0) * s),
        }
      : {
          client_id: user.id,
          custom_name: customName,
          meal_type: mealType,
          servings: 1,
          calories: parseInt(customCal) || 0,
          protein: parseInt(customProtein) || 0,
          carbs: parseInt(customCarbs) || 0,
          fat: parseInt(customFat) || 0,
          fiber: parseInt(customFiber) || 0,
          sugar: parseInt(customSugar) || 0,
          sodium: parseInt(customSodium) || 0,
        };

    const { error } = await supabase.from("nutrition_logs").insert(entry);
    setLoading(false);

    if (error) {
      toast({ title: "Error logging food", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Food logged!" });

      if (saveMealName.trim()) {
        await supabase.from("saved_meals").insert({
          client_id: user.id,
          name: saveMealName,
          meal_type: mealType,
          ...(mode === "search" && selected ? {
            calories: Math.round(selected.calories * s),
            protein: Math.round(selected.protein * s),
            carbs: Math.round(selected.carbs * s),
            fat: Math.round(selected.fat * s),
            fiber: Math.round((selected.fiber || 0) * s),
            sugar: Math.round((selected.sugar || 0) * s),
            sodium: Math.round((selected.sodium || 0) * s),
          } : {
            calories: parseInt(customCal) || 0,
            protein: parseInt(customProtein) || 0,
            carbs: parseInt(customCarbs) || 0,
            fat: parseInt(customFat) || 0,
            fiber: parseInt(customFiber) || 0,
            sugar: parseInt(customSugar) || 0,
            sodium: parseInt(customSodium) || 0,
          })
        });
      }

      onOpenChange(false);
      resetForm();
      onLogged();
    }
  };

  const resetForm = () => {
    setSearch(""); setResults([]); setSelected(null);
    setServings("1"); setMode("search");
    setCustomName(""); setCustomCal(""); setCustomProtein("");
    setCustomCarbs(""); setCustomFat(""); setCustomFiber("");
    setCustomSugar(""); setCustomSodium(""); setSaveMealName("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Food — {MEAL_LABELS[mealType] || mealType}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          <Button
            variant={mode === "search" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("search")}
          >
            Search Database
          </Button>
          <Button
            variant={mode === "custom" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("custom")}
          >
            Quick Add
          </Button>
        </div>

        <div className="space-y-4">
          {mode === "search" ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search foods..."
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
              </div>

              {results.length > 0 && !selected && (
                <div className="max-h-48 overflow-y-auto space-y-1 rounded-md border border-border p-2">
                  {results.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setSelected(item)}
                      className="w-full text-left rounded px-3 py-2 text-sm hover:bg-secondary transition-colors"
                    >
                      <div className="font-medium text-foreground">{item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.calories} cal · {item.protein}P · {item.carbs}C · {item.fat}F per {item.serving_size}{item.serving_unit}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {selected && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-foreground">{selected.name}</div>
                      <div className="text-xs text-muted-foreground">
                        per {selected.serving_size}{selected.serving_unit}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Change</Button>
                  </div>
                  <div>
                    <Label>Servings</Label>
                    <Input
                      type="number"
                      step="0.25"
                      min="0.25"
                      value={servings}
                      onChange={(e) => setServings(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center text-xs">
                    <div><div className="font-bold text-foreground">{Math.round(selected.calories * (parseFloat(servings) || 1))}</div>Cal</div>
                    <div><div className="font-bold text-foreground">{Math.round(selected.protein * (parseFloat(servings) || 1))}g</div>Protein</div>
                    <div><div className="font-bold text-foreground">{Math.round(selected.carbs * (parseFloat(servings) || 1))}g</div>Carbs</div>
                    <div><div className="font-bold text-foreground">{Math.round(selected.fat * (parseFloat(servings) || 1))}g</div>Fat</div>
                    <div><div className="font-bold text-foreground">{Math.round((selected.fiber || 0) * (parseFloat(servings) || 1))}g</div>Fiber</div>
                    <div><div className="font-bold text-foreground">{Math.round((selected.sugar || 0) * (parseFloat(servings) || 1))}g</div>Sugar</div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>Food Name</Label>
                <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="e.g. Homemade smoothie" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Calories</Label><Input type="number" value={customCal} onChange={(e) => setCustomCal(e.target.value)} /></div>
                <div><Label>Protein (g)</Label><Input type="number" value={customProtein} onChange={(e) => setCustomProtein(e.target.value)} /></div>
                <div><Label>Carbs (g)</Label><Input type="number" value={customCarbs} onChange={(e) => setCustomCarbs(e.target.value)} /></div>
                <div><Label>Fat (g)</Label><Input type="number" value={customFat} onChange={(e) => setCustomFat(e.target.value)} /></div>
                <div><Label>Fiber (g)</Label><Input type="number" value={customFiber} onChange={(e) => setCustomFiber(e.target.value)} /></div>
                <div><Label>Sugar (g)</Label><Input type="number" value={customSugar} onChange={(e) => setCustomSugar(e.target.value)} /></div>
                <div><Label>Sodium (mg)</Label><Input type="number" value={customSodium} onChange={(e) => setCustomSodium(e.target.value)} /></div>
              </div>
              <div>
                <Label>Save as Meal (optional)</Label>
                <Input placeholder="e.g., Protein Shake" value={saveMealName} onChange={(e) => setSaveMealName(e.target.value)} />
              </div>
            </div>
          )}

          <Button
            onClick={handleLog}
            disabled={loading || (mode === "search" ? !selected : !customName)}
            className="w-full"
          >
            {loading ? "Logging..." : "Log Food"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FoodLogger;
