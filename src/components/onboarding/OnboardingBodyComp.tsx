import { useState, useCallback, useRef, useEffect } from "react";
import type { OnboardingData } from "@/pages/Onboarding";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Check, Camera, AlertTriangle, ImagePlus } from "lucide-react";
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
  uploading: boolean;
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

type AnalysisStage =
  | "idle"
  | "uploading"
  | "standardizing"
  | "analyzing_proportions"
  | "estimating"
  | "finalizing"
  | "complete"
  | "timeout"
  | "error";

const poses: { key: Pose; label: string; desc: string }[] = [
  { key: "front", label: "Front View", desc: "Full body, relaxed stance" },
  { key: "side", label: "Side View", desc: "Full body, profile angle" },
  { key: "back", label: "Back View", desc: "Full body, facing away" },
];

const STAGE_LABELS: Record<AnalysisStage, string> = {
  idle: "",
  uploading: "Uploading images",
  standardizing: "Standardizing lighting",
  analyzing_proportions: "Analyzing body proportions",
  estimating: "Estimating body fat percentage",
  finalizing: "Finalizing report",
  complete: "Analysis complete",
  timeout: "Analysis pending",
  error: "Analysis failed",
};

const STAGE_PROGRESS: Record<AnalysisStage, number> = {
  idle: 0,
  uploading: 15,
  standardizing: 35,
  analyzing_proportions: 55,
  estimating: 75,
  finalizing: 90,
  complete: 100,
  timeout: 100,
  error: 100,
};

// Compress image to max 1080px longest edge, JPEG, max ~5MB
async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const MAX_DIM = 1080;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => resolve(blob || file),
        "image/jpeg",
        0.85
      );
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

