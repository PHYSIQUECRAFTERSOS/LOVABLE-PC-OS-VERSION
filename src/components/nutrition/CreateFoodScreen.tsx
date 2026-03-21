import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SERVING_UNIT_OPTIONS = [
  "g", "bar", "bottle", "unit", "cup", "ml", "oz", "scoop", "slice", "tsp", "tbsp",
] as const;

export interface ClientCustomFoodData {
  id?: string;
  name: string;
  brand?: string | null;
  serving_size?: string | null;
  serving_unit?: string | null;
  servings_per_container?: number | null;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  fiber?: number | null;
  sugar?: number | null;
  sodium?: number | null;
}

interface CreateFoodScreenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editFood?: ClientCustomFoodData | null;
}

const CreateFoodScreen = ({ open, onOpenChange, onSaved, editFood }: CreateFoodScreenProps) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [servingSize, setServingSize] = useState("100");
  const [servingUnit, setServingUnit] = useState("g");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [fiber, setFiber] = useState("");
  const [sugar, setSugar] = useState("");
  const [sodium, setSodium] = useState("");
  const [showMicros, setShowMicros] = useState(false);
  const [saving, setSaving] = useState(false);

  const isEditing = !!editFood?.id;

  useEffect(() => {
    if (editFood) {
      setName(editFood.name || "");
      setBrand(editFood.brand || "");
      // Parse serving_size - could be "240ml" or "240" or numeric
      const rawSS = String(editFood.serving_size ?? "100");
      const numMatch = rawSS.match(/^([\d.]+)/);
      setServingSize(numMatch ? numMatch[1] : "100");
      setServingUnit(editFood.serving_unit || "g");
      setCalories(editFood.calories ? String(editFood.calories) : "");
      setProtein(editFood.protein ? String(editFood.protein) : "");
      setCarbs(editFood.carbs ? String(editFood.carbs) : "");
      setFat(editFood.fat ? String(editFood.fat) : "");
      setFiber(editFood.fiber ? String(editFood.fiber) : "");
      setSugar(editFood.sugar ? String(editFood.sugar) : "");
      setSodium(editFood.sodium ? String(editFood.sodium) : "");
    } else {
      resetForm();
    }
  }, [editFood, open]);

  const resetForm = () => {
    setName(""); setBrand(""); setServingSize("100"); setServingUnit("g");
    setCalories(""); setProtein(""); setCarbs(""); setFat("");
    setFiber(""); setSugar(""); setSodium(""); setShowMicros(false);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!name.trim()) {
      toast({ title: "Food name is required", variant: "destructive" });
      return;
    }

    const ss = parseFloat(servingSize) || 0;
    if (ss <= 0) {
      toast({ title: "Serving size must be greater than 0", variant: "destructive" });
      return;
    }

    setSaving(true);

    const p = Math.max(0, parseFloat(protein) || 0);
    const c = Math.max(0, parseFloat(carbs) || 0);
    const f = Math.max(0, parseFloat(fat) || 0);
    const cal = parseFloat(calories) || Math.round(p * 4 + c * 4 + f * 9);

    const payload = {
      name: name.trim(),
      brand: brand.trim() || null,
      serving_size: String(ss),
      serving_unit: servingUnit,
      servings_per_container: 1,
      calories: cal,
      protein: p,
      carbs: c,
      fat: f,
      fiber: parseFloat(fiber) || 0,
      sugar: parseFloat(sugar) || 0,
      sodium: parseFloat(sodium) || 0,
    };

    try {
      if (isEditing) {
        const { error } = await supabase
          .from("client_custom_foods")
          .update(payload as any)
          .eq("id", editFood!.id!)
          .eq("client_id", user.id);

        if (error) throw error;
        toast({ title: `${name} updated!` });
      } else {
        const { error } = await supabase
          .from("client_custom_foods")
          .insert({ ...payload, client_id: user.id } as any);

        if (error) throw error;
        toast({ title: `${name} saved!` });
      }
      onSaved();
      onOpenChange(false);
      resetForm();
    } catch (err: any) {
      console.error("Save food error:", err);
      toast({ title: "Failed to save food", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Custom Food" : "Create Custom Food"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Food Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Homemade Granola" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Brand (optional)</Label>
              <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Kirkland" />
            </div>
            <div>
              <Label>Serving Size</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  value={servingSize}
                  onChange={(e) => setServingSize(e.target.value)}
                  className="flex-1"
                />
                <Select value={servingUnit} onValueChange={setServingUnit}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVING_UNIT_OPTIONS.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Calories</Label>
              <Input type="number" inputMode="decimal" value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="Auto from macros" />
            </div>
            <div>
              <Label>Protein (g)</Label>
              <Input type="number" inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} />
            </div>
            <div>
              <Label>Carbs (g)</Label>
              <Input type="number" inputMode="decimal" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
            </div>
            <div>
              <Label>Fat (g)</Label>
              <Input type="number" inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} />
            </div>
            <div>
              <Label>Fiber (g)</Label>
              <Input type="number" inputMode="decimal" value={fiber} onChange={(e) => setFiber(e.target.value)} />
            </div>
            <div>
              <Label>Sugar (g)</Label>
              <Input type="number" inputMode="decimal" value={sugar} onChange={(e) => setSugar(e.target.value)} />
            </div>
            <div>
              <Label>Sodium (mg)</Label>
              <Input type="number" inputMode="decimal" value={sodium} onChange={(e) => setSodium(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={showMicros} onCheckedChange={setShowMicros} />
            <Label className="text-sm">Advanced Micronutrients</Label>
          </div>

          {showMicros && (
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground mb-2">
                Micronutrients are tracked automatically when you log foods from the database. 
                Custom foods will use the macro values entered above.
              </p>
            </div>
          )}

          <Button onClick={handleSave} disabled={saving || !name.trim()} className="w-full">
            {saving ? "Saving..." : isEditing ? "Update Food" : "Save to Database"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateFoodScreen;
