import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
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
import { Camera, Loader2, AlertTriangle, Plus, X } from "lucide-react";
import imageCompression from "browser-image-compression";

interface MealScanItem {
  name: string;
  portion: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface MealScanResult {
  items: MealScanItem[];
  confidence: string;
  notes?: string;
}

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "pre-workout", "post-workout"];

interface MealScanCaptureProps {
  open: boolean;
  onClose: () => void;
  mealType: string;
  logDate?: string;
  onLogged: () => void;
}

const MealScanCapture = ({ open, onClose, mealType, logDate, onLogged }: MealScanCaptureProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<MealScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedMealType, setSelectedMealType] = useState(mealType);
  const [logging, setLogging] = useState(false);

  const handleCapture = () => {
    console.log("[MealScan] Capture triggered");
    fileRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    console.log("[MealScan] File selected:", file.name, file.size, "bytes");
    setAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      // Compress image
      const startCompress = performance.now();
      const compressed = await imageCompression(file, {
        maxWidthOrHeight: 800,
        maxSizeMB: 0.5,
        useWebWorker: true,
        fileType: "image/jpeg",
      });
      console.log("[MealScan] Compressed in", Math.round(performance.now() - startCompress), "ms to", compressed.size, "bytes");

      // Preview
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(compressed);

      // Convert to base64
      const arrayBuffer = await compressed.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      // Call AI with 8s timeout
      const startApi = performance.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const { data, error: fnError } = await supabase.functions.invoke("meal-scan", {
        body: { image_base64: base64 },
      });

      clearTimeout(timeout);
      console.log("[MealScan] API response in", Math.round(performance.now() - startApi), "ms");

      if (fnError) throw fnError;

      if (!data?.items?.length) {
        setError("Could not detect food. Try again or add manually.");
      } else {
        setResult(data as MealScanResult);
      }
    } catch (err: any) {
      console.error("[MealScan] Error:", err);
      if (err.name === "AbortError") {
        setError("Request timed out. Try again or add manually.");
      } else {
        setError(err.message || "Could not detect food. Try again or add manually.");
      }
    } finally {
      setAnalyzing(false);
      // Reset file input
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const safeRound = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : 0;
  };

  const logAllItems = async () => {
    if (!user || !result?.items.length) return;
    setLogging(true);

    try {
      const { getLocalDateString } = await import("@/utils/localDate");
      // Use the parent's logDate if provided, otherwise fall back to local date
      const dateToLog = logDate || getLocalDateString();
      const VALID_MEAL_TYPES = ["breakfast", "pre-workout", "post-workout", "lunch", "dinner", "snack"];
      const safeMealType = VALID_MEAL_TYPES.includes(selectedMealType) ? selectedMealType : "snack";

      const inserts = result.items.map((item) => ({
        client_id: user.id,
        custom_name: `${item.name} (${item.portion})`.slice(0, 200),
        meal_type: safeMealType,
        servings: 1,
        calories: safeRound(item.calories),
        protein: safeRound(item.protein),
        carbs: safeRound(item.carbs),
        fat: safeRound(item.fat),
        logged_at: dateToLog,
        tz_corrected: true,
      }));

      console.log("[MealScan] Logging items to date:", dateToLog, "count:", inserts.length, inserts);
      const { data, error: logError } = await supabase.from("nutrition_logs").insert(inserts).select();
      if (logError) {
        console.error("[MealScan] Insert error:", logError);
        throw logError;
      }
      if (!data || data.length === 0) {
        console.error("[MealScan] Insert returned no data — possible RLS issue");
        throw new Error("Items were not saved. Please try logging in again.");
      }
      console.log("[MealScan] Successfully inserted", data.length, "rows");

      toast({ title: `${result.items.length} item(s) logged!` });
      handleReset();
      onLogged();
      onClose();
    } catch (err: any) {
      console.error("[MealScan] Log error:", err);
      toast({ title: "Error logging food", description: err.message, variant: "destructive" });
    } finally {
      setLogging(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    setPreview(null);
    setAnalyzing(false);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" /> AI Meal Scan
          </DialogTitle>
        </DialogHeader>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFile}
        />

        <div className="space-y-4">
          {/* Initial state or retry */}
          {!result && !analyzing && (
            <div className="space-y-3">
              {preview && (
                <img src={preview} alt="Captured meal" className="w-full rounded-lg max-h-48 object-cover" />
              )}

              {error && (
                <div className="flex flex-col items-center gap-3 py-4">
                  <AlertTriangle className="h-8 w-8 text-yellow-500" />
                  <p className="text-sm text-foreground text-center">{error}</p>
                </div>
              )}

              <Button onClick={handleCapture} className="w-full gap-2">
                <Camera className="h-4 w-4" />
                {error || preview ? "Try Again" : "Take Photo of Meal"}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Point your camera at your meal for AI macro estimation
              </p>
            </div>
          )}

          {/* Analyzing */}
          {analyzing && (
            <div className="flex flex-col items-center gap-3 py-8">
              {preview && (
                <img src={preview} alt="Analyzing..." className="w-full rounded-lg max-h-32 object-cover opacity-70" />
              )}
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Analyzing your meal...</p>
            </div>
          )}

          {/* Results */}
          {result && result.items.length > 0 && (
            <div className="space-y-4">
              {preview && (
                <img src={preview} alt="Scanned meal" className="w-full rounded-lg max-h-32 object-cover" />
              )}

              <div className="flex items-center gap-2 text-xs">
                <span className={`px-2 py-0.5 rounded-full ${result.confidence === "high" ? "bg-green-500/20 text-green-400" : result.confidence === "medium" ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"}`}>
                  {result.confidence} confidence
                </span>
                {result.notes && <span className="text-muted-foreground">{result.notes}</span>}
              </div>

              {result.items.map((item, i) => (
                <div key={i} className="rounded-lg border border-border bg-card p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{item.name}</span>
                    <span className="text-xs text-muted-foreground">{item.portion}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div><div className="font-bold text-foreground">{item.calories}</div><div className="text-muted-foreground">Cal</div></div>
                    <div><div className="font-bold text-red-400">{item.protein}g</div><div className="text-muted-foreground">P</div></div>
                    <div><div className="font-bold text-blue-400">{item.carbs}g</div><div className="text-muted-foreground">C</div></div>
                    <div><div className="font-bold text-yellow-400">{item.fat}g</div><div className="text-muted-foreground">F</div></div>
                  </div>
                </div>
              ))}

              {/* Total */}
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="text-xs font-semibold text-muted-foreground mb-1 uppercase">Total Estimated</div>
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div><div className="font-bold text-foreground">{result.items.reduce((s, i) => s + i.calories, 0)}</div><div className="text-muted-foreground">Cal</div></div>
                  <div><div className="font-bold text-red-400">{result.items.reduce((s, i) => s + i.protein, 0)}g</div><div className="text-muted-foreground">P</div></div>
                  <div><div className="font-bold text-blue-400">{result.items.reduce((s, i) => s + i.carbs, 0)}g</div><div className="text-muted-foreground">C</div></div>
                  <div><div className="font-bold text-yellow-400">{result.items.reduce((s, i) => s + i.fat, 0)}g</div><div className="text-muted-foreground">F</div></div>
                </div>
              </div>

              <div>
                <Select value={selectedMealType} onValueChange={setSelectedMealType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MEAL_TYPES.map((m) => (
                      <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={handleReset} className="flex-1 gap-1">
                  <Camera className="h-4 w-4" /> Rescan
                </Button>
                <Button onClick={logAllItems} disabled={logging} className="flex-1 gap-1">
                  {logging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {logging ? "Logging..." : "Log All"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MealScanCapture;
