import { useState, useMemo, useEffect, useRef } from "react";
import { ChevronDown, ShieldCheck, ArrowLeft } from "lucide-react";
import { useIOSOverlayRepaint, OverlayPortal } from "@/hooks/useIOSOverlayRepaint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface ServingOption {
  description: string;
  size_g: number;
}

export interface FoodDetailEntry {
  food: FoodDetailFood;
  servingDescription: string;
  servingGrams: number;
  quantity: number;
  totalGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
}

export interface FoodDetailFood {
  id?: string;
  name: string;
  brand?: string | null;
  calories_per_100g?: number | null;
  protein_per_100g?: number | null;
  carbs_per_100g?: number | null;
  fat_per_100g?: number | null;
  fiber_per_100g?: number | null;
  sugar_per_100g?: number | null;
  sodium_per_100g?: number | null;
  serving_size_g?: number | null;
  serving_unit?: string | null;
  serving_description?: string | null;
  additional_serving_sizes?: Array<{ description: string; size_g: number }> | null;
  source?: string | null;
  is_branded?: boolean;
  image_url?: string | null;
}

interface Props {
  food: FoodDetailFood;
  mealType: string;
  mealLabel: string;
  onConfirm: (entry: FoodDetailEntry) => void;
  onBack: () => void;
}

