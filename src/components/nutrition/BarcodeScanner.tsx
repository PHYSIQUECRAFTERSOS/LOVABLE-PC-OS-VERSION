import { useState, useEffect, useRef, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
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
import { ScanBarcode, Loader2, X, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface NutritionData {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
}

interface ScannedProduct {
  found: boolean;
  barcode: string;
  name: string;
  brand: string | null;
  serving_size: string;
  serving_quantity: number;
  per_100g: NutritionData;
  per_serving: NutritionData;
}

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "pre-workout", "post-workout"];

interface BarcodeScannerProps {
  onLogged: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const BarcodeScanner = ({ onLogged, open: controlledOpen, onOpenChange }: BarcodeScannerProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (onOpenChange) onOpenChange(v);
    else setInternalOpen(v);
  };
  const [scanning, setScanning] = useState(false);
  const [looking, setLooking] = useState(false);
  const [product, setProduct] = useState<ScannedProduct | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [grams, setGrams] = useState("100");
  const [mealType, setMealType] = useState("snack");
  const [logging, setLogging] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = "barcode-reader";

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state === 2) { // SCANNING
          await scannerRef.current.stop();
        }
      } catch {
        // ignore
      }
      scannerRef.current = null;
    }
    setScanning(false);
  }, []);

  const lookupBarcode = async (barcode: string) => {
    setLooking(true);
    setNotFound(false);
    setProduct(null);

    try {
      const { data, error } = await supabase.functions.invoke("barcode-lookup", {
        body: { barcode },
      });

      if (error) throw error;

      if (data.found) {
        setProduct(data as ScannedProduct);
        // Set default grams to serving quantity if available
        if (data.serving_quantity && data.serving_quantity !== 100) {
          setGrams(String(data.serving_quantity));
        }
      } else {
        setNotFound(true);
      }
    } catch (e: any) {
      toast({
        title: "Lookup failed",
        description: e.message || "Could not look up barcode",
        variant: "destructive",
      });
    } finally {
      setLooking(false);
    }
  };

  const startScanner = async () => {
    setScanning(true);
    setProduct(null);
    setNotFound(false);

    // Small delay to let the DOM render
    await new Promise((r) => setTimeout(r, 300));

    try {
      const scanner = new Html5Qrcode(scannerContainerId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 15,
          qrbox: { width: 300, height: 150 },
          aspectRatio: 1.7778,
        },
        async (decodedText) => {
          await stopScanner();
          lookupBarcode(decodedText);
        },
        () => {
          // ignore scan failures (continuous scanning)
        }
      );
    } catch (err: any) {
      setScanning(false);
      toast({
        title: "Camera access denied",
        description: "Please allow camera access to scan barcodes.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  const handleClose = async (v: boolean) => {
    if (!v) {
      await stopScanner();
      setProduct(null);
      setNotFound(false);
      setGrams("100");
      setMealType("snack");
      setManualBarcode("");
    }
    setOpen(v);
  };

  const calculateNutrition = (): NutritionData | null => {
    if (!product) return null;
    const g = parseFloat(grams) || 100;
    const multiplier = g / 100;
    const base = product.per_100g;
    return {
      calories: Math.round(base.calories * multiplier),
      protein: Math.round(base.protein * multiplier * 10) / 10,
      carbs: Math.round(base.carbs * multiplier * 10) / 10,
      fat: Math.round(base.fat * multiplier * 10) / 10,
      fiber: Math.round(base.fiber * multiplier * 10) / 10,
      sugar: Math.round(base.sugar * multiplier * 10) / 10,
      sodium: Math.round(base.sodium * multiplier * 10) / 10,
    };
  };

  const handleLog = async () => {
    if (!user || !product) return;
    const nutrition = calculateNutrition();
    if (!nutrition) return;

    setLogging(true);

    // First, save to food_items if not already there
    const { data: existing } = await supabase
      .from("food_items")
      .select("id")
      .eq("name", product.name)
      .limit(1);

    let foodItemId: string | null = null;

    if (existing && existing.length > 0) {
      foodItemId = existing[0].id;
    } else {
      const { data: newItem } = await supabase
        .from("food_items")
        .insert({
          name: product.name,
          brand: product.brand,
          calories: product.per_100g.calories,
          protein: product.per_100g.protein,
          carbs: product.per_100g.carbs,
          fat: product.per_100g.fat,
          fiber: product.per_100g.fiber,
          serving_size: 100,
          serving_unit: "g",
          created_by: user.id,
        })
        .select("id")
        .single();
      if (newItem) foodItemId = newItem.id;
    }

    const { error } = await supabase.from("nutrition_logs").insert({
      client_id: user.id,
      food_item_id: foodItemId,
      custom_name: foodItemId ? null : product.name,
      meal_type: mealType,
      servings: 1,
      calories: nutrition.calories,
      protein: Math.round(nutrition.protein),
      carbs: Math.round(nutrition.carbs),
      fat: Math.round(nutrition.fat),
    });

    setLogging(false);

    if (error) {
      toast({ title: "Error logging food", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${product.name} logged!` });
      handleClose(false);
      onLogged();
    }
  };

  const nutrition = calculateNutrition();

  // Auto-start scanner when dialog opens
  useEffect(() => {
    if (open && !scanning && !product && !notFound && !looking) {
      startScanner();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      {/* Only show trigger button when not externally controlled */}
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
                  <div
                    id={scannerContainerId}
                    className="w-full rounded-lg overflow-hidden bg-black"
                  />
                  <Button variant="outline" onClick={stopScanner} className="w-full gap-2">
                    <X className="h-4 w-4" /> Stop Scanner
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Button onClick={startScanner} className="w-full gap-2">
                    <ScanBarcode className="h-4 w-4" />
                    Start Camera Scanner
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
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && manualBarcode.length >= 4) {
                          lookupBarcode(manualBarcode);
                        }
                      }}
                    />
                    <Button
                      onClick={() => lookupBarcode(manualBarcode)}
                      disabled={manualBarcode.length < 4 || looking}
                    >
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
                This barcode isn't in the Open Food Facts database yet.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setNotFound(false);
                  setManualBarcode("");
                }}
              >
                Try Another
              </Button>
            </div>
          )}

          {/* Product found */}
          {product && nutrition && (
            <div className="space-y-4">
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-1">
                <h3 className="font-semibold text-foreground">{product.name}</h3>
                {product.brand && (
                  <p className="text-xs text-muted-foreground">{product.brand}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Serving: {product.serving_size}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Amount (grams)</Label>
                <Input
                  type="number"
                  min="1"
                  value={grams}
                  onChange={(e) => setGrams(e.target.value)}
                />
              </div>

              <div>
                <Label>Meal Type</Label>
                <Select value={mealType} onValueChange={setMealType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MEAL_TYPES.map((m) => (
                      <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Nutrition breakdown */}
              <div className="rounded-lg border border-border bg-card p-3">
                <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                  Nutrition for {grams}g
                </h4>
                <div className="grid grid-cols-4 gap-2 text-center text-xs mb-2">
                  <div>
                    <div className="text-lg font-bold text-foreground">{nutrition.calories}</div>
                    <div className="text-muted-foreground">Cal</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-red-400">{nutrition.protein}g</div>
                    <div className="text-muted-foreground">Protein</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-blue-400">{nutrition.carbs}g</div>
                    <div className="text-muted-foreground">Carbs</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-yellow-400">{nutrition.fat}g</div>
                    <div className="text-muted-foreground">Fat</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs border-t border-border pt-2">
                  <div>
                    <div className="font-medium text-foreground">{nutrition.fiber}g</div>
                    <div className="text-muted-foreground">Fiber</div>
                  </div>
                  <div>
                    <div className="font-medium text-foreground">{nutrition.sugar}g</div>
                    <div className="text-muted-foreground">Sugar</div>
                  </div>
                  <div>
                    <div className="font-medium text-foreground">{nutrition.sodium}mg</div>
                    <div className="text-muted-foreground">Sodium</div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setProduct(null);
                    setManualBarcode("");
                  }}
                  className="flex-1"
                >
                  Scan Another
                </Button>
                <Button onClick={handleLog} disabled={logging} className="flex-1">
                  {logging ? "Logging..." : "Log Food"}
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
