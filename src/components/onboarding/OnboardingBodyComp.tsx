import { useState, useCallback } from "react";
import type { OnboardingData } from "@/pages/Onboarding";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Check, Camera, AlertTriangle } from "lucide-react";
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

const poses: { key: Pose; label: string; desc: string }[] = [
  { key: "front", label: "Front View", desc: "Full body, relaxed stance" },
  { key: "side", label: "Side View", desc: "Full body, profile angle" },
  { key: "back", label: "Back View", desc: "Full body, facing away" },
];

// Compress image to max 1080px longest edge, JPEG
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const allPhotosSelected = poses.every((p) => photos[p.key].file);

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

    // Auto-upload immediately
    if (user) {
      uploadSinglePhoto(pose, file);
    }
  };

  const uploadSinglePhoto = useCallback(
    async (pose: Pose, file: File) => {
      if (!user) return;
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
          setPhotos((prev) => {
            const updated = {
              ...prev,
              [pose]: { ...prev[pose], uploaded: true, uploading: false, storageId: record.id },
            };
            // Save photo set ID when all uploaded
            const allUploaded = poses.every((p) => updated[p.key].uploaded);
            if (allUploaded) {
              const ids = poses.map((p) => updated[p.key].storageId).filter(Boolean).join(",");
              updateField("baseline_photo_set_id", ids);
              updateField("baseline_assessment_date", new Date().toISOString());
            }
            return updated;
          });
        }
      } catch {
        setPhotos((prev) => ({
          ...prev,
          [pose]: { ...prev[pose], uploading: false },
        }));
      }
    },
    [user, updateField]
  );

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

      {/* Manual body fat estimation slider */}
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
        This assessment provides a visual baseline. Progress will be tracked relative to your starting point.
      </p>
    </div>
  );
};

export default OnboardingBodyComp;
