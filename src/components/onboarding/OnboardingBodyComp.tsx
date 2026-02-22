import { useState, useCallback } from "react";
import type { OnboardingData } from "@/pages/Onboarding";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Loader2, Upload, Camera, Check, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import referencePhotoImg from "@/assets/reference-photo-instructions.png";
import maleBfChart from "@/assets/male-bodyfat-chart.png";
import femaleBfChart from "@/assets/female-bodyfat-chart.png";

interface Props {
  data: OnboardingData;
  updateField: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void;
}

type Pose = "front" | "side" | "back";

interface PhotoState {
  file: File | null;
  preview: string | null;
  uploaded: boolean;
  storageId: string | null;
}

interface AIResult {
  rangeLow: number;
  rangeHigh: number;
  confidence: string;
  indicators: string[];
  upperBodyScore: number;
  midsectionScore: number;
  lowerBodyScore: number;
  postureFlag: string;
}

const poses: { key: Pose; label: string; desc: string }[] = [
  { key: "front", label: "Front View", desc: "Full body, relaxed stance" },
  { key: "side", label: "Side View", desc: "Full body, profile angle" },
  { key: "back", label: "Back View", desc: "Full body, facing away" },
];

const OnboardingBodyComp = ({ data, updateField }: Props) => {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<Record<Pose, PhotoState>>({
    front: { file: null, preview: null, uploaded: false, storageId: null },
    side: { file: null, preview: null, uploaded: false, storageId: null },
    back: { file: null, preview: null, uploaded: false, storageId: null },
  });
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [adjustMode, setAdjustMode] = useState(false);
  const [adjustedValue, setAdjustedValue] = useState<number | null>(null);

  const allPhotosSelected = poses.every((p) => photos[p.key].file);

  const handlePhotoSelect = (pose: Pose, file: File) => {
    if (file.size > 5 * 1024 * 1024) return;
    const preview = URL.createObjectURL(file);
    setPhotos((prev) => ({
      ...prev,
      [pose]: { file, preview, uploaded: false, storageId: null },
    }));
    // Reset analysis on new photo
    setAiResult(null);
    setConfirmed(false);
    setAdjustMode(false);
  };

  const uploadPhotos = useCallback(async () => {
    if (!user) return [];
    const ids: string[] = [];
    for (const pose of poses) {
      const photo = photos[pose.key];
      if (!photo.file) continue;
      const path = `${user.id}/onboarding_${pose.key}_${Date.now()}.jpg`;
      const { error } = await supabase.storage
        .from("progress-photos")
        .upload(path, photo.file, { contentType: photo.file.type, upsert: true });
      if (!error) {
        const { data: record } = await supabase
          .from("progress_photos")
          .insert({
            client_id: user.id,
            storage_path: path,
            pose: pose.key,
            photo_date: new Date().toISOString().split("T")[0],
            tags: ["onboarding_baseline"],
          })
          .select("id")
          .single();
        if (record) {
          ids.push(record.id);
          setPhotos((prev) => ({
            ...prev,
            [pose.key]: { ...prev[pose.key], uploaded: true, storageId: record.id },
          }));
        }
      }
    }
    return ids;
  }, [user, photos]);

  const runAnalysis = async () => {
    setAnalyzing(true);
    setAnalyzeProgress(0);

    // Upload photos first
    const interval = setInterval(() => {
      setAnalyzeProgress((p) => Math.min(p + 8, 40));
    }, 300);

    const photoIds = await uploadPhotos();
    clearInterval(interval);
    setAnalyzeProgress(50);

    if (photoIds.length < 3) {
      setAnalyzing(false);
      return;
    }

    // Progress simulation for AI analysis
    const aiInterval = setInterval(() => {
      setAnalyzeProgress((p) => Math.min(p + 5, 90));
    }, 400);

    try {
      const { data: result, error } = await supabase.functions.invoke("estimate-body-fat", {
        body: { photoIds },
      });

      clearInterval(aiInterval);

      if (error || !result?.estimate) {
        // Fallback to slider-based estimation
        setAnalyzeProgress(100);
        setAiResult(null);
        setAnalyzing(false);
        return;
      }

      const est = result.estimate;
      const aiData: AIResult = {
        rangeLow: est.confidence_low,
        rangeHigh: est.confidence_high,
        confidence: est.confidence_high - est.confidence_low <= 3 ? "High" : est.confidence_high - est.confidence_low <= 5 ? "Moderate" : "Low",
        indicators: est.ai_notes ? est.ai_notes.split(". ").filter(Boolean) : [],
        upperBodyScore: 0,
        midsectionScore: 0,
        lowerBodyScore: 0,
        postureFlag: "",
      };

      setAiResult(aiData);
      setAnalyzeProgress(100);

      // Store in onboarding data
      updateField("bodyfat_range_low", aiData.rangeLow);
      updateField("bodyfat_range_high", aiData.rangeHigh);
      updateField("confidence_level", aiData.confidence);
      updateField("estimated_body_fat_pct", est.estimated_bf_pct);
      updateField("baseline_photo_set_id", photoIds.join(","));
    } catch {
      clearInterval(aiInterval);
    }

    setAnalyzing(false);
  };

  const handleAcceptRange = () => {
    if (!aiResult) return;
    const midpoint = Math.round((aiResult.rangeLow + aiResult.rangeHigh) / 2);
    updateField("bodyfat_final_confirmed", adjustedValue ?? midpoint);
    updateField("baseline_assessment_date", new Date().toISOString());
    setConfirmed(true);
  };

  const handleAdjust = () => {
    if (!aiResult) return;
    const midpoint = Math.round((aiResult.rangeLow + aiResult.rangeHigh) / 2);
    setAdjustedValue(midpoint);
    setAdjustMode(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">
          Body Composition Baseline Assessment
        </h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          We use visual analysis to establish a starting reference point. This is not a medical measurement.
        </p>
      </div>

      {/* Reference Photo Instructions Image */}
      <div className="rounded-xl overflow-hidden border border-border">
        <img
          src={referencePhotoImg}
          alt="Reference Photo Instructions: Front View (Full Body, Relaxed), Side View (Full Body, Profile), Back View (Full Body)"
          className="w-full h-auto"
        />
      </div>

      {/* Photo requirements text */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Photo Requirements
        </p>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>• Neutral lighting — no pump, no flexing</li>
          <li>• Minimal clothing for accurate visual assessment</li>
          <li>• Same lighting setup for future check-ins</li>
        </ul>
        <p className="text-[10px] text-muted-foreground/70 italic">
          To ensure accurate comparisons over time.
        </p>
      </div>

      {/* Gender-conditional Body Fat % Reference Chart */}
      {data.gender && (
        <div className="rounded-xl overflow-hidden border border-border">
          <img
            src={data.gender === "female" ? femaleBfChart : maleBfChart}
            alt={`${data.gender === "female" ? "Female" : "Male"} Body Fat % Reference Chart`}
            className="w-full h-auto"
          />
        </div>
      )}

      {/* Photo upload grid */}
      <div className="grid grid-cols-3 gap-3">
        {poses.map(({ key, label, desc }) => (
          <div key={key} className="space-y-2">
            <label
              className={cn(
                "flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 aspect-[3/4] cursor-pointer transition-all",
                photos[key].preview
                  ? "border-primary/40 bg-primary/5"
                  : "border-border bg-card hover:border-muted-foreground/30"
              )}
            >
              {photos[key].preview ? (
                <img
                  src={photos[key].preview!}
                  alt={label}
                  className="h-full w-full object-cover rounded-lg"
                />
              ) : (
                <>
                  <Camera className="h-5 w-5 text-muted-foreground mb-1" />
                  <span className="text-[10px] text-muted-foreground text-center">{label}</span>
                </>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/heic,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handlePhotoSelect(key, f);
                }}
              />
            </label>
            <p className="text-[10px] text-muted-foreground text-center">{desc}</p>
          </div>
        ))}
      </div>

      {/* Analyze button */}
      {allPhotosSelected && !aiResult && !analyzing && (
        <Button onClick={runAnalysis} className="w-full" size="lg">
          <Upload className="h-4 w-4 mr-2" />
          Analyze Composition
        </Button>
      )}

      {/* Analyzing state */}
      {analyzing && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm font-medium text-foreground">Analyzing composition…</span>
          </div>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500 rounded-full"
              style={{ width: `${analyzeProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* AI Result */}
      {aiResult && !confirmed && (
        <div className="rounded-xl border border-primary/20 bg-card p-5 space-y-5">
          {/* Range display */}
          <div className="text-center space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Estimated Range
            </p>
            <p className="font-display text-3xl font-bold text-foreground">
              {aiResult.rangeLow}–{aiResult.rangeHigh}%
            </p>
          </div>

          {/* Confidence */}
          <div className="flex items-center justify-center gap-2">
            <span className="text-xs text-muted-foreground">Confidence Level:</span>
            <span
              className={cn(
                "text-xs font-medium px-2 py-0.5 rounded-full",
                aiResult.confidence === "High"
                  ? "bg-primary/10 text-primary"
                  : aiResult.confidence === "Moderate"
                  ? "bg-accent/10 text-accent"
                  : "bg-destructive/10 text-destructive"
              )}
            >
              {aiResult.confidence}
            </span>
          </div>

          {/* Visual indicators */}
          {aiResult.indicators.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Visual Indicators Detected
              </p>
              <ul className="space-y-1">
                {aiResult.indicators.map((ind, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{ind}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Adjustment slider */}
          {adjustMode && (
            <div className="space-y-3 pt-2 border-t border-border">
              <Label className="text-xs">Adjust within ±3%</Label>
              <div className="flex items-center gap-4">
                <Slider
                  value={[adjustedValue ?? Math.round((aiResult.rangeLow + aiResult.rangeHigh) / 2)]}
                  onValueChange={([v]) => setAdjustedValue(v)}
                  min={aiResult.rangeLow - 3}
                  max={aiResult.rangeHigh + 3}
                  step={0.5}
                  className="flex-1"
                />
                <span className="min-w-[3rem] text-right text-sm font-medium text-foreground">
                  {adjustedValue ?? Math.round((aiResult.rangeLow + aiResult.rangeHigh) / 2)}%
                </span>
              </div>
            </div>
          )}

          {/* Confirmation */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground text-center">
              Does this range feel accurate based on your experience?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={handleAcceptRange} size="sm">
                <Check className="h-3 w-3 mr-1" />
                Accept Range
              </Button>
              <Button onClick={handleAdjust} variant="outline" size="sm">
                Adjust Slightly
              </Button>
            </div>
          </div>

          {/* Disclaimer */}
          <p className="text-[10px] text-muted-foreground/60 text-center leading-relaxed">
            This assessment provides a visual baseline. Progress will be tracked relative to your starting point.
          </p>
        </div>
      )}

      {/* Confirmed state */}
      {confirmed && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-2 text-center">
          <Check className="h-6 w-6 text-primary mx-auto" />
          <p className="text-sm font-medium text-foreground">Baseline Confirmed</p>
          <p className="text-xs text-muted-foreground">
            Body Fat: {data.bodyfat_final_confirmed}% (Range: {data.bodyfat_range_low}–{data.bodyfat_range_high}%)
          </p>
        </div>
      )}

      {/* Manual fallback if no photos */}
      {!allPhotosSelected && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3 w-3 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Or estimate manually without photos</p>
          </div>
          <div className="flex items-center gap-4">
            <Slider
              value={[data.estimated_body_fat_pct ?? 20]}
              onValueChange={([v]) => updateField("estimated_body_fat_pct", v)}
              min={5}
              max={50}
              step={1}
              className="flex-1"
            />
            <span className="min-w-[3rem] text-right text-sm font-medium text-foreground">
              {data.estimated_body_fat_pct ?? 20}%
            </span>
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground px-1">
            <span>Very Lean (5%)</span>
            <span>Average (20%)</span>
            <span>Higher (50%)</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default OnboardingBodyComp;
