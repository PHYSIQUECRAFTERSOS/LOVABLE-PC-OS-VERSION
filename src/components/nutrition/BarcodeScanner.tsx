import { useState, useEffect, useRef, useCallback } from "react";
import { BrowserMultiFormatReader, NotFoundException } from "@zxing/library";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScanBarcode, Loader2, X, AlertTriangle, Minus, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getFoodEmoji } from "@/utils/foodEmoji";
import { lookupBarcode as lookupBarcodeService, type BarcodeProduct } from "@/utils/barcodeService";
import { useLoggingStreak, getMilestoneMessage, STREAK_MILESTONES } from "@/hooks/useLoggingStreak";
import { cn } from "@/lib/utils";

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "pre-workout", "post-workout"];

interface BarcodeScannerProps {
  onLogged: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const BarcodeScanner = ({ onLogged, open: controlledOpen, onOpenChange }: BarcodeScannerProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { refresh: refreshStreak } = useLoggingStreak();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (onOpenChange) onOpenChange(v);
    else setInternalOpen(v);
  };
  const [scanning, setScanning] = useState(false);
  const [looking, setLooking] = useState(false);
  const [product, setProduct] = useState<BarcodeProduct | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [notFoundBarcode, setNotFoundBarcode] = useState("");
  const [servingSize, setServingSize] = useState("100");
  const [numServings, setNumServings] = useState(1);
  const [mealType, setMealType] = useState("snack");
  const [logging, setLogging] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");
  const [macroEntryMode, setMacroEntryMode] = useState<"auto" | "manual">("auto");
  const [manualCal, setManualCal] = useState("");
  const [manualProtein, setManualProtein] = useState("");
  const [manualCarbs, setManualCarbs] = useState("");
  const [manualFat, setManualFat] = useState("");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = "barcode-reader";

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state === 2) await scannerRef.current.stop();
      } catch { /* ignore */ }
      scannerRef.current = null;
    }
    setScanning(false);
  }, []);

  const handleBarcodeLookup = async (barcode: string) => {
    console.log('[BARCODE] Looking up barcode:', barcode);
    setLooking(true);
    setNotFound(false);
    setProduct(null);
    setMacroEntryMode("auto");

    try {
      const result = await lookupBarcodeService(barcode);
      console.log('[BARCODE] Lookup result:', result ? result.name : 'not found');

      if (result) {
        setProduct(result);
        setServingSize(String(result.serving_size));
        setNumServings(1);
        if (!result.has_macros) {
          setMacroEntryMode("manual");
        }
      } else {
        setNotFound(true);
        setNotFoundBarcode(barcode);
      }
    } catch (err) {
      console.error('[BARCODE] Lookup error:', err);
      setNotFound(true);
      setNotFoundBarcode(barcode);
      toast({ title: "Barcode lookup failed", description: "Could not look up product. Check your connection.", variant: "destructive" });
    } finally {
      setLooking(false);
    }
  };

  const startScanner = async () => {
    setScanning(true);
    setProduct(null);
    setNotFound(false);
    await new Promise((r) => setTimeout(r, 300));
    try {
      const scanner = new Html5Qrcode(scannerContainerId);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 15, qrbox: { width: 300, height: 150 }, aspectRatio: 1.7778 },
        async (decodedText) => {
          await stopScanner();
          handleBarcodeLookup(decodedText);
        },
        () => {}
      );
    } catch {
      setScanning(false);
      toast({ title: "Camera access denied", description: "Please allow camera access to scan barcodes.", variant: "destructive" });
    }
  };

  useEffect(() => { return () => { stopScanner(); }; }, [stopScanner]);

  const handleClose = async (v: boolean) => {
    if (!v) {
      await stopScanner();
      setProduct(null);
      setNotFound(false);
      setServingSize("100");
      setNumServings(1);
      setMealType("snack");
      setManualBarcode("");
      setMacroEntryMode("auto");
      setManualCal(""); setManualProtein(""); setManualCarbs(""); setManualFat("");
    }
    setOpen(v);
  };

  const calculateNutrition = () => {
    if (!product) return null;
    if (macroEntryMode === "manual") {
      const sv = parseFloat(servingSize) || 100;
      return {
        calories: Math.round((parseFloat(manualCal) || 0) * numServings),
        protein: Math.round((parseFloat(manualProtein) || 0) * numServings * 10) / 10,
        carbs: Math.round((parseFloat(manualCarbs) || 0) * numServings * 10) / 10,
        fat: Math.round((parseFloat(manualFat) || 0) * numServings * 10) / 10,
        totalGrams: sv * numServings,
      };
    }
    const sv = parseFloat(servingSize) || 100;
    const totalGrams = sv * numServings;
    const mult = totalGrams / 100;
    return {
      calories: Math.round((product.calories_per_100g ?? 0) * mult),
      protein: Math.round((product.protein_per_100g ?? 0) * mult * 10) / 10,
      carbs: Math.round((product.carbs_per_100g ?? 0) * mult * 10) / 10,
      fat: Math.round((product.fat_per_100g ?? 0) * mult * 10) / 10,
      totalGrams,
    };
  };

  const perServingNutrition = () => {
    if (!product || !product.has_macros) return null;
    const sv = parseFloat(servingSize) || 100;
    const mult = sv / 100;
    return {
      calories: Math.round((product.calories_per_100g ?? 0) * mult),
      protein: Math.round((product.protein_per_100g ?? 0) * mult * 10) / 10,
      carbs: Math.round((product.carbs_per_100g ?? 0) * mult * 10) / 10,
      fat: Math.round((product.fat_per_100g ?? 0) * mult * 10) / 10,
    };
  };

  const per100gNutrition = () => {
    if (!product || !product.has_macros) return null;
    return {
      calories: product.calories_per_100g ?? 0,
      protein: product.protein_per_100g ?? 0,
      carbs: product.carbs_per_100g ?? 0,
      fat: product.fat_per_100g ?? 0,
    };
  };

  const handleLog = async () => {
    if (!user || !product) return;
    const nutrition = calculateNutrition();
    if (!nutrition) return;
    setLogging(true);

    // Cache scanned food in food_items
    const { data: existing } = await supabase
      .from("food_items")
      .select("id")
      .eq("name", product.name)
      .limit(1);

    let foodItemId: string | null = null;
    if (existing && existing.length > 0) {
      foodItemId = existing[0].id;
    } else {
      const per100 = macroEntryMode === "manual"
        ? {
            calories: Math.round((parseFloat(manualCal) || 0) / (parseFloat(servingSize) || 100) * 100),
            protein: Math.round((parseFloat(manualProtein) || 0) / (parseFloat(servingSize) || 100) * 100),
            carbs: Math.round((parseFloat(manualCarbs) || 0) / (parseFloat(servingSize) || 100) * 100),
            fat: Math.round((parseFloat(manualFat) || 0) / (parseFloat(servingSize) || 100) * 100),
          }
        : {
            calories: product.calories_per_100g ?? 0,
            protein: product.protein_per_100g ?? 0,
            carbs: product.carbs_per_100g ?? 0,
            fat: product.fat_per_100g ?? 0,
          };

      const { data: newItem } = await supabase
        .from("food_items")
        .insert({
          name: product.name,
          brand: product.brand,
          calories: per100.calories,
          protein: per100.protein,
          carbs: per100.carbs,
          fat: per100.fat,
          serving_size: parseFloat(servingSize) || 100,
          serving_unit: "g",
          serving_label: product.serving_label,
          data_source: product.source === "open_food_facts" ? "open_food_facts" : "barcode_scan",
          category: product.category,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (newItem) foodItemId = newItem.id;
    }

    const { getLocalDateString } = await import("@/utils/localDate");
    const { error } = await supabase.from("nutrition_logs").insert({
      client_id: user.id,
      food_item_id: foodItemId,
      custom_name: foodItemId ? null : product.name,
      meal_type: mealType,
      servings: numServings,
      calories: nutrition.calories,
      protein: Math.round(nutrition.protein),
      carbs: Math.round(nutrition.carbs),
      fat: Math.round(nutrition.fat),
      quantity_display: parseFloat(servingSize) * numServings,
      quantity_unit: "g",
      logged_at: getLocalDateString(),
      tz_corrected: true,
    });

    setLogging(false);

    if (error) {
      toast({ title: "Error logging food", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${product.name} logged!` });

      // Check streak milestone
      try {
        const { getLocalDateString } = await import("@/utils/localDate");
        const { data: streakData } = await supabase.rpc("get_logging_streak_v2" as any, { p_user_id: user.id, p_today: getLocalDateString() });
        const newStreak = streakData as unknown as number;
        const msg = getMilestoneMessage(newStreak);
        if (msg) {
          setTimeout(() => {
            toast({ title: `🔥 ${newStreak} day streak!`, description: msg });
          }, 1500);
        }
        refreshStreak();
      } catch { /* ignore */ }

      handleClose(false);
      onLogged();
    }
  };

  const nutrition = calculateNutrition();
  const perServing = perServingNutrition();
  const per100g = per100gNutrition();

  useEffect(() => {
    if (open && !scanning && !product && !notFound && !looking) {
      startScanner();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      {controlledOpen === undefined && (
        <DialogTrigger asChild>
          <Button variant="outline" className="gap-2">
            <ScanBarcode className="h-4 w-4" /> Scan Barcode
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanBarcode className="h-5 w-5" />
            Barcode Scanner
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Scanner view */}
          {!product && !notFound && (
            <>
              {scanning ? (
                <div className="space-y-3">
                  <div id={scannerContainerId} className="w-full rounded-lg overflow-hidden bg-black" />
                  <Button variant="outline" onClick={stopScanner} className="w-full gap-2">
                    <X className="h-4 w-4" /> Stop Scanner
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Button onClick={startScanner} className="w-full gap-2">
                    <ScanBarcode className="h-4 w-4" /> Start Camera Scanner
                  </Button>
                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs text-muted-foreground">or enter manually</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter barcode number"
                      value={manualBarcode}
                      onChange={(e) => setManualBarcode(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && manualBarcode.length >= 4) handleBarcodeLookup(manualBarcode); }}
                    />
                    <Button onClick={() => handleBarcodeLookup(manualBarcode)} disabled={manualBarcode.length < 4 || looking}>
                      {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Look Up"}
                    </Button>
                  </div>
                </div>
              )}
              {looking && (
                <div className="flex items-center justify-center gap-2 py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Looking up product...</span>
                </div>
              )}
            </>
          )}

          {/* Not found */}
          {notFound && (
            <div className="space-y-3 text-center py-4">
              <AlertTriangle className="h-8 w-8 mx-auto text-yellow-500" />
              <p className="text-sm text-foreground font-medium">Product not found</p>
              <p className="text-xs text-muted-foreground">
                We couldn't find barcode {notFoundBarcode} in our database.
              </p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" size="sm" onClick={() => { setNotFound(false); setManualBarcode(notFoundBarcode); }}>
                  Search Manually
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setNotFound(false); setManualBarcode(""); }}>
                  Scan Again
                </Button>
              </div>
            </div>
          )}

          {/* Product found */}
          {product && nutrition && (
            <div className="space-y-4">
              {/* Product header with emoji */}
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center text-2xl shrink-0">
                    {getFoodEmoji({ name: product.name, category: product.category || undefined })}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground">{product.name}</h3>
                    {product.brand && <p className="text-xs text-muted-foreground">{product.brand}</p>}
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                      Scanned via {product.source === "open_food_facts" ? "Open Food Facts" : "UPC Item DB"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Macros missing alert for UPC Item DB */}
              {!product.has_macros && macroEntryMode === "auto" && (
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 space-y-2">
                  <p className="text-sm text-foreground font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    Nutrition data not available
                  </p>
                  <p className="text-xs text-muted-foreground">
                    We found "{product.name}"{product.brand ? ` by ${product.brand}` : ""} but macro data isn't available. Enter the nutrition facts from the package.
                  </p>
                  <button onClick={() => setMacroEntryMode("manual")} className="text-primary text-sm underline">
                    Enter macros manually →
                  </button>
                </div>
              )}

              {/* Manual macro entry */}
              {macroEntryMode === "manual" && (
                <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Enter per serving</h4>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <Label className="text-[10px]">Cal</Label>
                      <Input type="number" value={manualCal} onChange={(e) => setManualCal(e.target.value)} className="h-8 text-sm text-center" placeholder="0" />
                    </div>
                    <div>
                      <Label className="text-[10px]">Protein</Label>
                      <Input type="number" value={manualProtein} onChange={(e) => setManualProtein(e.target.value)} className="h-8 text-sm text-center" placeholder="0" />
                    </div>
                    <div>
                      <Label className="text-[10px]">Carbs</Label>
                      <Input type="number" value={manualCarbs} onChange={(e) => setManualCarbs(e.target.value)} className="h-8 text-sm text-center" placeholder="0" />
                    </div>
                    <div>
                      <Label className="text-[10px]">Fat</Label>
                      <Input type="number" value={manualFat} onChange={(e) => setManualFat(e.target.value)} className="h-8 text-sm text-center" placeholder="0" />
                    </div>
                  </div>
                </div>
              )}

              {/* Serving size controls */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <Label className="text-xs">Serving size (g)</Label>
                    <Input
                      type="number"
                      min="1"
                      value={servingSize}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setServingSize(e.target.value)}
                      className="h-9"
                    />
                    {product.serving_label && product.serving_label !== `${servingSize}g` && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {product.serving_label}
                      </p>
                    )}
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs">Number of servings</Label>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() => setNumServings(Math.max(0.25, numServings - 0.25))}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Input
                        type="number"
                        min="0.25"
                        step="0.25"
                        value={numServings}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setNumServings(parseFloat(e.target.value) || 1)}
                        className="h-9 text-center flex-1"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() => setNumServings(Math.min(20, numServings + 0.25))}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Meal Type</Label>
                  <Select value={mealType} onValueChange={setMealType}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MEAL_TYPES.map((m) => (
                        <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Primary macros display */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="rounded-lg bg-primary/10 p-2">
                  <div className="text-lg font-bold text-foreground">{nutrition.calories}</div>
                  <div className="text-[10px] text-muted-foreground">cal</div>
                </div>
                <div className="rounded-lg bg-red-500/10 p-2">
                  <div className="text-lg font-bold text-red-400">{nutrition.protein}g</div>
                  <div className="text-[10px] text-muted-foreground">Protein</div>
                </div>
                <div className="rounded-lg bg-blue-500/10 p-2">
                  <div className="text-lg font-bold text-blue-400">{nutrition.carbs}g</div>
                  <div className="text-[10px] text-muted-foreground">Carbs</div>
                </div>
                <div className="rounded-lg bg-yellow-500/10 p-2">
                  <div className="text-lg font-bold text-yellow-400">{nutrition.fat}g</div>
                  <div className="text-[10px] text-muted-foreground">Fat</div>
                </div>
              </div>

              {/* Per-serving vs per-100g comparison */}
              {product.has_macros && perServing && per100g && (
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div />
                    <div className="text-center font-semibold text-foreground">Per serving ({servingSize}g)</div>
                    <div className="text-center text-muted-foreground">Per 100g</div>

                    <div className="text-muted-foreground">Calories</div>
                    <div className="text-center font-medium text-foreground">{perServing.calories}</div>
                    <div className="text-center text-muted-foreground">{per100g.calories}</div>

                    <div className="text-muted-foreground">Protein</div>
                    <div className="text-center font-medium text-foreground">{perServing.protein}g</div>
                    <div className="text-center text-muted-foreground">{per100g.protein}g</div>

                    <div className="text-muted-foreground">Carbs</div>
                    <div className="text-center font-medium text-foreground">{perServing.carbs}g</div>
                    <div className="text-center text-muted-foreground">{per100g.carbs}g</div>

                    <div className="text-muted-foreground">Fat</div>
                    <div className="text-center font-medium text-foreground">{perServing.fat}g</div>
                    <div className="text-center text-muted-foreground">{per100g.fat}g</div>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setProduct(null); setManualBarcode(""); setMacroEntryMode("auto"); }} className="flex-1">
                  Scan Another
                </Button>
                <Button onClick={handleLog} disabled={logging} className="flex-1">
                  {logging ? "Logging..." : `Add to ${mealType}`}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BarcodeScanner;
