import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useToast } from "@/hooks/use-toast";

const SERVING_UNIT_OPTIONS = [
  "g", "bar", "bottle", "unit", "cup", "ml", "oz", "scoop", "slice", "tsp", "tbsp",
] as const;

export interface CustomFoodData {
  id?: string;
  name: string;
  brand?: string | null;
  serving_size?: number;
  serving_unit?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
}

interface CustomFoodCreatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (food: any) => void;
  editFood?: CustomFoodData | null;
}

const CustomFoodCreator = ({ open, onOpenChange, onCreated, editFood }: CustomFoodCreatorProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [servingSize, setServingSize] = useState("100");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [fiber, setFiber] = useState("");
  const [sugar, setSugar] = useState("");
  const [sodium, setSodium] = useState("");
  const [showMicros, setShowMicros] = useState(false);
  const [saving, setSaving] = useState(false);

  // Micro state
  const [vitA, setVitA] = useState("");
  const [vitC, setVitC] = useState("");
  const [vitD, setVitD] = useState("");
  const [calcium, setCalcium] = useState("");
  const [iron, setIron] = useState("");
  const [potassium, setPotassium] = useState("");

  const isEditing = !!editFood?.id;

  // Pre-fill when editing
  useEffect(() => {
    if (editFood) {
      setName(editFood.name || "");
      setBrand(editFood.brand || "");
      setServingSize(String(editFood.serving_size ?? 100));
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
  }, [editFood]);

  const resetForm = () => {
    setName(""); setBrand(""); setServingSize("100"); setCalories("");
    setProtein(""); setCarbs(""); setFat(""); setFiber(""); setSugar("");
    setSodium(""); setShowMicros(false);
    setVitA(""); setVitC(""); setVitD(""); setCalcium(""); setIron(""); setPotassium("");
  };

  const handleSave = async () => {
    if (!user || !name) return;
    setSaving(true);

    const ss = parseFloat(servingSize) || 100;
    const cal = parseFloat(calories) || 0;
    const p = parseFloat(protein) || 0;
    const c = parseFloat(carbs) || 0;
    const f = parseFloat(fat) || 0;

    const autoCalories = cal || Math.round(p * 4 + c * 4 + f * 9);

    const payload = {
      name,
      brand: brand || null,
      serving_size: ss,
      serving_unit: "g",
      calories: autoCalories,
      protein: p,
      carbs: c,
      fat: f,
      fiber: parseFloat(fiber) || 0,
      sugar: parseFloat(sugar) || 0,
      sodium: parseFloat(sodium) || 0,
      ...(showMicros && {
        vitamin_a_mcg: parseFloat(vitA) || 0,
        vitamin_c_mg: parseFloat(vitC) || 0,
        vitamin_d_mcg: parseFloat(vitD) || 0,
        calcium_mg: parseFloat(calcium) || 0,
        iron_mg: parseFloat(iron) || 0,
        potassium_mg: parseFloat(potassium) || 0,
      }),
    };

    if (isEditing) {
      const { data, error } = await supabase
        .from("food_items")
        .update(payload)
        .eq("id", editFood!.id!)
        .select("*")
        .single();

      setSaving(false);
      if (error) {
        toast({ title: "Error updating food", description: error.message, variant: "destructive" });
      } else {
        toast({ title: `${name} updated!` });
        onCreated(data);
        onOpenChange(false);
        resetForm();
      }
    } else {
      const { data, error } = await supabase
        .from("food_items")
        .insert({
          ...payload,
          created_by: user.id,
          data_source: "custom",
          is_verified: false,
        })
        .select("*")
        .single();

      setSaving(false);
      if (error) {
        toast({ title: "Error creating food", description: error.message, variant: "destructive" });
      } else {
        toast({ title: `${name} added to database!` });
        onCreated(data);
        onOpenChange(false);
        resetForm();
      }
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
              <Label>Serving Size (g)</Label>
              <Input type="number" value={servingSize} onChange={(e) => setServingSize(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Calories</Label>
              <Input type="number" value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="Auto from macros" />
            </div>
            <div>
              <Label>Protein (g)</Label>
              <Input type="number" value={protein} onChange={(e) => setProtein(e.target.value)} />
            </div>
            <div>
              <Label>Carbs (g)</Label>
              <Input type="number" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
            </div>
            <div>
              <Label>Fat (g)</Label>
              <Input type="number" value={fat} onChange={(e) => setFat(e.target.value)} />
            </div>
            <div>
              <Label>Fiber (g)</Label>
              <Input type="number" value={fiber} onChange={(e) => setFiber(e.target.value)} />
            </div>
            <div>
              <Label>Sugar (g)</Label>
              <Input type="number" value={sugar} onChange={(e) => setSugar(e.target.value)} />
            </div>
            <div>
              <Label>Sodium (mg)</Label>
              <Input type="number" value={sodium} onChange={(e) => setSodium(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={showMicros} onCheckedChange={setShowMicros} />
            <Label className="text-sm">Advanced Micronutrients</Label>
          </div>

          {showMicros && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3">
              <div><Label className="text-xs">Vitamin A (mcg)</Label><Input type="number" value={vitA} onChange={(e) => setVitA(e.target.value)} className="h-8" /></div>
              <div><Label className="text-xs">Vitamin C (mg)</Label><Input type="number" value={vitC} onChange={(e) => setVitC(e.target.value)} className="h-8" /></div>
              <div><Label className="text-xs">Vitamin D (mcg)</Label><Input type="number" value={vitD} onChange={(e) => setVitD(e.target.value)} className="h-8" /></div>
              <div><Label className="text-xs">Calcium (mg)</Label><Input type="number" value={calcium} onChange={(e) => setCalcium(e.target.value)} className="h-8" /></div>
              <div><Label className="text-xs">Iron (mg)</Label><Input type="number" value={iron} onChange={(e) => setIron(e.target.value)} className="h-8" /></div>
              <div><Label className="text-xs">Potassium (mg)</Label><Input type="number" value={potassium} onChange={(e) => setPotassium(e.target.value)} className="h-8" /></div>
            </div>
          )}

          <Button onClick={handleSave} disabled={saving || !name} className="w-full">
            {saving ? "Saving..." : isEditing ? "Update Food" : "Save to Database"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CustomFoodCreator;
