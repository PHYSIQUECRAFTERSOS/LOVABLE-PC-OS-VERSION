import { useState, useEffect } from "react";
import { useIOSOverlayRepaint, OverlayPortal } from "@/hooks/useIOSOverlayRepaint";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import { format, subDays } from "date-fns";

const MEAL_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  "pre-workout": "Pre-Workout Meal",
  "post-workout": "Post-Workout Meal",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
};

interface CopyPreviousMealSheetProps {
  mealType: string;
  mealLabel: string;
  logDate: string;
  onClose: () => void;
  onCopied: () => void;
}

const CopyPreviousMealSheet = ({ mealType, mealLabel, logDate, onClose, onCopied }: CopyPreviousMealSheetProps) => {
  useIOSOverlayRepaint();
  const { user } = useAuth();
  const { toast } = useToast();
  const [days, setDays] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [expandedSlot, setExpandedSlot] = useState<string | null>(null);
  const [slotItems, setSlotItems] = useState<any[]>([]);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    fetchPastDays();
  }, []);

  const fetchPastDays = async () => {
    if (!user) return;
    setLoading(true);

    const dates = Array.from({ length: 14 }, (_, i) =>
      format(subDays(new Date(logDate), i + 1), "yyyy-MM-dd")
    );

    const { data } = await supabase
      .from("nutrition_logs")
      .select("logged_at, meal_type")
      .eq("client_id", user.id)
      .in("logged_at", dates);

    if (!data || data.length === 0) {
      setDays([]);
      setLoading(false);
      return;
    }

    // Group by date
    const grouped: Record<string, Set<string>> = {};
    data.forEach((log: any) => {
      const date = log.logged_at;
      if (!grouped[date]) grouped[date] = new Set();
      grouped[date].add(log.meal_type);
    });

    const daysList = Object.entries(grouped)
      .map(([date, slots]) => ({ date, slots: Array.from(slots) }))
      .sort((a, b) => b.date.localeCompare(a.date));

    setDays(daysList);
    setLoading(false);
  };

  const loadSlotItems = async (date: string, slot: string) => {
    if (!user) return;
    const key = `${date}|${slot}`;
    if (expandedSlot === key) {
      setExpandedSlot(null);
      return;
    }

    const { data } = await supabase
      .from("nutrition_logs")
      .select("*")
      .eq("client_id", user.id)
      .eq("logged_at", date)
      .eq("meal_type", slot);

    setSlotItems(data || []);
    setExpandedSlot(key);
  };

  const copySlot = async (date: string, slot: string) => {
    if (!user) return;
    setCopying(true);

    // Fetch full source logs including micro data
    const { data: sourceWithMicros } = await supabase
      .from("nutrition_logs")
      .select("*")
      .eq("client_id", user.id)
      .eq("logged_at", date)
      .eq("meal_type", slot);

    if (!sourceWithMicros || sourceWithMicros.length === 0) {
      toast({ title: "No items to copy." });
      setCopying(false);
      return;
    }

    const microKeys = [
      "vitamin_a_mcg", "vitamin_c_mg", "vitamin_d_mcg", "vitamin_e_mg", "vitamin_k_mcg",
      "vitamin_b1_mg", "vitamin_b2_mg", "vitamin_b3_mg", "vitamin_b5_mg", "vitamin_b6_mg",
      "vitamin_b7_mcg", "vitamin_b9_mcg", "vitamin_b12_mcg",
      "calcium_mg", "iron_mg", "magnesium_mg", "phosphorus_mg", "potassium_mg",
      "zinc_mg", "copper_mg", "manganese_mg", "selenium_mcg", "chromium_mcg",
      "molybdenum_mcg", "iodine_mcg", "omega_3", "omega_6",
      "cholesterol", "saturated_fat", "trans_fat", "monounsaturated_fat", "polyunsaturated_fat",
      "added_sugars", "net_carbs",
    ];

    const entries = sourceWithMicros.map((item: any) => {
      const entry: Record<string, any> = {
        client_id: user.id,
        food_item_id: item.food_item_id,
        custom_name: item.custom_name,
        meal_type: mealType,
        servings: item.servings,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        fiber: item.fiber,
        sugar: item.sugar,
        sodium: item.sodium,
        quantity_display: item.quantity_display,
        quantity_unit: item.quantity_unit,
        logged_at: logDate,
        tz_corrected: true,
      };
      // Copy micro values from source log
      for (const key of microKeys) {
        if (item[key] != null && typeof item[key] === "number" && item[key] > 0) {
          entry[key] = item[key];
        }
      }
      return entry;
    });

    const { error } = await supabase.from("nutrition_logs").insert(entries as any);
    if (error) {
      toast({ title: "Couldn't copy meal." });
    } else {
      toast({ title: `Copied to ${mealLabel}` });
      onCopied();
    }
    setCopying(false);
  };

  const slotTotals = slotItems.reduce((acc, item) => ({
    calories: acc.calories + (item.calories || 0),
    protein: acc.protein + (item.protein || 0),
    carbs: acc.carbs + (item.carbs || 0),
    fat: acc.fat + (item.fat || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  return (
    <div className="fixed inset-0 z-[55] bg-background flex flex-col animate-fade-in" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)', height: '100dvh', overscrollBehaviorY: 'contain' }}>
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border">
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="text-base font-semibold text-foreground">Copy Previous Meal</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : days.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-12">No logged meals in the past 14 days.</p>
        ) : (
          <div className="space-y-2 py-3">
            {days.map(day => (
              <div key={day.date} className="rounded-xl border border-border/50 overflow-hidden">
                <button
                  onClick={() => setExpandedDay(expandedDay === day.date ? null : day.date)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors"
                >
                  <span className="text-sm font-medium text-foreground">
                    {format(new Date(day.date + "T12:00:00"), "EEE, MMM d")}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {day.slots.map((s: string) => MEAL_LABELS[s] || s).join(" · ")}
                    </span>
                    {expandedDay === day.date ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>

                {expandedDay === day.date && (
                  <div className="border-t border-border/30 px-4 pb-3 space-y-1.5">
                    {day.slots.map((slot: string) => {
                      const key = `${day.date}|${slot}`;
                      const isExpanded = expandedSlot === key;
                      return (
                        <div key={slot}>
                          <button
                            onClick={() => loadSlotItems(day.date, slot)}
                            className="w-full text-left py-2 text-sm text-primary hover:underline"
                          >
                            {MEAL_LABELS[slot] || slot}
                          </button>

                          {isExpanded && (
                            <div className="pl-3 space-y-1 mb-2">
                              {slotItems.map((item: any) => (
                                <div key={item.id} className="text-xs text-muted-foreground">
                                  {item.custom_name || "Food"} · {Math.round(item.calories)} cal
                                </div>
                              ))}
                              <div className="text-xs font-medium text-foreground mt-1">
                                Total: {Math.round(slotTotals.calories)} cal · {Math.round(slotTotals.protein)}P · {Math.round(slotTotals.carbs)}C · {Math.round(slotTotals.fat)}F
                              </div>
                              <Button
                                size="sm"
                                onClick={() => copySlot(day.date, slot)}
                                disabled={copying}
                                className="mt-2 h-8 text-xs bg-primary text-primary-foreground"
                              >
                                {copying ? "Copying..." : `Copy to ${mealLabel}`}
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CopyPreviousMealSheet;