const OnboardingBodyComp = ({ data, updateField }: Props) => {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<Record<Pose, PhotoState>>({
    front: { file: null, preview: null, uploaded: false, storageId: null, uploading: false },
    side: { file: null, preview: null, uploaded: false, storageId: null, uploading: false },
    back: { file: null, preview: null, uploaded: false, storageId: null, uploading: false },
  });
  const [stage, setStage] = useState<AnalysisStage>("idle");
  const [progressPct, setProgressPct] = useState(0);
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [adjustMode, setAdjustMode] = useState(false);
  const [adjustedValue, setAdjustedValue] = useState<number | null>(null);
  const [showReassurance, setShowReassurance] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startTimeRef = useRef<number>(0);

  const allPhotosSelected = poses.every((p) => photos[p.key].file);
  const allPhotosUploaded = poses.every((p) => photos[p.key].uploaded);

  // Smooth progress animation
  useEffect(() => {
    const target = STAGE_PROGRESS[stage];
    if (target <= progressPct) return;
    const timer = setInterval(() => {
      setProgressPct((prev) => {
        if (prev >= target) { clearInterval(timer); return target; }
        return Math.min(prev + 1, target);
      });
    }, 60);
    return () => clearInterval(timer);
  }, [stage]);

  // Show reassurance after 20s
  useEffect(() => {
    if (stage !== "idle" && stage !== "complete" && stage !== "timeout" && stage !== "error") {
      const timer = setTimeout(() => setShowReassurance(true), 20000);
      return () => clearTimeout(timer);
    }
    setShowReassurance(false);
  }, [stage]);

  const handlePhotoSelect = async (pose: Pose, file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage("Image too large. Please use a file under 10MB.");
      return;
    }
    setErrorMessage(null);
    const preview = URL.createObjectURL(file);
    setPhotos((prev) => ({
      ...prev,
      [pose]: { file, preview, uploaded: false, storageId: null, uploading: false },
    }));
    setAiResult(null);
    setConfirmed(false);
    setAdjustMode(false);
    setStage("idle");
    setProgressPct(0);
  };

  // Stage 1: Upload individual photo immediately on selection
  const uploadSinglePhoto = useCallback(
    async (pose: Pose, file: File): Promise<string | null> => {
      if (!user) return null;
      setPhotos((prev) => ({
        ...prev,
        [pose]: { ...prev[pose], uploading: true },
      }));
      try {
        const compressed = await compressImage(file);
        const path = `${user.id}/onboarding_${pose}_${Date.now()}.jpg`;
        const { error } = await supabase.storage
          .from("progress-photos")
          .upload(path, compressed, { contentType: "image/jpeg", upsert: true });
        if (error) throw error;

        const { data: record } = await supabase
          .from("progress_photos")
          .insert({
            client_id: user.id,
            storage_path: path,
            pose,
            photo_date: new Date().toISOString().split("T")[0],
            tags: ["onboarding_baseline"],
          })
          .select("id")
          .single();

        if (record) {
          setPhotos((prev) => ({
            ...prev,
            [pose]: { ...prev[pose], uploaded: true, uploading: false, storageId: record.id },
          }));
          return record.id;
        }
      } catch {
        setPhotos((prev) => ({
          ...prev,
          [pose]: { ...prev[pose], uploading: false },
        }));
      }
      return null;
    },
    [user]
  );

  // Stage 1: Upload all photos in parallel
  const uploadAllPhotos = async (): Promise<string[]> => {
    setStage("uploading");
    const results = await Promise.all(
      poses.map(async ({ key }) => {
        const photo = photos[key];
        if (photo.uploaded && photo.storageId) return photo.storageId;
        if (!photo.file) return null;
        return uploadSinglePhoto(key, photo.file);
      })
    );
    return results.filter(Boolean) as string[];
  };

  // Stage 2: Async AI analysis with polling/timeout
  const runAIAnalysis = async (photoIds: string[]) => {
    setStage("standardizing");
    startTimeRef.current = Date.now();
    abortRef.current = new AbortController();

    // Start the AI analysis
    const analyzePromise = supabase.functions.invoke("estimate-body-fat", {
      body: { photoIds },
    });

    // Simulate stage progression while waiting
    const stageTimers = [
      setTimeout(() => setStage("analyzing_proportions"), 3000),
      setTimeout(() => setStage("estimating"), 7000),
      setTimeout(() => setStage("finalizing"), 12000),
    ];

    // Timeout at 30s
    const timeoutId = setTimeout(() => {
      setStage("timeout");
      stageTimers.forEach(clearTimeout);
    }, 30000);

    try {
      const { data: result, error } = await analyzePromise;
      clearTimeout(timeoutId);
      stageTimers.forEach(clearTimeout);

      if (error || !result?.estimate) {
        const errMsg = result?.error || "Analysis could not be completed.";
        // Check for image quality issues
        if (typeof errMsg === "string" && (errMsg.includes("dark") || errMsg.includes("blur") || errMsg.includes("crop"))) {
          setErrorMessage("Please upload a well-lit, full-body image from head to toe.");
          setStage("error");
          return;
        }
        // Fallback: save photos, allow continue
        setStage("timeout");
        updateField("baseline_photo_set_id", photoIds.join(","));
        updateField("baseline_assessment_date", new Date().toISOString());
        return;
      }

      const est = result.estimate;
      const aiData: AIResult = {
        rangeLow: est.confidence_low,
        rangeHigh: est.confidence_high,
        confidence:
          est.confidence_high - est.confidence_low <= 3
            ? "High"
            : est.confidence_high - est.confidence_low <= 5
            ? "Moderate"
            : "Low",
        indicators: est.ai_notes ? est.ai_notes.split(". ").filter(Boolean) : [],
        upperBodyScore: 0,
        midsectionScore: 0,
        lowerBodyScore: 0,
        postureFlag: "",
      };

      setAiResult(aiData);
      setStage("complete");
      setProgressPct(100);

      updateField("bodyfat_range_low", aiData.rangeLow);
      updateField("bodyfat_range_high", aiData.rangeHigh);
      updateField("confidence_level", aiData.confidence);
      updateField("estimated_body_fat_pct", est.estimated_bf_pct);
      updateField("baseline_photo_set_id", photoIds.join(","));
    } catch {
      clearTimeout(timeoutId);
      stageTimers.forEach(clearTimeout);
      setStage("timeout");
      updateField("baseline_photo_set_id", photoIds.join(","));
      updateField("baseline_assessment_date", new Date().toISOString());
    }
  };

  const startAnalysis = async () => {
    setErrorMessage(null);
    setProgressPct(0);
    setShowReassurance(false);

    // Stage 1: Upload
    const photoIds = await uploadAllPhotos();
    if (photoIds.length < 3) {
      setErrorMessage("All 3 photos are required. Please re-upload any missing images.");
      setStage("error");
      return;
    }

    // Stage 2: AI
    await runAIAnalysis(photoIds);
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

  const isProcessing = !["idle", "complete", "timeout", "error"].includes(stage);

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
          alt="Reference Photo Instructions: Front View, Side View, Back View"
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
        {poses.map(({ key, label, desc }) => {
          const photo = photos[key];
          return (
            <div key={key} className="space-y-2">
              <label
                className={cn(
                  "flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 aspect-[3/4] cursor-pointer transition-all relative overflow-hidden",
                  photo.preview
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-card hover:border-muted-foreground/30"
                )}
              >
                {photo.preview ? (
                  <img
                    src={photo.preview}
                    alt={label}
                    className="h-full w-full object-cover rounded-lg"
                  />
                ) : (
                  <>
                    <Camera className="h-5 w-5 text-muted-foreground mb-1" />
                    <span className="text-[10px] text-muted-foreground text-center">{label}</span>
                  </>
                )}
                {/* Upload status badge */}
                {photo.uploaded && (
                  <div className="absolute top-1 right-1 bg-primary rounded-full p-0.5">
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}
                {photo.uploading && (
                  <div className="absolute inset-0 bg-background/60 flex items-center justify-center rounded-xl">
                    <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/heic,image/webp"
                  className="hidden"
                  disabled={isProcessing}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handlePhotoSelect(key, f);
                  }}
                />
              </label>
              <div className="flex items-center justify-center gap-1">
                {photo.uploaded && <Check className="h-3 w-3 text-primary" />}
                <p className={cn("text-[10px] text-center", photo.uploaded ? "text-primary font-medium" : "text-muted-foreground")}>
                  {photo.uploaded ? `${label} uploaded` : desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Error message */}
      {errorMessage && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-xs text-destructive">{errorMessage}</p>
        </div>
      )}

      {/* Analyze button */}
      {allPhotosSelected && !aiResult && !isProcessing && stage !== "timeout" && (
        <Button onClick={startAnalysis} className="w-full" size="lg" disabled={isProcessing}>
          <ImagePlus className="h-4 w-4 mr-2" />
          Analyze Composition
        </Button>
      )}

      {/* Premium analyzing state */}
      {isProcessing && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Analyzing Body Composition</p>

            {/* Progress bar */}
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-300 rounded-full"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{Math.round(progressPct)}%</p>
          </div>

          {/* Stage steps */}
          <div className="space-y-2">
            {(["uploading", "standardizing", "analyzing_proportions", "estimating", "finalizing"] as AnalysisStage[]).map((s) => {
              const stageIdx = ["uploading", "standardizing", "analyzing_proportions", "estimating", "finalizing"].indexOf(s);
              const currentIdx = ["uploading", "standardizing", "analyzing_proportions", "estimating", "finalizing"].indexOf(stage);
              const isDone = currentIdx > stageIdx;
              const isActive = stage === s;
              return (
                <div key={s} className="flex items-center gap-3">
                  {isDone ? (
                    <div className="h-4 w-4 rounded-full bg-primary flex items-center justify-center shrink-0">
                      <Check className="h-2.5 w-2.5 text-primary-foreground" />
                    </div>
                  ) : isActive ? (
                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border border-border shrink-0" />
                  )}
                  <span className={cn("text-xs", isDone ? "text-muted-foreground" : isActive ? "text-foreground font-medium" : "text-muted-foreground/50")}>
                    {STAGE_LABELS[s]}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Reassurance message */}
          {showReassurance && (
            <p className="text-[10px] text-muted-foreground/70 text-center animate-fade-in">
              This can take up to 30 seconds. Optimizing accuracy.
            </p>
          )}
        </div>
      )}

      {/* Timeout fallback */}
      {stage === "timeout" && !aiResult && (
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-5 space-y-3 text-center">
          <AlertTriangle className="h-5 w-5 text-accent mx-auto" />
          <p className="text-sm font-medium text-foreground">Analysis Pending</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your photos have been saved securely. Body composition analysis will complete in the background and appear in your dashboard.
          </p>
          <p className="text-[10px] text-muted-foreground/60">You can continue with onboarding.</p>
        </div>
      )}

      {/* AI Result */}
      {aiResult && !confirmed && (
        <div className="rounded-xl border border-primary/20 bg-card p-5 space-y-5">
          <div className="text-center space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Estimated Range
            </p>
            <p className="font-display text-3xl font-bold text-foreground">
              {aiResult.rangeLow}–{aiResult.rangeHigh}%
            </p>
          </div>

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
