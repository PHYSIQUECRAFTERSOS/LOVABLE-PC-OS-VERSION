import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import imageCompression from "browser-image-compression";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Camera, Loader2, AlertTriangle, Sparkles, ChevronLeft, RotateCcw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MICRONUTRIENTS } from "@/lib/micronutrients";

interface SupplementScanFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuppAdded: () => void;
}

type FlowStep = "photo" | "review";

interface ExtractedData {
  product_name?: string;
  serving_size?: string;
  serving_size_qty?: number;
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

  const [step, setStep] = useState<FlowStep>("photo");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState("");
  const [saving, setSaving] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [capturedThumb, setCapturedThumb] = useState<string | null>(null);

  // Review form state
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [servingUnit, setServingUnit] = useState("capsule");
  const [servingSize, setServingSize] = useState("");
  const [nutrients, setNutrients] = useState<Record<string, string>>({});
  const [confidence, setConfidence] = useState<"high" | "medium" | "low" | null>(null);
  const [wasAiExtracted, setWasAiExtracted] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAnalyzing(true);
    setAnalysisError(null);
    setAnalyzeProgress("Compressing image...");

    try {
      const compressed = await imageCompression(file, {
        maxWidthOrHeight: 1200,
        maxSizeMB: 0.5,
        useWebWorker: true,
        fileType: "image/jpeg",
      });

      const thumbUrl = URL.createObjectURL(compressed);
      setCapturedThumb(thumbUrl);

      setAnalyzeProgress("Reading label...");
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(compressed);
      });

      const progressTimer = setTimeout(() => setAnalyzeProgress("Almost done..."), 8000);

      const { data, error } = await supabase.functions.invoke("analyze-supplement-label", {
        body: { image: base64 },
      });

      clearTimeout(progressTimer);

      if (error) throw error;

      if (data.error && !data.extracted) {
        setAnalysisError(data.error);
        setAnalyzing(false);
        return;
      }

      const ext = data.extracted as ExtractedData;
      setName(ext.product_name || "Unknown Supplement");
      setBrand("");
      setServingUnit(ext.serving_unit || "capsule");
      setConfidence(ext.confidence || "medium");
      setWasAiExtracted(true);

      // Extract numeric serving size from AI response
      let sizeQty = ext.serving_size_qty;
      if (!sizeQty && ext.serving_size) {
        const match = ext.serving_size.match(/(\d+)/);
        if (match) sizeQty = parseInt(match[1]);
      }
      setServingSize(sizeQty ? String(sizeQty) : "1");

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
      setAnalysisError(err.message || "Analysis failed. Please try again.");
    } finally {
      setAnalyzing(false);
      setAnalyzeProgress("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRetake = () => {
    setAnalysisError(null);
    setCapturedThumb(null);
    setTimeout(() => fileInputRef.current?.click(), 100);
  };

  const handleSave = async () => {
    if (!user || !name.trim()) return;
    setSaving(true);

    const parsedServingSize = servingSize ? parseInt(servingSize) : null;

    const suppData: any = {
      client_id: user.id,
      name: name.trim(),
      brand: brand.trim() || null,
      serving_unit: servingUnit,
      serving_size: parsedServingSize,
      servings_per_container: null,
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
    setStep("photo");
    setName(""); setBrand(""); setNutrients({});
    setServingUnit("capsule"); setServingSize("");
    setConfidence(null);
    setWasAiExtracted(false);
    setAnalysisError(null);
    setCapturedThumb(null);
    onOpenChange(false);
  };

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
            {step === "review" && (
              <Button variant="ghost" size="icon" className="h-7 w-7 mr-1" onClick={() => { setStep("photo"); setAnalysisError(null); }}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <Sparkles className="h-5 w-5 text-primary" />
            {step === "photo" ? "Take Photo of Label" : "Review & Save"}
          </DialogTitle>
        </DialogHeader>

        {/* STEP 1: PHOTO CAPTURE */}
        {step === "photo" && (
          <div className="space-y-4">
            {analyzing ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                {capturedThumb && (
                  <img src={capturedThumb} alt="Captured label" className="w-32 h-32 object-cover rounded-lg border border-border mb-2" />
                )}
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">{analyzeProgress || "Analyzing label with AI..."}</p>
                <p className="text-xs text-muted-foreground">This may take 10–20 seconds</p>
              </div>
            ) : analysisError ? (
              <div className="space-y-4">
                {capturedThumb && (
                  <img src={capturedThumb} alt="Captured label" className="w-full max-h-48 object-contain rounded-lg border border-border" />
                )}
                <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Could not read label</p>
                    <p className="text-xs text-muted-foreground mt-1">{analysisError}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleRetake} variant="outline" className="flex-1 gap-2">
                    <RotateCcw className="h-4 w-4" /> Retake Photo
                  </Button>
                  <Button onClick={() => { setAnalysisError(null); setName("Unknown Supplement"); setStep("review"); }} variant="outline" className="flex-1">
                    Enter Manually
                  </Button>
                </div>
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
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    onChange={handlePhotoCapture}
                    className="hidden"
                  />
                  <Button onClick={() => fileInputRef.current?.click()} className="gap-2">
                    <Camera className="h-4 w-4" />
                    Open Camera
                  </Button>
                </div>
                <Button variant="outline" onClick={() => { setName("Unknown Supplement"); setStep("review"); }} className="w-full text-sm text-muted-foreground">
                  Skip — enter manually
                </Button>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: REVIEW & EDIT */}
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
                <Label className="text-foreground text-xs">Serving Size</Label>
                <Input
                  type="number"
                  value={servingSize}
                  onChange={(e) => setServingSize(e.target.value)}
                  className="bg-secondary border-border"
                  placeholder="e.g. 8"
                />
                {servingSize && parseInt(servingSize) > 1 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {servingSize} {servingUnit}s per serving
                  </p>
                )}
              </div>
            </div>

            {/* Nutrient Fields */}
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground">
                Nutrient content per serving ({servingSize || "1"} {servingUnit}{parseInt(servingSize || "1") > 1 ? "s" : ""})
              </Label>
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
