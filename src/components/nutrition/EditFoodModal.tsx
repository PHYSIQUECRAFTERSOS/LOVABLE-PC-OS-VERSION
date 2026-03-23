import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface EditFoodModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  logEntry: {
    id: string;
    custom_name: string | null;
    food_item_id: string | null;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber?: number;
    sugar?: number;
    sodium?: number;
    servings: number;
    quantity_display?: number | null;
    quantity_unit?: string | null;
  } | null;
  foodName: string;
  onUpdated: () => void;
  onDeleteLog?: (id: string) => Promise<boolean>;
}

type Unit = "g" | "oz" | "serving";

const EditFoodModal = ({ open, onOpenChange, logEntry, foodName, onUpdated, onDeleteLog }: EditFoodModalProps) => {
  const { toast } = useToast();
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<Unit>("g");
  const [isCustom, setIsCustom] = useState(false);
  const [customUnit, setCustomUnit] = useState("serving");
  const [servingDescription, setServingDescription] = useState<string | null>(null);
  const [servingSizeG, setServingSizeG] = useState<number>(100);
  const [baseMacros, setBaseMacros] = useState<{
    calories: number; protein: number; carbs: number; fat: number;
    fiber: number; sugar: number; sodium: number; serving_size: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !logEntry) return;

    if (logEntry.food_item_id) {
      setIsCustom(false);
      supabase
        .from("food_items")
        .select("calories, protein, carbs, fat, fiber, sugar, sodium, serving_size, serving_unit, serving_description")
        .eq("id", logEntry.food_item_id)
        .single()
        .then(({ data }) => {
          if (data) {
            setBaseMacros({
              calories: data.calories,
              protein: data.protein,
              carbs: data.carbs,
              fat: data.fat,
              fiber: data.fiber || 0,
              sugar: data.sugar || 0,
              sodium: data.sodium || 0,
              serving_size: data.serving_size,
            });
            setServingDescription(data.serving_description || data.serving_unit || "serving");
            setServingSizeG(data.serving_size || 100);

            // Determine which unit to pre-select
            const logUnit = logEntry.quantity_unit;
            if (logUnit === "serving" || (!logUnit && logEntry.quantity_display == null)) {
              // Pre-select serving mode
              setUnit("serving");
              const servingCount = logEntry.quantity_display != null && logEntry.quantity_display > 0
                ? logEntry.quantity_display
                : logEntry.servings;
              setQuantity(String(Math.round(servingCount * 10) / 10));
            } else if (logUnit === "oz") {
              setUnit("oz");
              setQuantity(String(logEntry.quantity_display ?? Math.round(logEntry.servings * data.serving_size / 28.3495 * 10) / 10));
            } else {
              // Default to grams
              setUnit("g");
              if (logEntry.quantity_display != null && logEntry.quantity_display > 0) {
                setQuantity(String(logEntry.quantity_display));
              } else {
                const qty = Math.round(logEntry.servings * data.serving_size * 10) / 10;
                setQuantity(String(qty));
              }
            }
          }
        });
    } else {
      // Custom food — no food_items reference
      setIsCustom(true);
      const loggedServings = logEntry.servings || 1;

      const baseServingSize = (logEntry.quantity_display != null && logEntry.quantity_display > 0 && loggedServings > 0)
        ? logEntry.quantity_display / loggedServings
        : 1;

      setBaseMacros({
        calories: logEntry.calories / loggedServings,
        protein: logEntry.protein / loggedServings,
        carbs: logEntry.carbs / loggedServings,
        fat: logEntry.fat / loggedServings,
        fiber: (logEntry.fiber || 0) / loggedServings,
        sugar: (logEntry.sugar || 0) / loggedServings,
        sodium: (logEntry.sodium || 0) / loggedServings,
        serving_size: baseServingSize,
      });

      if (logEntry.quantity_display != null && logEntry.quantity_display > 0) {
        setQuantity(String(logEntry.quantity_display));
      } else {
        setQuantity(String(loggedServings));
      }
      setCustomUnit(logEntry.quantity_unit || "serving");
    }
  }, [open, logEntry]);

  const getMultiplier = () => {
    if (!baseMacros) return 0;
    const val = parseFloat(quantity) || 0;
    const ss = baseMacros.serving_size && baseMacros.serving_size > 0 ? baseMacros.serving_size : 1;
    if (isCustom) {
      return val / ss;
    }
    if (unit === "serving") {
      // Serving mode: quantity = number of servings, multiplier = quantity directly
      return val;
    }
    // Food items: convert to grams then divide by serving_size
    const qtyInG = unit === "oz" ? val * 28.3495 : val;
    return qtyInG / ss;
  };

  const multiplier = getMultiplier();
  const liveCalories = baseMacros ? Math.round(baseMacros.calories * multiplier) : 0;
  const liveProtein = baseMacros ? Math.round(baseMacros.protein * multiplier) : 0;
  const liveCarbs = baseMacros ? Math.round(baseMacros.carbs * multiplier) : 0;
  const liveFat = baseMacros ? Math.round(baseMacros.fat * multiplier) : 0;
  const liveFiber = baseMacros ? Math.round(baseMacros.fiber * multiplier) : 0;
  const liveSugar = baseMacros ? Math.round(baseMacros.sugar * multiplier) : 0;
  const liveSodium = baseMacros ? Math.round(baseMacros.sodium * multiplier) : 0;

  const handleSave = async () => {
    if (!logEntry) return;
    setSaving(true);
    const qtyDisplay = parseFloat(quantity) || 0;

    const { error } = await supabase
      .from("nutrition_logs")
      .update({
        servings: multiplier,
        calories: liveCalories,
        protein: liveProtein,
        carbs: liveCarbs,
        fat: liveFat,
        fiber: liveFiber,
        sugar: liveSugar,
        sodium: liveSodium,
        quantity_display: qtyDisplay,
        quantity_unit: isCustom ? customUnit : unit,
      })
      .eq("id", logEntry.id);
    setSaving(false);

    if (error) {
      console.error("[EditFood] Update error:", error);
      toast({ title: "Couldn't update. Please try again." });
    } else {
      toast({ title: "Updated" });
      onOpenChange(false);
      onUpdated();
    }
  };

  const handleRemove = async () => {
    if (!logEntry) return;

    if (onDeleteLog) {
      const success = await onDeleteLog(logEntry.id);
      if (!success) return;
      onOpenChange(false);
      onUpdated();
      return;
    }

    const { data: deletedRows, error } = await supabase
      .from("nutrition_logs")
      .delete()
      .eq("id", logEntry.id)
      .select("id");

    if (error) {
      console.error("[EditFood] Delete error:", error);
      toast({ title: "Couldn't remove item", description: error.message, variant: "destructive" });
      return;
    }

    if (!deletedRows || deletedRows.length === 0) {
      toast({ title: "Couldn't remove item", description: "No item was deleted.", variant: "destructive" });
      return;
    }

    toast({ title: "Removed" });
    onOpenChange(false);
    onUpdated();
  };

  // Format the unit label for custom foods
  const customUnitLabel = customUnit === "g" ? "g" : customUnit === "oz" ? "oz" : customUnit === "ml" ? "ml" : customUnit;

  // Build serving label for the "serving" button
  const servingLabel = servingDescription || "serving";

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="text-left">{foodName}</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6 space-y-4">
          {/* Quantity + Unit */}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label className="text-xs">
                {isCustom
                  ? `Quantity (${customUnitLabel})`
                  : unit === "serving"
                    ? `Servings (${servingLabel})`
                    : "Quantity"
                }
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={quantity}
                placeholder="0"
                onFocus={(e) => e.target.select()}
                onChange={(e) => setQuantity(e.target.value)}
                className="h-10 text-center text-lg font-semibold"
              />
            </div>
            {logEntry?.food_item_id && !isCustom && (
              <div className="flex rounded-lg overflow-hidden border border-border">
                {(["serving", "g", "oz"] as Unit[]).map((u) => (
                  <button
                    key={u}
                    onClick={() => {
                      const val = parseFloat(quantity) || 0;
                      const ss = servingSizeG || 100;
                      
                      if (u === unit) return;
                      
                      // Convert current quantity to new unit
                      let newVal = val;
                      if (unit === "g" && u === "oz") {
                        newVal = Math.round(val / 28.3495 * 10) / 10;
                      } else if (unit === "oz" && u === "g") {
                        newVal = Math.round(val * 28.3495 * 10) / 10;
                      } else if (unit === "g" && u === "serving") {
                        newVal = Math.round(val / ss * 10) / 10;
                      } else if (unit === "oz" && u === "serving") {
                        newVal = Math.round((val * 28.3495) / ss * 10) / 10;
                      } else if (unit === "serving" && u === "g") {
                        newVal = Math.round(val * ss * 10) / 10;
                      } else if (unit === "serving" && u === "oz") {
                        newVal = Math.round(val * ss / 28.3495 * 10) / 10;
                      }
                      
                      setQuantity(String(newVal));
                      setUnit(u);
                    }}
                    className={cn(
                      "px-3 py-2 text-xs font-medium transition-colors",
                      unit === u
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {u === "serving" ? servingLabel : u}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Live Macro Summary */}
          <div className="rounded-lg bg-secondary/50 p-3">
            <div className="flex justify-around text-center text-xs">
              <div><div className="font-bold text-foreground text-sm">{liveCalories}</div>cal</div>
              <div><div className="font-bold text-foreground text-sm">{liveProtein}g</div>Protein</div>
              <div><div className="font-bold text-foreground text-sm">{liveCarbs}g</div>Carbs</div>
              <div><div className="font-bold text-foreground text-sm">{liveFat}g</div>Fat</div>
            </div>
            <div className="flex justify-around text-center text-xs mt-2 text-muted-foreground">
              <span>Fiber: {liveFiber}g</span>
              <span>Sugar: {liveSugar}g</span>
              <span>Sodium: {liveSodium}mg</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 gap-2 text-destructive hover:text-destructive"
              onClick={handleRemove}
            >
              <Trash2 className="h-4 w-4" /> Remove
            </Button>
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "✓ Save"}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default EditFoodModal;
