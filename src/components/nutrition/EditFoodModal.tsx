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
  } | null;
  foodName: string;
  onUpdated: () => void;
}

type Unit = "g" | "oz";

const EditFoodModal = ({ open, onOpenChange, logEntry, foodName, onUpdated }: EditFoodModalProps) => {
  const { toast } = useToast();
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<Unit>("g");
  const [baseMacros, setBaseMacros] = useState<{
    calories: number; protein: number; carbs: number; fat: number;
    fiber: number; sugar: number; sodium: number; serving_size: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !logEntry) return;
    // Load base food macros if food_item_id exists
    if (logEntry.food_item_id) {
      supabase
        .from("food_items")
        .select("calories, protein, carbs, fat, fiber, sugar, sodium, serving_size, serving_unit")
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
            // Set initial quantity to current servings * serving_size
            const qty = Math.round(logEntry.servings * data.serving_size * 10) / 10;
            setQuantity(String(qty));
          }
        });
    } else {
      // Custom food — use logged values directly as base (1 serving)
      setBaseMacros({
        calories: logEntry.calories,
        protein: logEntry.protein,
        carbs: logEntry.carbs,
        fat: logEntry.fat,
        fiber: logEntry.fiber || 0,
        sugar: logEntry.sugar || 0,
        sodium: logEntry.sodium || 0,
        serving_size: 1,
      });
      setQuantity(String(logEntry.servings));
    }
    setUnit("g");
  }, [open, logEntry]);

  const getMultiplier = () => {
    if (!baseMacros) return 0;
    const val = parseFloat(quantity) || 0;
    if (!logEntry?.food_item_id) return val; // custom: servings multiplier
    const qtyInG = unit === "oz" ? val * 28.3495 : val;
    return qtyInG / baseMacros.serving_size;
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
    const { error } = await supabase
      .from("nutrition_logs")
      .update({
        servings: logEntry.food_item_id ? multiplier : parseFloat(quantity) || 1,
        calories: liveCalories,
        protein: liveProtein,
        carbs: liveCarbs,
        fat: liveFat,
        fiber: liveFiber,
        sugar: liveSugar,
        sodium: liveSodium,
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
    await supabase.from("nutrition_logs").delete().eq("id", logEntry.id);
    toast({ title: "Removed" });
    onOpenChange(false);
    onUpdated();
  };

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
              <Label className="text-xs">Quantity</Label>
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
            {logEntry?.food_item_id && (
              <div className="flex rounded-lg overflow-hidden border border-border">
                {(["g", "oz"] as Unit[]).map((u) => (
                  <button
                    key={u}
                    onClick={() => {
                      const val = parseFloat(quantity) || 0;
                      if (u === "oz" && unit === "g") {
                        setQuantity(String(Math.round(val / 28.3495 * 10) / 10));
                      } else if (u === "g" && unit === "oz") {
                        setQuantity(String(Math.round(val * 28.3495 * 10) / 10));
                      }
                      setUnit(u);
                    }}
                    className={cn(
                      "px-3 py-2 text-xs font-medium transition-colors",
                      unit === u
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {u}
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
