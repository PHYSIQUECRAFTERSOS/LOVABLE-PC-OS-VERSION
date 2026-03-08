import { useState, useEffect, useRef, useCallback } from "react";
import { BrowserMultiFormatReader, NotFoundException } from "@zxing/library";
import { supabase } from "@/integrations/supabase/client";
import imageCompression from "browser-image-compression";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ScanBarcode, Camera, Loader2, X, AlertTriangle, Sparkles, ChevronLeft,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MICRONUTRIENTS, NutrientInfo } from "@/lib/micronutrients";

interface SupplementScanFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuppAdded: () => void;
}

type FlowStep = "scan" | "photo" | "review";

interface ExtractedData {
  product_name?: string;
  serving_size?: string;
  serving_unit?: string;
  servings_per_container?: number;
  nutrients: Record<string, number>;
  confidence?: "high" | "medium" | "low";
}

const SERVING_UNITS = ["capsule", "tablet", "scoop", "ml", "drop", "serving", "softgel", "lozenge"];

const SupplementScanFlow = ({ open, onOpenChange, onSuppAdded }: SupplementScanFlowProps) => {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const isCoach = role === "coach" || role === "admin";

  const [step, setStep] = useState<FlowStep>("scan");
  const [scanning, setScanning] = useState(false);
  const [showPhotoFallback, setShowPhotoFallback] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");

  // Review form state
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [servingUnit, setServingUnit] = useState("capsule");
  const [servingsPerContainer, setServingsPerContainer] = useState("");
  const [nutrients, setNutrients] = useState<Record<string, string>>({});
  const [confidence, setConfidence] = useState<"high" | "medium" | "low" | null>(null);
  const [wasAiExtracted, setWasAiExtracted] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerId = "supp-scan-reader";

  const stopScanner = useCallback(async () => {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    if (scannerRef.current) {
      try {
        const s = scannerRef.current.getState();
        if (s === 2) await scannerRef.current.stop();
      } catch {}
      scannerRef.current = null;
    }
    setScanning(false);
  }, []);

  const startScanner = async () => {
    setScanning(true);
    setShowPhotoFallback(false);
    await new Promise((r) => setTimeout(r, 300));

    // Show photo fallback after 5 seconds
    fallbackTimerRef.current = setTimeout(() => {
      setShowPhotoFallback(true);
    }, 5000);

    try {
      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 120 }, aspectRatio: 1.5 },
        async (code) => {
          await stopScanner();
          lookupBarcode(code);
        },
        () => {}
      );
    } catch {
      setScanning(false);
      setShowPhotoFallback(true);
      toast({ title: "Camera access denied", description: "Try taking a photo instead.", variant: "destructive" });
    }
  };

  const lookupBarcode = async (barcode: string) => {
    setLookingUp(true);
    try {
      const { data, error } = await supabase.functions.invoke("barcode-lookup", { body: { barcode } });
      if (error) throw error;
      if (data?.found) {
        setName(data.name || "");
        setBrand(data.brand || "");
        setWasAiExtracted(false);
        setConfidence(null);
        setStep("review");
        toast({ title: "Product found!", description: data.name });
      } else {
        toast({ title: "Not found in database", description: "Try taking a photo of the label" });
        setStep("photo");
      }
    } catch {
      toast({ title: "Lookup failed", variant: "destructive" });
    } finally {
      setLookingUp(false);
    }
  };

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAnalyzing(true);
    const totalStart = performance.now();

    try {
      // Step 1: Compress image (target < 300KB, max 800px)
      const compressStart = performance.now();
      const compressed = await imageCompression(file, {
        maxWidthOrHeight: 800,
        maxSizeMB: 0.3,
        useWebWorker: true,
        fileType: "image/jpeg",
      });
      console.log("[SuppScan] Compressed:", file.size, "→", compressed.size, "bytes in", Math.round(performance.now() - compressStart), "ms");

      // Step 2: Convert to base64 data URL
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(compressed);
      });

      // Step 3: Call AI with 10s hard timeout
      const apiStart = performance.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const { data, error } = await supabase.functions.invoke("analyze-supplement-label", {
        body: { image: base64 },
      });

      clearTimeout(timeout);
      console.log("[SuppScan] API response in", Math.round(performance.now() - apiStart), "ms");
      console.log("[SuppScan] Total time:", Math.round(performance.now() - totalStart), "ms");

      if (error) throw error;

      if (data.error && !data.extracted) {
        toast({ title: data.error, description: "You can enter details manually.", variant: "destructive" });
        setWasAiExtracted(false);
        setStep("review");
        return;
      }

      const ext = data.extracted as ExtractedData;
      setName(ext.product_name || "");
      setServingUnit(ext.serving_unit || "capsule");
      setServingsPerContainer(ext.servings_per_container ? String(ext.servings_per_container) : "");
      setConfidence(ext.confidence || "medium");
      setWasAiExtracted(true);

      const nutMap: Record<string, string> = {};
      if (ext.nutrients) {
        Object.entries(ext.nutrients).forEach(([key, val]) => {
          if (val > 0) nutMap[key] = String(val);
        });
      }
      setNutrients(nutMap);
      setStep("review");
      toast({ title: "Label analyzed!", description: `${Object.keys(nutMap).length} nutrients detected` });
    } catch (err: any) {
      console.error("[SuppScan] Error:", err);
      const isTimeout = err.name === "AbortError" || (performance.now() - totalStart > 9500);
      toast({
        title: isTimeout ? "Analysis timed out" : "Analysis failed",
        description: isTimeout ? "Try again with better lighting." : (err.message || "Please try again"),
        variant: "destructive",
      });
      setWasAiExtracted(false);
      setStep("review");
    } finally {
      setAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!user || !name.trim()) return;
    setSaving(true);

    const suppData: any = {
      client_id: user.id,
      name: name.trim(),
      brand: brand.trim() || null,
      serving_unit: servingUnit,
      servings_per_container: servingsPerContainer ? parseInt(servingsPerContainer) : null,
      is_verified: false,
      is_coach_recommended: isCoach,
      coach_id: isCoach ? user.id : null,
      data_source: wasAiExtracted ? "ai_scan" : "manual",
    };

    MICRONUTRIENTS.forEach((n) => {
      const val = parseFloat(nutrients[n.key] || "0");
      if (val > 0) suppData[n.key] = val;
    });

    const { error } = await supabase.from("supplements").insert(suppData);
    setSaving(false);

    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Supplement added!" });
      resetAndClose();
      onSuppAdded();
    }
  };

  const resetAndClose = () => {
    stopScanner();
    setStep("scan");
    setName(""); setBrand(""); setNutrients({});
    setServingUnit("capsule"); setServingsPerContainer("");
    setManualBarcode(""); setConfidence(null);
    setWasAiExtracted(false); setShowPhotoFallback(false);
    onOpenChange(false);
  };

  useEffect(() => () => { stopScanner(); }, [stopScanner]);

  const nutrientCategories = [
    { label: "Vitamins", items: MICRONUTRIENTS.filter(n => n.category === "vitamin") },
    { label: "Minerals", items: MICRONUTRIENTS.filter(n => n.category === "mineral") },
    { label: "Fatty Acids", items: MICRONUTRIENTS.filter(n => n.category === "fatty_acid") },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose(); else onOpenChange(true); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            {step !== "scan" && (
              <Button variant="ghost" size="icon" className="h-7 w-7 mr-1" onClick={() => setStep(step === "review" ? "scan" : "scan")}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <ScanBarcode className="h-5 w-5 text-primary" />
            {step === "scan" ? "Scan Supplement" : step === "photo" ? "Photo Analysis" : "Review & Save"}
          </DialogTitle>
        </DialogHeader>

        {/* STEP 1: BARCODE SCAN */}
        {step === "scan" && (
          <div className="space-y-4">
            {scanning ? (
              <div className="space-y-3">
                <div id={containerId} className="w-full rounded-lg overflow-hidden bg-background" />
                <Button variant="outline" onClick={stopScanner} className="w-full gap-2">
                  <X className="h-4 w-4" /> Stop Scanner
                </Button>
                {showPhotoFallback && (
                  <button
                    onClick={() => { stopScanner(); setStep("photo"); }}
                    className="w-full flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Camera className="h-4 w-4" />
                    Not scanning? Take a picture instead
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <Button onClick={startScanner} className="w-full gap-2" disabled={lookingUp}>
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
                    onKeyDown={(e) => { if (e.key === "Enter" && manualBarcode.length >= 4) lookupBarcode(manualBarcode); }}
                    className="bg-secondary border-border"
                  />
                  <Button onClick={() => lookupBarcode(manualBarcode)} disabled={manualBarcode.length < 4 || lookingUp}>
                    {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : "Look Up"}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <Button variant="outline" onClick={() => setStep("photo")} className="w-full gap-2">
                  <Camera className="h-4 w-4" />
                  Take Photo of Label
                </Button>
              </div>
            )}

            {lookingUp && (
              <div className="flex items-center justify-center gap-2 py-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Looking up product...</span>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: PHOTO CAPTURE */}
        {step === "photo" && (
          <div className="space-y-4">
            {analyzing ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Analyzing label with AI...</p>
                <p className="text-xs text-muted-foreground">Usually completes in 5–10 seconds</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-8 text-center space-y-4">
                  <Camera className="h-10 w-10 mx-auto text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Take a photo of the Supplement Facts label</p>
                    <p className="text-xs text-muted-foreground mt-1">Make sure the text is clear and well-lit</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoCapture}
                    className="hidden"
                  />
                  <Button onClick={() => fileInputRef.current?.click()} className="gap-2">
                    <Camera className="h-4 w-4" />
                    Open Camera
                  </Button>
                </div>
                <Button variant="outline" onClick={() => setStep("review")} className="w-full text-sm text-muted-foreground">
                  Skip — enter manually
                </Button>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: REVIEW & EDIT */}
        {step === "review" && (
          <div className="space-y-4">
            {wasAiExtracted && (
              <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <Sparkles className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">AI-extracted — please verify values</p>
                  {confidence && (
                    <p className="text-[10px] text-muted-foreground">
                      Confidence: {confidence === "high" ? "High" : confidence === "medium" ? "Medium" : "Low — double check values"}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-foreground text-xs">Product Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-secondary border-border" placeholder="e.g. Magnesium Glycinate" />
              </div>
              <div>
                <Label className="text-foreground text-xs">Brand</Label>
                <Input value={brand} onChange={(e) => setBrand(e.target.value)} className="bg-secondary border-border" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-foreground text-xs">Serving Unit</Label>
                <Select value={servingUnit} onValueChange={setServingUnit}>
                  <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SERVING_UNITS.map((u) => (
                      <SelectItem key={u} value={u} className="capitalize">{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-foreground text-xs">Servings / Container</Label>
                <Input
                  type="number"
                  value={servingsPerContainer}
                  onChange={(e) => setServingsPerContainer(e.target.value)}
                  className="bg-secondary border-border"
                  placeholder="e.g. 60"
                />
              </div>
            </div>

            {/* Nutrient Fields */}
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground">Nutrient content per serving</Label>
              {nutrientCategories.map((cat) => (
                <div key={cat.label}>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{cat.label}</p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {cat.items.map((n) => (
                      <div key={n.key} className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0"
                          value={nutrients[n.key] || ""}
                          onChange={(e) => setNutrients((p) => ({ ...p, [n.key]: e.target.value }))}
                          className={`h-8 text-xs w-20 border-border ${
                            wasAiExtracted && nutrients[n.key] ? "bg-primary/5 border-primary/30" : "bg-secondary"
                          }`}
                        />
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-1 truncate" title={n.label}>
                          {n.label} ({n.unit})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <Button onClick={handleSave} disabled={!name.trim() || saving} className="w-full">
              {saving ? "Saving..." : "Save Supplement"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SupplementScanFlow;
