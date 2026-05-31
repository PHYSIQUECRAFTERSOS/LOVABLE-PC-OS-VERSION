import { useState, useEffect, useMemo } from "react";
import { useIOSOverlayRepaint, OverlayPortal } from "@/hooks/useIOSOverlayRepaint";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";

interface PCRecipeDetailProps {
  recipe: any;
  mealType: string;
  mealLabel: string;
  logDate: string;
  onBack: () => void;
  onLogged: () => void;
}

// Parse "1/3", "0.5", ".25", "1.5" → number; null if invalid
function parsePortion(raw: string): number | null {
  const s = (raw || "").trim();
  if (!s) return null;
  if (s.includes("/")) {
    const [a, b] = s.split("/").map(x => parseFloat(x));
    if (!isFinite(a) || !isFinite(b) || b === 0) return null;
    return a / b;
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

// Format a fraction nicely for display: 0.125 → "1/8", 0.5 → "1/2", 1 → "1", else decimal
function formatPortion(n: number): string {
  const known: Array<[number, string]> = [
    [1/8, "1/8"], [1/6, "1/6"], [1/4, "1/4"], [1/3, "1/3"],
    [1/2, "1/2"], [2/3, "2/3"], [3/4, "3/4"],
  ];
  for (const [v, label] of known) {
    if (Math.abs(n - v) < 0.005) return label;
  }
  if (Math.abs(n - Math.round(n)) < 0.005) return String(Math.round(n));
  return (Math.round(n * 100) / 100).toString();
}

const PCRecipeDetail = ({ recipe, mealType, mealLabel, logDate, onBack, onLogged }: PCRecipeDetailProps) => {
  useIOSOverlayRepaint();
  const { user } = useAuth();
  const { toast } = useToast();
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [instructions, setInstructions] = useState<any[]>([]);
  const [portion, setPortion] = useState<number>(1);
  const [portionInput, setPortionInput] = useState<string>("1");
  const [inputValid, setInputValid] = useState(true);
  const [loading, setLoading] = useState(true);
  const [logging, setLogging] = useState(false);

  const yieldN = Math.max(1, Number(recipe.servings) || 1);

  useEffect(() => {
    fetchDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe.id]);

  const fetchDetails = async () => {
    setLoading(true);
    const [{ data: ings }, { data: insts }] = await Promise.all([
      supabase.from("pc_recipe_ingredients" as any).select("*").eq("recipe_id", recipe.id).order("sort_order"),
      supabase.from("pc_recipe_instructions" as any).select("*").eq("recipe_id", recipe.id).order("step_number"),
    ]);
    setIngredients((ings as any[]) || []);
    setInstructions((insts as any[]) || []);
    setLoading(false);
  };

  // Batch totals = sum of ingredient macros (stored as full-recipe totals)
  const batchTotals = useMemo(() => ingredients.reduce((acc, ing) => ({
    calories: acc.calories + (Number(ing.calories) || 0),
    protein: acc.protein + (Number(ing.protein) || 0),
    carbs: acc.carbs + (Number(ing.carbs) || 0),
    fat: acc.fat + (Number(ing.fat) || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 }), [ingredients]);

  // factor scales batch → eaten portion
  const factor = portion / yieldN;

  const scaled = {
    calories: batchTotals.calories * factor,
    protein: batchTotals.protein * factor,
    carbs: batchTotals.carbs * factor,
    fat: batchTotals.fat * factor,
  };

  // Quick chips depend on yield: when batch makes >1, offer fractions; else whole numbers
  const chipValues: number[] = yieldN > 1
    ? Array.from(new Set([1, 2, ...(yieldN >= 2 ? [1/2] : []), ...(yieldN >= 3 ? [1/3] : []), ...(yieldN >= 4 ? [1/4] : []), ...(yieldN >= 6 ? [1/6] : []), ...(yieldN >= 8 ? [1/8] : [])]))
        .sort((a, b) => a - b)
    : [0.5, 1, 2, 3];

  const setPortionValue = (v: number) => {
    setPortion(v);
    setPortionInput(formatPortion(v));
    setInputValid(true);
  };

  const onInputChange = (raw: string) => {
    setPortionInput(raw);
    const parsed = parsePortion(raw);
    if (parsed === null || parsed <= 0 || parsed > yieldN * 5) {
      setInputValid(false);
      return;
    }
    setInputValid(true);
    setPortion(parsed);
  };

  const addToLog = async () => {
    if (!user || ingredients.length === 0 || !inputValid) return;
    setLogging(true);

    // Sum micros across ingredients with food_item_ids, scaled by factor
    const foodItemIds = ingredients.filter(i => i.food_item_id).map(i => i.food_item_id);
    const aggregatedMicros: Record<string, number> = {};
    if (foodItemIds.length > 0) {
      try {
        const { extractMicros } = await import("@/utils/micronutrientHelper");
        const { data: foodItems } = await supabase
          .from("food_items")
          .select("*")
          .in("id", foodItemIds);
        if (foodItems) {
          const byId: Record<string, any> = {};
          foodItems.forEach((fi: any) => { byId[fi.id] = fi; });
          ingredients.forEach((ing: any) => {
            const fi = ing.food_item_id ? byId[ing.food_item_id] : null;
            if (!fi) return;
            // ing.quantity is the batch quantity in serving_unit; micros stored per serving in food_items
            const micros = extractMicros(fi, Number(ing.quantity) || 0);
            Object.entries(micros).forEach(([k, v]) => {
              aggregatedMicros[k] = (aggregatedMicros[k] || 0) + (v as number);
            });
          });
        }
      } catch (err) {
        console.warn("[PCRecipeDetail] Could not fetch micros:", err);
      }
    }

    const scaledMicros = Object.fromEntries(
      Object.entries(aggregatedMicros).map(([k, v]) => [k, Math.round((v as number) * factor * 100) / 100])
    );

    const tag = yieldN > 1 ? ` (${formatPortion(portion)}/${yieldN} batch)` : "";
    const entry: any = {
      client_id: user.id,
      food_item_id: null,
      custom_name: `🍳 ${recipe.name}${tag}`,
      meal_type: mealType,
      servings: Math.round(portion * 1000) / 1000,
      quantity_display: Math.round(portion * 1000) / 1000,
      quantity_unit: "portion",
      calories: Math.round(scaled.calories),
      protein: Math.round(scaled.protein),
      carbs: Math.round(scaled.carbs),
      fat: Math.round(scaled.fat),
      logged_at: logDate,
      tz_corrected: true,
      ...scaledMicros,
    };

    const { error } = await supabase.from("nutrition_logs").insert(entry);
    if (error) {
      console.error("[PCRecipeDetail] Log error:", error);
      toast({ title: "Couldn't log recipe." });
    } else {
      toast({ title: `${recipe.name} added to ${mealLabel}` });
      onLogged();
    }
    setLogging(false);
  };

  return (
    <OverlayPortal><div className="overlay-fullscreen z-[70] animate-fade-in">
      <div className="flex items-center gap-3 px-4 safe-top pb-3 border-b border-border">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-secondary">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="flex-1 text-base font-semibold text-foreground truncate">{recipe.name}</h1>
      </div>

      {/* Yield label + Portion picker */}
      <div className="px-4 py-3 border-b border-border space-y-3">
        {yieldN > 1 && (
          <div className="text-xs text-muted-foreground text-center">
            Recipe makes <span className="text-foreground font-medium">{yieldN}</span> portions
          </div>
        )}

        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Portion you ate</div>
          <div className="flex flex-wrap gap-1.5">
            {chipValues.map(v => {
              const active = Math.abs(portion - v) < 0.005;
              return (
                <button
                  key={v}
                  onClick={() => setPortionValue(v)}
                  className={`px-3 h-8 rounded-full text-xs font-medium border transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary text-foreground border-border hover:bg-secondary/70"
                  }`}
                >
                  {formatPortion(v)}{yieldN > 1 ? ` of ${yieldN}` : ""}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-muted-foreground">or enter:</span>
            <Input
              inputMode="decimal"
              value={portionInput}
              onChange={(e) => onInputChange(e.target.value)}
              placeholder="1 or 1/3"
              className={`h-8 w-24 text-sm text-center ${!inputValid ? "border-destructive" : ""}`}
            />
            <span className="text-xs text-muted-foreground">portions</span>
          </div>
        </div>
      </div>

      {/* Live Macro Summary (= what will be logged) */}
      <div className="px-4 py-3 border-b border-border">
        <div className="grid grid-cols-4 gap-3 text-center">
          <div>
            <div className="text-lg font-bold text-foreground">{Math.round(scaled.calories)}</div>
            <div className="text-[10px] text-muted-foreground uppercase">Calories</div>
          </div>
          <div>
            <div className="text-lg font-bold text-destructive">{Math.round(scaled.protein)}g</div>
            <div className="text-[10px] text-muted-foreground uppercase">Protein</div>
          </div>
          <div>
            <div className="text-lg font-bold text-info">{Math.round(scaled.carbs)}g</div>
            <div className="text-[10px] text-muted-foreground uppercase">Carbs</div>
          </div>
          <div>
            <div className="text-lg font-bold text-warn">{Math.round(scaled.fat)}g</div>
            <div className="text-[10px] text-muted-foreground uppercase">Fat</div>
          </div>
        </div>
        {yieldN > 1 && (
          <div className="text-[10px] text-muted-foreground text-center mt-1.5">
            {formatPortion(portion)} of {yieldN} portions · full batch {Math.round(batchTotals.calories)} cal
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-32">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Ingredients */}
            <div className="py-3">
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ingredients</h2>
                {yieldN > 1 && (
                  <span className="text-[10px] text-muted-foreground">scaled × {formatPortion(portion)}/{yieldN}</span>
                )}
              </div>
              <div className="space-y-1.5">
                {ingredients.map((ing: any) => {
                  const q = (Number(ing.quantity) || 0) * factor;
                  const cal = (Number(ing.calories) || 0) * factor;
                  const p = (Number(ing.protein) || 0) * factor;
                  const c = (Number(ing.carbs) || 0) * factor;
                  const f = (Number(ing.fat) || 0) * factor;
                  return (
                    <div key={ing.id} className="rounded-xl bg-card border border-border/50 px-4 py-3">
                      <div className="text-sm font-medium text-foreground">{ing.food_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {Math.round(q * 10) / 10} {ing.serving_unit} · {Math.round(cal)} cal
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {Math.round(p)}P · {Math.round(c)}C · {Math.round(f)}F
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Instructions */}
            {instructions.length > 0 && (
              <div className="py-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Instructions</h2>
                <div className="space-y-2">
                  {instructions.map((inst: any) => (
                    <div key={inst.id} className="flex gap-3">
                      <div className="h-6 w-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                        {inst.step_number}
                      </div>
                      <p className="text-sm text-foreground">{inst.instruction_text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* YouTube Video Preview */}
            {recipe.youtube_url && recipe.youtube_url.trim() !== "" && (() => {
              const ytMatch = recipe.youtube_url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]+)/);
              const videoId = ytMatch ? ytMatch[1] : null;
              if (!videoId) return null;
              return (
                <div className="py-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Watch Recipe</h2>
                  <div className="rounded-xl overflow-hidden border border-border/50 aspect-video">
                    <iframe
                      src={`https://www.youtube.com/embed/${videoId}?playsinline=1&rel=0&modestbranding=1`}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      loading="lazy"
                      title="Recipe video"
                    />
                  </div>
                </div>
              );
            })()}

            {recipe.description && (
              <div className="py-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Description</h2>
                <p className="text-sm text-muted-foreground">{recipe.description}</p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-background border-t border-border z-[60]">
        <Button
          onClick={addToLog}
          disabled={logging || ingredients.length === 0 || !inputValid}
          className="w-full h-[52px] text-base font-semibold bg-primary text-primary-foreground rounded-xl"
        >
          {logging ? "Adding..." : `Add to ${mealLabel}`}
        </Button>
      </div>
    </div></OverlayPortal>
  );
};

export default PCRecipeDetail;
