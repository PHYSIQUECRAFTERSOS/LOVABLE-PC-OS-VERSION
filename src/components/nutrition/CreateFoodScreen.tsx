import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, UtensilsCrossed } from "lucide-react";

interface CreateFoodScreenProps {
  onClose: () => void;
  onSaved: () => void;
  editFood?: {
    id: string;
    name: string;
    brand?: string | null;
    serving_size?: string | null;
    servings_per_container?: number | null;
    calories?: number | null;
    protein?: number | null;
    carbs?: number | null;
    fat?: number | null;
    fiber?: number | null;
    sugar?: number | null;
    sodium?: number | null;
  } | null;
}

const CreateFoodScreen = ({ onClose, onSaved, editFood }: CreateFoodScreenProps) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [form, setForm] = useState({
    brand: editFood?.brand || "",
    name: editFood?.name || "",
    serving_size: editFood?.serving_size || "",
    servings_per_container: String(editFood?.servings_per_container ?? "1"),
    calories: editFood?.calories != null ? String(editFood.calories) : "",
    protein: editFood?.protein != null ? String(editFood.protein) : "",
    carbs: editFood?.carbs != null ? String(editFood.carbs) : "",
    fat: editFood?.fat != null ? String(editFood.fat) : "",
    fiber: editFood?.fiber != null ? String(editFood.fiber) : "",
    sugar: editFood?.sugar != null ? String(editFood.sugar) : "",
    sodium: editFood?.sodium != null ? String(editFood.sodium) : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const update = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!user) return;
    if (!form.name.trim()) { setError("Description is required"); return; }
    if (!form.serving_size.trim()) { setError("Serving size is required"); return; }
    if (!form.calories) { setError("Calories is required"); return; }

    setSaving(true);
    setError("");
    try {
      const { error: saveError } = await supabase
        .from("client_custom_foods")
        .insert({
          client_id: user.id,
          name: form.name.trim(),
          brand: form.brand.trim() || null,
          serving_size: form.serving_size.trim(),
          servings_per_container: parseFloat(form.servings_per_container) || 1,
          calories: parseFloat(form.calories) || 0,
          protein: parseFloat(form.protein) || 0,
          carbs: parseFloat(form.carbs) || 0,
          fat: parseFloat(form.fat) || 0,
        } as any);

      if (saveError) throw saveError;

      toast({ title: "Food saved!" });
      onSaved();
    } catch (err: any) {
      console.error("Save food error:", err);
      setError(err.message || "Failed to save food");
    } finally {
      setSaving(false);
    }
  };

  const infoFields = [
    { key: "brand", label: "Brand Name", sublabel: "Optional", placeholder: "ex. Campbell's", inputMode: "text" as const },
    { key: "name", label: "Description", sublabel: "Required", placeholder: "ex. Chicken Soup", inputMode: "text" as const },
    { key: "serving_size", label: "Serving Size", sublabel: "Required", placeholder: "ex. 1 cup", inputMode: "text" as const },
    { key: "servings_per_container", label: "Servings / container", sublabel: "Optional", placeholder: "1", inputMode: "decimal" as const },
  ];

  const nutritionFields = [
    { key: "calories", label: "Calories", unit: "" },
    { key: "protein", label: "Protein", unit: "g" },
    { key: "carbs", label: "Carbs", unit: "g" },
    { key: "fat", label: "Fat", unit: "g" },
    { key: "fiber", label: "Fiber", unit: "g" },
    { key: "sugar", label: "Sugar", unit: "g" },
    { key: "sodium", label: "Sodium", unit: "mg" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border">
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="flex-1 text-center text-base font-semibold text-foreground">Create Food</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-sm font-semibold text-primary disabled:text-muted-foreground"
        >
          {saving ? "..." : "Save"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-36">
        {/* Info fields */}
        <div className="divide-y divide-border/50">
          {infoFields.map(({ key, label, sublabel, placeholder, inputMode }) => (
            <div key={key} className="flex items-center justify-between px-4 py-3.5">
              <div>
                <div className="text-sm text-foreground">{label}</div>
                <div className="text-[10px] text-muted-foreground">{sublabel}</div>
              </div>
              <Input
                type="text"
                inputMode={inputMode}
                placeholder={placeholder}
                value={form[key as keyof typeof form]}
                onChange={(e) => update(key, e.target.value)}
                className="max-w-[180px] h-8 text-sm text-right bg-transparent border-0 focus-visible:ring-0 placeholder:text-muted-foreground"
              />
            </div>
          ))}
        </div>

        {/* Nutrition Facts */}
        <div className="px-4 py-2 bg-secondary/30 mt-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Nutrition Facts (per serving)</span>
        </div>
        <div className="divide-y divide-border/50">
          {nutritionFields.map(({ key, label, unit }) => (
            <div key={key} className="flex items-center justify-between px-4 py-3.5">
              <span className="text-sm text-foreground">{label}</span>
              <div className="flex items-center gap-1">
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={form[key as keyof typeof form]}
                  onChange={(e) => update(key, e.target.value)}
                  className="max-w-[80px] h-8 text-sm text-right bg-transparent border-0 focus-visible:ring-0"
                />
                {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
              </div>
            </div>
          ))}
        </div>

        {error && (
          <p className="text-sm text-destructive px-4 pt-3">{error}</p>
        )}

        {/* Save Button */}
        <div className="px-4 py-6">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-12 text-base font-bold rounded-xl"
          >
            <UtensilsCrossed className="h-5 w-5 mr-2" />
            {saving ? "Saving..." : "Save Food"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CreateFoodScreen;
