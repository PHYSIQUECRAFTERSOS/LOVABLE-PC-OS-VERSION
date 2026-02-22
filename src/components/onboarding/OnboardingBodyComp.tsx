import { useState, useCallback, useRef } from "react";
import type { OnboardingData } from "@/pages/Onboarding";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Camera, Check, AlertTriangle, Upload } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import imageCompression from "browser-image-compression";
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
  status: "idle" | "compressing" | "uploading" | "done" | "error";
  progress: number; // 0-100
  errorMsg: string | null;
  storageId: string | null;
}

const poses: { key: Pose; label: string; desc: string }[] = [
  { key: "front", label: "Front View", desc: "Full body, relaxed stance" },
  { key: "side", label: "Side View", desc: "Full body, profile angle" },
  { key: "back", label: "Back View", desc: "Full body, facing away" },
];

const COMPRESSION_OPTIONS = {
  maxSizeMB: 0.5,
  maxWidthOrHeight: 1200,
  useWebWorker: true,
  fileType: "image/jpeg" as const,
  initialQuality: 0.7,
};

const OnboardingBodyComp = ({ data, updateField }: Props) => {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<Record<Pose, PhotoState>>({
    front: { file: null, preview: null, status: "idle", progress: 0, errorMsg: null, storageId: null },
    side: { file: null, preview: null, status: "idle", progress: 0, errorMsg: null, storageId: null },
    back: { file: null, preview: null, status: "idle", progress: 0, errorMsg: null, storageId: null },
  });
  const uploadAbortRefs = useRef<Record<Pose, AbortController | null>>({ front: null, side: null, back: null });

  const updatePhoto = useCallback((pose: Pose, patch: Partial<PhotoState>) => {
    setPhotos(prev => ({ ...prev, [pose]: { ...prev[pose], ...patch } }));
  }, []);

  const compressAndUpload = useCallback(async (pose: Pose, file: File) => {
    if (!user) return;

    // Abort any in-flight upload for this pose
    uploadAbortRefs.current[pose]?.abort();
    const controller = new AbortController();
    uploadAbortRefs.current[pose] = controller;

    const preview = URL.createObjectURL(file);
    updatePhoto(pose, { file, preview, status: "compressing", progress: 10, errorMsg: null, storageId: null });

    // 25-second failsafe
    const failsafeTimer = setTimeout(() => {
      controller.abort();
      updatePhoto(pose, { status: "error", progress: 0, errorMsg: "Upload timed out. You can continue and retry later." });
    }, 25000);

    try {
      // Compress
      let compressed: Blob;
      try {
        compressed = await imageCompression(file, {
          ...COMPRESSION_OPTIONS,
          signal: controller.signal,
          onProgress: (p) => {
            if (!controller.signal.aborted) {
              updatePhoto(pose, { progress: Math.min(10 + p * 0.4, 50) });
            }
          },
        });
      } catch (compErr) {
        if (controller.signal.aborted) return;
        // Fallback: use original file if compression fails
        compressed = file;
      }

      if (controller.signal.aborted) return;
      updatePhoto(pose, { status: "uploading", progress: 55 });

      // Upload to storage
      const path = `${user.id}/onboarding_${pose}_${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("progress-photos")
        .upload(path, compressed, { contentType: "image/jpeg", upsert: true });

      if (controller.signal.aborted) return;
      if (uploadError) throw new Error(uploadError.message);

      updatePhoto(pose, { progress: 80 });

      // Save record
      const { data: record, error: dbError } = await supabase
        .from("progress_photos")
        .insert({
          client_id: user.id,
          storage_path: path,
          pose,
          photo_date: new Date().toISOString().split("T")[0],
        })
        .select("id")
        .single();

      if (controller.signal.aborted) return;
      if (dbError) throw new Error(dbError.message);

      updatePhoto(pose, { status: "done", progress: 100, storageId: record?.id || null });

      // Update parent with photo IDs
      setPhotos(prev => {
        const updated = { ...prev, [pose]: { ...prev[pose], status: "done" as const, progress: 100, storageId: record?.id || null } };
        const ids = poses.map(p => updated[p.key].storageId).filter(Boolean).join(",");
        if (ids) {
          updateField("baseline_photo_set_id", ids);
          updateField("baseline_assessment_date", new Date().toISOString());
        }
        return updated;
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      const msg = err instanceof Error ? err.message : "Upload failed";
      updatePhoto(pose, { status: "error", progress: 0, errorMsg: msg });
    } finally {
      clearTimeout(failsafeTimer);
      uploadAbortRefs.current[pose] = null;
    }
  }, [user, updateField, updatePhoto]);

  const handlePhotoSelect = (pose: Pose, file: File) => {
    if (file.size > 15 * 1024 * 1024) {
      updatePhoto(pose, { errorMsg: "File too large (max 15MB)" });
      return;
    }
    compressAndUpload(pose, file);
  };

  const anyUploading = poses.some(p => photos[p.key].status === "compressing" || photos[p.key].status === "uploading");
  const anyError = poses.some(p => photos[p.key].status === "error");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">
          Body Composition Baseline
        </h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Upload reference photos and select your estimated body fat percentage.
        </p>
      </div>

      {/* Reference Photo Instructions */}
      <div className="rounded-xl overflow-hidden border border-border">
        <img src={referencePhotoImg} alt="Photo instructions" className="w-full h-auto" />
      </div>

      {/* Requirements */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Photo Requirements</p>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>• Neutral lighting — no pump, no flexing</li>
          <li>• Minimal clothing for accurate visual assessment</li>
          <li>• Same lighting setup for future check-ins</li>
        </ul>
      </div>

      {/* Gender-conditional BF chart */}
      {data.gender && (
        <div className="rounded-xl overflow-hidden border border-border">
          <img
            src={data.gender === "female" ? femaleBfChart : maleBfChart}
            alt={`${data.gender === "female" ? "Female" : "Male"} Body Fat % Reference Chart`}
            className="w-full h-auto"
          />
        </div>
      )}

      {/* Upload status banner */}
      {anyUploading && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-center gap-3">
          <Upload className="h-4 w-4 text-primary animate-pulse shrink-0" />
          <div className="flex-1 space-y-1">
            <p className="text-xs font-medium text-foreground">Uploading photos…</p>
            <p className="text-[10px] text-muted-foreground">You can continue to the next step while photos finish uploading.</p>
          </div>
        </div>
      )}

      {/* Photo upload grid */}
      <div className="grid grid-cols-3 gap-3">
        {poses.map(({ key, label, desc }) => {
          const photo = photos[key];
          const isActive = photo.status === "compressing" || photo.status === "uploading";
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
                  <img src={photo.preview} alt={label} className="h-full w-full object-cover rounded-lg" />
                ) : (
                  <>
                    <Camera className="h-5 w-5 text-muted-foreground mb-1" />
                    <span className="text-[10px] text-muted-foreground text-center">{label}</span>
                  </>
                )}
                {photo.status === "done" && (
                  <div className="absolute top-1 right-1 bg-primary rounded-full p-0.5">
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}
                {isActive && (
                  <div className="absolute inset-x-0 bottom-0 bg-background/80 p-1.5">
                    <Progress value={photo.progress} className="h-1.5" />
                    <p className="text-[9px] text-center text-muted-foreground mt-0.5">
                      {photo.status === "compressing" ? "Compressing…" : "Uploading…"}
                    </p>
                  </div>
                )}
                {photo.status === "error" && (
                  <div className="absolute inset-0 bg-destructive/10 flex items-center justify-center rounded-xl">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  </div>
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
              <div className="flex items-center justify-center gap-1">
                {photo.status === "done" && <Check className="h-3 w-3 text-primary" />}
                <p className={cn("text-[10px] text-center", photo.status === "done" ? "text-primary font-medium" : photo.status === "error" ? "text-destructive" : "text-muted-foreground")}>
                  {photo.status === "done" ? `${label} ✓` : photo.status === "error" ? (photo.errorMsg || "Failed — tap to retry") : desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Error details */}
      {anyError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-xs text-destructive">
            Some photos failed to upload. Tap the photo to retry, or continue and upload later from your profile.
          </p>
        </div>
      )}

      {/* Manual body fat slider */}
      <div className="space-y-3 pt-2">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Estimated Body Fat %
        </Label>
        <p className="text-[10px] text-muted-foreground">
          Use the reference chart above to select your best estimate.
        </p>
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

      <p className="text-[10px] text-muted-foreground/60 text-center leading-relaxed">
        Progress will be tracked relative to your starting point. Photos upload in the background.
      </p>
    </div>
  );
};

export default OnboardingBodyComp;
