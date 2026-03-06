import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import FoodIcon from "@/lib/foodIcons";
import BarcodeScanner from "@/components/nutrition/BarcodeScanner";
import MealScanCapture from "@/components/nutrition/MealScanCapture";

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
  is_verified?: boolean;
}

interface AddFoodScreenProps {
  mealType: string;
  mealLabel: string;
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

const AddFoodScreen = ({ mealType, mealLabel, open, onClose, onLogged }: AddFoodScreenProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const searchRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<FoodItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historySort, setHistorySort] = useState<HistorySort>("recent");
  const [history, setHistory] = useState<FoodItem[]>([]);
  const [savedMeals, setSavedMeals] = useState<any[]>([]);
  const [servings, setServings] = useState<Record<string, string>>({});
  const [servingUnits, setServingUnits] = useState<Record<string, ServingUnit>>({});

  // Quick Add state
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickCal, setQuickCal] = useState("");
  const [quickProtein, setQuickProtein] = useState("");
  const [quickCarbs, setQuickCarbs] = useState("");
  const [quickFat, setQuickFat] = useState("");

  // Barcode & Meal Scan state
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [mealScanOpen, setMealScanOpen] = useState(false);

  // Focus search on open
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 100);
      fetchHistory();
      fetchSavedMeals();
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
      .select("id, name, brand, serving_size, serving_unit, calories, protein, carbs, fat, fiber, sugar, sodium, is_verified")
      .in("id", foodIds);

    if (foods) {
      if (historySort === "recent") {
        // Order by most recent appearance
        const ordered = foodIds.map(id => foods.find(f => f.id === id)).filter(Boolean) as FoodItem[];
        setHistory(ordered);
      } else {
        // Order by frequency
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

  useEffect(() => {
    fetchHistory();
  }, [historySort]);

  const handleSearch = async (q: string) => {
    setSearch(q);
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);

    let query = supabase
      .from("food_items")
      .select("id, name, brand, serving_size, serving_unit, calories, protein, carbs, fat, fiber, sugar, sodium, is_verified")
      .ilike("name", `%${q}%`)
      .order("is_verified", { ascending: false })
      .limit(20);

    if (activeTab === "my-foods" && user) {
      query = query.eq("created_by", user.id);
    }

    const { data } = await query;
    setResults((data as FoodItem[]) || []);
    setSearching(false);
  };

  const logFood = async (item: FoodItem) => {
    if (!user) return;
    const unit = servingUnits[item.id] || "serving";
    const inputVal = parseFloat(servings[item.id] || "1") || 0;
    
    // Calculate multiplier based on unit
    let multiplier: number;
    if (unit === "g") {
      // inputVal is grams, item macros are per serving_size (in serving_unit)
      const baseSizeG = item.serving_unit === "oz" ? item.serving_size * 28.3495 : item.serving_size;
      multiplier = inputVal / baseSizeG;
    } else if (unit === "oz") {
      const baseSizeOz = item.serving_unit === "g" ? item.serving_size / 28.3495 : item.serving_size;
      multiplier = inputVal / baseSizeOz;
    } else {
      multiplier = inputVal; // servings
    }

    const { error } = await supabase.from("nutrition_logs").insert({
      client_id: user.id,
      food_item_id: item.id,
      meal_type: mealType,
      servings: multiplier,
      calories: Math.round(item.calories * multiplier),
      protein: Math.round(item.protein * multiplier),
      carbs: Math.round(item.carbs * multiplier),
      fat: Math.round(item.fat * multiplier),
      fiber: Math.round((item.fiber || 0) * multiplier),
      sugar: Math.round((item.sugar || 0) * multiplier),
      sodium: Math.round((item.sodium || 0) * multiplier),
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${item.name} logged` });
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
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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

  if (!open) return null;

  const displayItems = search.length >= 2 ? results : [];
  const showHistory = search.length < 2 && activeTab !== "my-meals";
  const showMeals = activeTab === "my-meals";

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
            placeholder="Search food"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10 h-11 rounded-xl bg-secondary border-0 text-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/50"
          />
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
            <QuickActionCard icon={ScanBarcode} label="Barcode" onClick={() => { console.log("[AddFood] Barcode tapped"); setBarcodeOpen(true); }} />
            <QuickActionCard icon={Camera} label="Meal Scan" onClick={() => { console.log("[AddFood] Meal Scan tapped"); setMealScanOpen(true); }} />
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
                    // Reset amount to sensible default when switching units
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
            ) : displayItems.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">No results found</p>
            ) : (
              displayItems.map((item) => (
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
      </div>

      {/* Barcode Scanner */}
      <BarcodeScanner
        open={barcodeOpen}
        onOpenChange={setBarcodeOpen}
        onLogged={() => { setBarcodeOpen(false); onLogged(); }}
      />

      {/* Meal Scan */}
      <MealScanCapture
        open={mealScanOpen}
        onClose={() => setMealScanOpen(false)}
        mealType={mealType}
        onLogged={onLogged}
      />
    </div>
  );
};

/* ── Food Row ── */

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
  // Calculate multiplier based on unit
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

  return (
    <div className="rounded-xl bg-card border border-border/50 overflow-hidden transition-all">
      <div className="flex items-center gap-3 px-4 py-3">
        <FoodIcon name={item.name} size={36} />
        <button onClick={onToggle} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-foreground truncate">{item.name}</span>
            {item.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-primary shrink-0" />}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground">{item.calories} cal</span>
            {item.brand && <span className="text-xs text-muted-foreground/60">· {item.brand}</span>}
            <span className="text-xs text-muted-foreground/60">· {item.serving_size}{item.serving_unit}</span>
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

/* ── Quick Action Card ── */

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
