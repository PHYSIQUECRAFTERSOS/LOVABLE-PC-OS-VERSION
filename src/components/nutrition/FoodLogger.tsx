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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search } from "lucide-react";
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
}

interface FoodLoggerProps {
  onLogged: () => void;
}

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "pre-workout", "post-workout"];

const FoodLogger = ({ onLogged }: FoodLoggerProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<FoodItem[]>([]);
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [servings, setServings] = useState("1");
  const [mealType, setMealType] = useState("snack");
  const [customName, setCustomName] = useState("");
  const [customCal, setCustomCal] = useState("");
  const [customProtein, setCustomProtein] = useState("");
  const [customCarbs, setCustomCarbs] = useState("");
  const [customFat, setCustomFat] = useState("");
  const [mode, setMode] = useState<"search" | "custom">("search");
  const [loading, setLoading] = useState(false);

  const handleSearch = async (q: string) => {
    setSearch(q);
    if (q.length < 2) { setResults([]); return; }
    const { data } = await supabase
      .from("food_items")
      .select("*")
      .ilike("name", `%${q}%`)
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
        };

    const { error } = await supabase.from("nutrition_logs").insert(entry);
    setLoading(false);

    if (error) {
      toast({ title: "Error logging food", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Food logged!" });
      setOpen(false);
      resetForm();
      onLogged();
    }
  };

  const resetForm = () => {
    setSearch(""); setResults([]); setSelected(null);
    setServings("1"); setMealType("snack"); setMode("search");
    setCustomName(""); setCustomCal(""); setCustomProtein("");
    setCustomCarbs(""); setCustomFat("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Log Food
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log Food</DialogTitle>
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
          <div>
            <Label>Meal Type</Label>
            <Select value={mealType} onValueChange={setMealType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MEAL_TYPES.map((m) => (
                  <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {mode === "search" ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search foods..."
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-9"
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
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div><div className="font-bold text-foreground">{Math.round(selected.calories * (parseFloat(servings) || 1))}</div>Cal</div>
                    <div><div className="font-bold text-foreground">{Math.round(selected.protein * (parseFloat(servings) || 1))}g</div>Protein</div>
                    <div><div className="font-bold text-foreground">{Math.round(selected.carbs * (parseFloat(servings) || 1))}g</div>Carbs</div>
                    <div><div className="font-bold text-foreground">{Math.round(selected.fat * (parseFloat(servings) || 1))}g</div>Fat</div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>Food Name</Label>
                <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="e.g. Homemade smoothie" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Calories</Label><Input type="number" value={customCal} onChange={(e) => setCustomCal(e.target.value)} /></div>
                <div><Label>Protein (g)</Label><Input type="number" value={customProtein} onChange={(e) => setCustomProtein(e.target.value)} /></div>
                <div><Label>Carbs (g)</Label><Input type="number" value={customCarbs} onChange={(e) => setCustomCarbs(e.target.value)} /></div>
                <div><Label>Fat (g)</Label><Input type="number" value={customFat} onChange={(e) => setCustomFat(e.target.value)} /></div>
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
