import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import imageCompression from "browser-image-compression";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Camera, ImagePlus, X, Loader2, AlertTriangle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const SERVING_UNIT_OPTIONS = [
  "g", "bar", "bottle", "unit", "cup", "ml", "oz", "scoop", "slice", "tsp", "tbsp",
] as const;

// Thresholds for suspicious values that trigger warnings
const SUSPICIOUS_THRESHOLDS: Record<string, number> = {
  calories: 2000,
  protein_g: 100,
  carbs_g: 300,
  fat_g: 150,
  fiber_g: 80,
  sugar_g: 200,
  sodium_mg: 5000,
};

interface ScanFoodLabelButtonProps {
  mealType: string;
  mealLabel: string;
  logDate?: string;
  onLogged: () => void;
  variant?: "icon" | "full" | "grid" | "headless";
  className?: string;
  /** External open control – when provided, the picker opens/closes via parent */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface ScanResult {
  food_name: string | null;
  brand: string | null;
  serving_size_value: number | null;
  serving_size_unit: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
}

const ScanFoodLabelButton = ({
  mealType,
  mealLabel,
  logDate,
  onLogged,
  variant = "full",
  className,
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
}: ScanFoodLabelButtonProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [internalShowPicker, setInternalShowPicker] = useState(false);
  // Use external control if provided, otherwise internal
  const showPicker = externalOpen !== undefined ? externalOpen : internalShowPicker;
  const setShowPicker = externalOnOpenChange || setInternalShowPicker;

  
  const [scanning, setScanning] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  // Form fields
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
  const [quantityConsumed, setQuantityConsumed] = useState("1");

  // Duplicate detection
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [showDuplicatePrompt, setShowDuplicatePrompt] = useState(false);

  const resetForm = () => {
    setName(""); setBrand(""); setServingSize("100"); setServingUnit("g");
    setCalories(""); setProtein(""); setCarbs(""); setFat("");
    setFiber(""); setSugar(""); setSodium(""); setQuantityConsumed("1");
    setScanResult(null); setDuplicateId(null);
  };

  const isSuspicious = (field: string, value: string): boolean => {
    const threshold = SUSPICIOUS_THRESHOLDS[field];
    if (!threshold) return false;
    const num = parseFloat(value);
    return !isNaN(num) && num > threshold;
  };

  const handleImageSelected = useCallback(async (file: File) => {
    setShowPicker(false);
    setScanning(true);

    try {
      // Compress image before converting to base64 (prevent timeouts on large camera photos)
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 800,
        useWebWorker: true,
        fileType: "image/jpeg",
      });

      // Convert to base64
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64Data = result.split(",")[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(compressed);
      });

      const mimeType = file.type || "image/jpeg";

      const { data, error } = await supabase.functions.invoke("scan-food-label", {
        body: { image_base64: base64, mime_type: mimeType },
      });

      if (error) throw error;

      if (data?.error === "no_label_detected" || data?.error === "api_error") {
        toast({
          title: "Couldn't read label",
          description: data.message || "Please try again with a clearer photo.",
          variant: "destructive",
        });
        setScanning(false);
        return;
      }

      const result: ScanResult = data?.data;
      if (!result) {
        toast({ title: "No data found", description: "Try a clearer photo of the nutrition label.", variant: "destructive" });
        setScanning(false);
        return;
      }

      // Pre-fill form
      setScanResult(result);
      setName(result.food_name || "");
      setBrand(result.brand || "");
      setServingSize(result.serving_size_value != null ? String(result.serving_size_value) : "100");
      setServingUnit(result.serving_size_unit || "g");
      setCalories(result.calories != null ? String(result.calories) : "");
      setProtein(result.protein_g != null ? String(result.protein_g) : "");
      setCarbs(result.carbs_g != null ? String(result.carbs_g) : "");
      setFat(result.fat_g != null ? String(result.fat_g) : "");
      setFiber(result.fiber_g != null ? String(result.fiber_g) : "");
      setSugar(result.sugar_g != null ? String(result.sugar_g) : "");
      setSodium(result.sodium_mg != null ? String(result.sodium_mg) : "");
      setQuantityConsumed("1");

      setScanning(false);
      setShowForm(true);
    } catch (err: any) {
      console.error("[ScanFoodLabel] Error:", err);
      toast({ title: "Unable to read label", description: "Please try again.", variant: "destructive" });
      setScanning(false);
    }
  }, [toast]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageSelected(file);
    // Reset input so same file can be selected again
    e.target.value = "";
  };

  const handleSave = async (updateExisting = false) => {
    if (!user) return;
    if (!name.trim()) {
      toast({ title: "Food name is required", variant: "destructive" });
      return;
    }

    setSaving(true);

    const ss = parseFloat(servingSize) || 100;
    const p = Math.max(0, parseFloat(protein) || 0);
    const c = Math.max(0, parseFloat(carbs) || 0);
    const f = Math.max(0, parseFloat(fat) || 0);
    const cal = parseFloat(calories) || Math.round(p * 4 + c * 4 + f * 9);
    const qty = Math.max(0.1, parseFloat(quantityConsumed) || 1);

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
      // Check for duplicates (only if not already handling one)
      if (!updateExisting && !showDuplicatePrompt) {
        const { data: existing } = await supabase
          .from("client_custom_foods")
          .select("id")
          .eq("client_id", user.id)
          .ilike("name", name.trim())
          .limit(1);

        if (existing && existing.length > 0) {
          setDuplicateId(existing[0].id);
          setShowDuplicatePrompt(true);
          setSaving(false);
          return;
        }
      }

      let savedFoodId: string;

      if (updateExisting && duplicateId) {
        // Update existing
        const { error } = await supabase
          .from("client_custom_foods")
          .update(payload as any)
          .eq("id", duplicateId)
          .eq("client_id", user.id);
        if (error) throw error;
        savedFoodId = duplicateId;
      } else {
        // Insert new
        const { data: inserted, error } = await supabase
          .from("client_custom_foods")
          .insert({ ...payload, client_id: user.id } as any)
          .select("id")
          .single();
        if (error) throw error;
        savedFoodId = inserted.id;
      }

      // Now log to nutrition_logs using quantity consumed
      const { getLocalDateString } = await import("@/utils/localDate");
      const effectiveDate = logDate || getLocalDateString();

      const logEntry = {
        client_id: user.id,
        custom_name: name.trim(),
        meal_type: mealType,
        servings: qty,
        calories: Math.round(cal * qty),
        protein: Math.round(p * qty),
        carbs: Math.round(c * qty),
        fat: Math.round(f * qty),
        quantity_display: ss * qty,
        quantity_unit: servingUnit,
        logged_at: effectiveDate,
        tz_corrected: true,
      };

      const { error: logError } = await supabase
        .from("nutrition_logs")
        .insert(logEntry as any);

      if (logError) throw logError;

      toast({ title: `${name} saved and added to ${mealLabel}` });
      setShowForm(false);
      setShowDuplicatePrompt(false);
      resetForm();
      onLogged();
    } catch (err: any) {
      console.error("[ScanFoodLabel] Save error:", err);
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const WarningBadge = ({ field, value }: { field: string; value: string }) => {
    if (!isSuspicious(field, value)) return null;
    return (
      <div className="flex items-center gap-1 mt-0.5">
        <AlertTriangle className="h-3 w-3 text-amber-500" />
        <span className="text-[10px] text-amber-500">Please verify this value</span>
      </div>
    );
  };

  // Hidden file inputs
  const fileInputs = (
    <>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </>
  );

  // Render the trigger button based on variant
  const triggerButton = variant === "grid" ? (
    <button
      onClick={() => setShowPicker(true)}
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 rounded-xl bg-card border border-border/50 py-3 px-2 hover:bg-secondary/50 transition-colors",
        className
      )}
    >
      <div className="relative">
        <Camera className="h-5 w-5 text-primary" />
        <Sparkles className="h-2.5 w-2.5 text-primary absolute -top-1 -right-1.5" />
      </div>
      <span className="text-[11px] font-medium text-foreground">Scan Label</span>
    </button>
  ) : variant === "icon" ? (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setShowPicker(true)}
      className={cn("relative", className)}
    >
      <Camera className="h-4 w-4" />
      <Sparkles className="h-2.5 w-2.5 text-primary absolute -top-0.5 -right-0.5" />
    </Button>
  ) : (
    <Button
      variant="outline"
      onClick={() => setShowPicker(true)}
      className={cn("h-11 border-primary text-primary hover:bg-primary/10", className)}
    >
      <Camera className="h-4 w-4 mr-2" />
      <Sparkles className="h-3 w-3 mr-1 text-primary" />
      Scan Food Label
    </Button>
  );

  return (
    <>
      {fileInputs}
      {variant !== "headless" && triggerButton}

      {/* Image source picker - z-[65] to sit above the food search overlay (z-[60]) */}
      <Drawer open={showPicker} onOpenChange={setShowPicker}>
        <DrawerContent className="pb-8 z-[65]">
          <DrawerHeader>
            <DrawerTitle>Scan Nutrition Label</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 space-y-3">
            <Button
              onClick={() => { cameraInputRef.current?.click(); setShowPicker(false); }}
              className="w-full h-12 text-base"
            >
              <Camera className="h-5 w-5 mr-3" /> Take Photo
            </Button>
            <Button
              variant="secondary"
              onClick={() => { fileInputRef.current?.click(); setShowPicker(false); }}
              className="w-full h-12 text-base"
            >
              <ImagePlus className="h-5 w-5 mr-3" /> Upload from Library
            </Button>
            <Button variant="ghost" onClick={() => setShowPicker(false)} className="w-full h-10">
              Cancel
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Loading overlay */}
      {scanning && (
        <div className="fixed inset-0 z-[70] bg-background/95 flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
          <p className="text-base font-medium text-foreground">Reading nutrition label…</p>
          <button
            onClick={() => setScanning(false)}
            className="text-sm text-muted-foreground hover:text-foreground underline mt-2"
          >
            Cancel and retake
          </button>
        </div>
      )}

      {/* Pre-filled form dialog */}
      <Dialog open={showForm} onOpenChange={(v) => { if (!v) { setShowForm(false); resetForm(); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Scanned Food Label
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Food Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Protein Bar" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Brand</Label>
                <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Quest" />
              </div>
              <div>
                <Label>Serving Size</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0.01"
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
                <WarningBadge field="calories" value={calories} />
              </div>
              <div>
                <Label>Protein (g)</Label>
                <Input type="number" inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} />
                <WarningBadge field="protein_g" value={protein} />
              </div>
              <div>
                <Label>Carbs (g)</Label>
                <Input type="number" inputMode="decimal" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
                <WarningBadge field="carbs_g" value={carbs} />
              </div>
              <div>
                <Label>Fat (g)</Label>
                <Input type="number" inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} />
                <WarningBadge field="fat_g" value={fat} />
              </div>
              <div>
                <Label>Fiber (g)</Label>
                <Input type="number" inputMode="decimal" value={fiber} onChange={(e) => setFiber(e.target.value)} />
                <WarningBadge field="fiber_g" value={fiber} />
              </div>
              <div>
                <Label>Sugar (g)</Label>
                <Input type="number" inputMode="decimal" value={sugar} onChange={(e) => setSugar(e.target.value)} />
                <WarningBadge field="sugar_g" value={sugar} />
              </div>
              <div>
                <Label>Sodium (mg)</Label>
                <Input type="number" inputMode="decimal" value={sodium} onChange={(e) => setSodium(e.target.value)} />
                <WarningBadge field="sodium_mg" value={sodium} />
              </div>
            </div>

            {/* Quantity consumed */}
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <Label className="text-sm font-medium">Quantity I consumed (servings)</Label>
              <Input
                type="number"
                inputMode="decimal"
                min="0.1"
                step="0.5"
                value={quantityConsumed}
                onChange={(e) => setQuantityConsumed(e.target.value)}
                className="mt-1.5 h-11 text-base font-medium"
              />
              {parseFloat(quantityConsumed) > 0 && parseFloat(calories) > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Total: {Math.round((parseFloat(calories) || 0) * (parseFloat(quantityConsumed) || 1))} cal ·{" "}
                  {Math.round((parseFloat(protein) || 0) * (parseFloat(quantityConsumed) || 1))}P ·{" "}
                  {Math.round((parseFloat(carbs) || 0) * (parseFloat(quantityConsumed) || 1))}C ·{" "}
                  {Math.round((parseFloat(fat) || 0) * (parseFloat(quantityConsumed) || 1))}F
                </p>
              )}
            </div>

            <Button
              onClick={() => handleSave(false)}
              disabled={saving || !name.trim()}
              className="w-full h-12 text-base"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {saving ? "Saving..." : "Save to My Foods + Add to Meal"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Duplicate detection prompt */}
      <Dialog open={showDuplicatePrompt} onOpenChange={setShowDuplicatePrompt}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Food Already Exists</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You already have <span className="font-medium text-foreground">"{name}"</span> saved.
            Would you like to update the existing entry or save as a new food?
          </p>
          <div className="flex gap-3 mt-4">
            <Button
              variant="secondary"
              onClick={() => { setShowDuplicatePrompt(false); handleSave(true); }}
              className="flex-1"
            >
              Update Existing
            </Button>
            <Button
              onClick={() => { setDuplicateId(null); setShowDuplicatePrompt(false); handleSave(false); }}
              className="flex-1"
            >
              Save as New
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ScanFoodLabelButton;