export default function FoodDetailScreen({ food, mealType, mealLabel, onConfirm, onBack }: Props) {
  useIOSOverlayRepaint();
  const servingOptions = useMemo(() => {
    const options: ServingOption[] = [];

    if (food.serving_description && food.serving_size_g) {
      options.push({
        description: food.serving_description,
        size_g: food.serving_size_g,
      });
    }

    const additional = food.additional_serving_sizes ?? [];
    additional.forEach((s) => {
      if (s.description && s.size_g && !options.find(o => o.description === s.description)) {
        options.push({ description: s.description, size_g: s.size_g });
      }
    });

    if (!options.find(o => o.description === "100g")) {
      options.push({ description: "100g", size_g: 100 });
    }

    if (options.length === 0) {
      options.push({ description: `${food.serving_size_g ?? 100}g`, size_g: food.serving_size_g ?? 100 });
    }

    return options;
  }, [food]);

  const [selectedServing, setSelectedServing] = useState(servingOptions[0]);
  const [quantityStr, setQuantityStr] = useState("1");
  const [useGrams, setUseGrams] = useState(false);
  const [customGramsStr, setCustomGramsStr] = useState(String(selectedServing.size_g));

  const quantity = parseFloat(quantityStr) || 0;
  const customGrams = parseFloat(customGramsStr) || 0;
  const [showServingDropdown, setShowServingDropdown] = useState(false);
  const userInteracted = useRef(false);
  const { user } = useAuth();

  // Smart Serving Memory: silently pre-fill from last used serving
  useEffect(() => {
    if (!user?.id || !food.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("user_food_serving_memory" as any)
          .select("serving_size, serving_unit")
          .eq("user_id", user.id)
          .eq("food_id", food.id)
          .maybeSingle();
        if (cancelled || !data || userInteracted.current) return;
        const mem = data as unknown as { serving_size: number; serving_unit: string };
        if (mem.serving_unit === "g" || mem.serving_unit === "grams") {
          setUseGrams(true);
          setCustomGramsStr(String(mem.serving_size));
        } else {
          // Try to match a serving option
          const match = servingOptions.find(
            (o) => o.description === mem.serving_unit
          );
          if (match) {
            setSelectedServing(match);
            setQuantityStr(String(mem.serving_size));
          } else {
            // Fallback: use grams mode with the remembered size
            setUseGrams(true);
            setCustomGramsStr(String(mem.serving_size));
          }
        }
      } catch {
        // Silent fallback to defaults
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, food.id]);

  const effectiveGrams = useGrams
    ? customGrams * quantity
    : selectedServing.size_g * quantity;

  const ratio = effectiveGrams / 100;

  const calories = Math.round((food.calories_per_100g ?? 0) * ratio);
  const protein = Math.round((food.protein_per_100g ?? 0) * ratio * 10) / 10;
  const carbs = Math.round((food.carbs_per_100g ?? 0) * ratio * 10) / 10;
  const fat = Math.round((food.fat_per_100g ?? 0) * ratio * 10) / 10;
  const fiber = Math.round((food.fiber_per_100g ?? 0) * ratio * 10) / 10;
  const sugar = Math.round((food.sugar_per_100g ?? 0) * ratio * 10) / 10;
  const sodium = Math.round((food.sodium_per_100g ?? 0) * ratio);

  const total = protein + carbs + fat;
  const proteinPct = total > 0 ? Math.round((protein / total) * 100) : 0;
  const carbsPct = total > 0 ? Math.round((carbs / total) * 100) : 0;
  const fatPct = total > 0 ? 100 - proteinPct - carbsPct : 0;

  // SVG macro ring
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const proteinDash = (proteinPct / 100) * circumference;
  const carbsDash = (carbsPct / 100) * circumference;
  const fatDash = (fatPct / 100) * circumference;

  const [logging, setLogging] = useState(false);

  const handleConfirm = () => {
    if (logging) return;
    setLogging(true);
    onConfirm({
      food,
      servingDescription: useGrams ? `${customGrams}g` : selectedServing.description,
      servingGrams: useGrams ? customGrams : selectedServing.size_g,
      quantity,
      totalGrams: effectiveGrams,
      calories,
      protein,
      carbs,
      fat,
      fiber,
      sugar,
      sodium,
      useGrams,
      customGrams,
    } as any);
  };

  return (
    <OverlayPortal><div className="overlay-fullscreen z-[60] animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 safe-top pb-3 border-b border-border">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">{mealLabel}</p>
          <p className="text-sm font-semibold text-foreground">Add Food</p>
        </div>
        <Button size="sm" onClick={handleConfirm} disabled={logging} className="rounded-lg text-sm font-semibold px-5">
          {logging ? "Logging..." : "Log"}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-5">
        {/* Food name and brand */}
        <div className="pt-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-foreground">{food.name}</h2>
            {food.source === "usda" && (
              <ShieldCheck className="h-4 w-4 text-green-500 shrink-0" />
            )}
          </div>
          {food.brand && (
            <p className="text-sm text-muted-foreground mt-0.5">{food.brand}</p>
          )}
        </div>

        {/* Macro ring */}
        <div className="flex items-center gap-6">
          <div className="shrink-0">
            <svg width="120" height="120" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
              {/* Protein - green */}
              <circle cx="60" cy="60" r={radius} fill="none"
                stroke="hsl(142, 76%, 36%)" strokeWidth="8"
                strokeDasharray={`${proteinDash} ${circumference - proteinDash}`}
                strokeDashoffset="0"
                transform="rotate(-90 60 60)" strokeLinecap="round" />
              {/* Carbs - blue */}
              <circle cx="60" cy="60" r={radius} fill="none"
                stroke="hsl(217, 91%, 60%)" strokeWidth="8"
                strokeDasharray={`${carbsDash} ${circumference - carbsDash}`}
                strokeDashoffset={`${-proteinDash}`}
                transform="rotate(-90 60 60)" strokeLinecap="round" />
              {/* Fat - yellow */}
              <circle cx="60" cy="60" r={radius} fill="none"
                stroke="hsl(45, 93%, 47%)" strokeWidth="8"
                strokeDasharray={`${fatDash} ${circumference - fatDash}`}
                strokeDashoffset={`${-(proteinDash + carbsDash)}`}
                transform="rotate(-90 60 60)" strokeLinecap="round" />
              <text x="60" y="55" textAnchor="middle" className="fill-foreground text-2xl font-bold">{calories}</text>
              <text x="60" y="72" textAnchor="middle" className="fill-muted-foreground text-xs">cal</text>
            </svg>
          </div>

          <div className="flex-1 space-y-2">
            <MacroBar label="Protein" grams={protein} pct={proteinPct} color="bg-green-500" />
            <MacroBar label="Carbs" grams={carbs} pct={carbsPct} color="bg-blue-500" />
            <MacroBar label="Fat" grams={fat} pct={fatPct} color="bg-yellow-500" />
            {fiber > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Fiber</span>
                <span>{fiber}g</span>
              </div>
            )}
          </div>
        </div>

        {/* Serving size selector */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          {/* Serving / Grams toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Serving Size</span>
            <div className="flex rounded-lg overflow-hidden border border-border">
              <button
                onClick={() => setUseGrams(false)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  !useGrams ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                )}
              >
                Serving
              </button>
              <button
                onClick={() => setUseGrams(true)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  useGrams ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                )}
              >
                Grams
              </button>
            </div>
          </div>

          {!useGrams ? (
            <div className="relative">
              <button
                onClick={() => setShowServingDropdown(!showServingDropdown)}
                className="w-full flex items-center justify-between bg-secondary rounded-xl px-4 py-3"
              >
                <span className="text-sm text-foreground">{selectedServing.description}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{Math.round(selectedServing.size_g)}g</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
              {showServingDropdown && (
                <div className="absolute left-0 right-0 top-full mt-1 rounded-xl border border-border bg-card shadow-lg overflow-hidden z-10">
                  {servingOptions.map((option, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedServing(option);
                        setShowServingDropdown(false);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between px-4 py-3 text-sm transition-colors",
                        selectedServing.description === option.description
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-secondary"
                      )}
                    >
                      <span>{option.description}</span>
                      <span className="text-xs text-muted-foreground">{Math.round(option.size_g)}g</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-secondary rounded-xl px-4 py-3">
              <Input
                type="text"
                inputMode="decimal"
                value={customGramsStr}
                onChange={(e) => { userInteracted.current = true; setCustomGramsStr(e.target.value); }}
                onFocus={(e) => e.target.select()}
                placeholder="0"
                className="flex-1 bg-transparent border-0 text-sm text-foreground p-0 h-auto focus-visible:ring-0"
              />
              <span className="text-xs text-muted-foreground">g</span>
            </div>
          )}

          {/* Number of servings */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">Number of Servings</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuantityStr(String(Math.max(0.25, quantity - (quantity > 1 ? 1 : 0.25))))}
                className="text-primary text-lg font-bold w-7 h-7 flex items-center justify-center rounded-full hover:bg-primary/10 transition-colors"
              >−</button>
              <Input
                type="text"
                inputMode="decimal"
                value={quantityStr}
                onChange={(e) => { userInteracted.current = true; setQuantityStr(e.target.value); }}
                onFocus={(e) => e.target.select()}
                placeholder="0"
                className="w-14 bg-secondary border-0 text-sm text-center text-foreground rounded-lg h-8 focus-visible:ring-1 focus-visible:ring-primary/50"
              />
              <button
                onClick={() => setQuantityStr(String(quantity + (quantity >= 1 ? 1 : 0.25)))}
                className="text-primary text-lg font-bold w-7 h-7 flex items-center justify-center rounded-full hover:bg-primary/10 transition-colors"
              >+</button>
            </div>
          </div>

          {/* Total weight */}
          <div className="flex items-center justify-between text-sm text-muted-foreground border-t border-border pt-3">
            <span>Total weight</span>
            <span className="font-medium text-foreground">{Math.round(effectiveGrams)}g</span>
          </div>
        </div>

        {/* Meal display */}
        <div className="flex items-center justify-between rounded-xl bg-card border border-border px-4 py-3">
          <span className="text-sm text-muted-foreground">Meal</span>
          <span className="text-sm font-medium text-foreground">{mealLabel}</span>
        </div>

        {/* Bottom Log button — always reachable even when iOS keyboard pushes header off-screen */}
        <div className="pt-2 pb-4">
          <Button onClick={handleConfirm} className="w-full rounded-xl text-sm font-semibold py-3">
            Log Food
          </Button>
        </div>
      </div>
    </div></OverlayPortal>
  );
}

function MacroBar({ label, grams, pct, color }: { label: string; grams: number; pct: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-0.5">
        <div className="flex items-center gap-1.5">
          <div className={cn("w-2 h-2 rounded-full", color)} />
          <span className="text-foreground font-medium">{label}</span>
        </div>
        <span className="text-muted-foreground">{pct}% · {grams}g</span>
      </div>
    </div>
  );
}
