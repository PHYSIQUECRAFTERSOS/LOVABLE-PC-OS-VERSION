import { useState, useCallback, useRef } from "react";
import type { OnboardingData } from "@/pages/Onboarding";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Home, Dumbbell, Camera, X, Upload, Check, AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import imageCompression from "browser-image-compression";

interface Props {
  data: OnboardingData;
  updateField: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void;
  validationErrors: Record<string, string>;
}

const COMPRESSION_OPTIONS = {
  maxSizeMB: 0.5,
  maxWidthOrHeight: 1200,
  useWebWorker: true,
  fileType: "image/jpeg" as const,
  initialQuality: 0.7,
};

const OnboardingTrainingEnv = ({ data, updateField, validationErrors }: Props) => {
  const { user } = useAuth();
  const [uploadingPhotos, setUploadingPhotos] = useState<Record<number, number>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = useCallback(async (files: FileList) => {
    if (!user) return;
    const currentUrls = data.equipment_photo_urls || [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const idx = currentUrls.length + i;
      setUploadingPhotos(prev => ({ ...prev, [idx]: 10 }));

      try {
        const compressed = await imageCompression(file, {
          ...COMPRESSION_OPTIONS,
          onProgress: (p) => setUploadingPhotos(prev => ({ ...prev, [idx]: Math.min(10 + p * 0.5, 60) })),
        });

        setUploadingPhotos(prev => ({ ...prev, [idx]: 65 }));

        const path = `${user.id}/equipment_${Date.now()}_${i}.jpg`;
        const { error } = await supabase.storage
          .from("equipment-photos")
          .upload(path, compressed, { contentType: "image/jpeg", upsert: true });

        if (error) throw error;

        setUploadingPhotos(prev => ({ ...prev, [idx]: 100 }));
        const newUrls = [...(data.equipment_photo_urls || []), path];
        updateField("equipment_photo_urls", newUrls);

        setTimeout(() => {
          setUploadingPhotos(prev => {
            const next = { ...prev };
            delete next[idx];
            return next;
          });
        }, 500);
      } catch {
        setUploadingPhotos(prev => {
          const next = { ...prev };
          delete next[idx];
          return next;
        });
      }
    }
  }, [user, data.equipment_photo_urls, updateField]);

  const removePhoto = (index: number) => {
    const urls = [...(data.equipment_photo_urls || [])];
    urls.splice(index, 1);
    updateField("equipment_photo_urls", urls);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Training Environment</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Where you train determines how we build your program.
        </p>
      </div>

      {/* Location selection */}
      <div className="space-y-3">
        <Label>Where will you be working out? <span className="text-destructive">*</span></Label>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: "home", label: "Home", icon: Home },
            { value: "gym", label: "Gym", icon: Dumbbell },
          ].map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => updateField("training_location", value)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-xl border p-5 transition-all",
                data.training_location === value
                  ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                  : "border-border bg-card hover:border-muted-foreground/30"
              )}
            >
              <Icon className={cn("h-6 w-6", data.training_location === value ? "text-primary" : "text-muted-foreground")} />
              <span className={cn("text-sm font-medium", data.training_location === value ? "text-foreground" : "text-muted-foreground")}>{label}</span>
            </button>
          ))}
        </div>
        {validationErrors.training_location && (
          <p className="text-xs text-destructive">{validationErrors.training_location}</p>
        )}
      </div>

      {/* Home-specific fields */}
      {data.training_location === "home" && (
        <div className="space-y-5 animate-in fade-in-0 slide-in-from-top-2 duration-300">
          <div className="space-y-2">
            <Label>List all equipment you own <span className="text-destructive">*</span></Label>
            <Textarea
              placeholder="e.g. Adjustable dumbbells (5-50 lb), pull-up bar, resistance bands, bench..."
              value={data.home_equipment_list || ""}
              onChange={(e) => updateField("home_equipment_list", e.target.value)}
              rows={4}
              className={cn(validationErrors.home_equipment_list && "border-destructive")}
            />
            <div className="flex justify-between">
              {validationErrors.home_equipment_list && (
                <p className="text-xs text-destructive">{validationErrors.home_equipment_list}</p>
              )}
              <p className="text-[10px] text-muted-foreground ml-auto">
                {(data.home_equipment_list || "").length}/20 min characters
              </p>
            </div>
          </div>

          {/* Equipment photos */}
          <div className="space-y-2">
            <Label>Upload photos of your equipment <span className="text-destructive">*</span></Label>
            <p className="text-xs text-muted-foreground">At least 1 photo required. Helps your coach understand your setup.</p>

            <div className="grid grid-cols-3 gap-2">
              {(data.equipment_photo_urls || []).map((url, i) => (
                <div key={i} className="relative aspect-square rounded-lg border border-border overflow-hidden bg-card">
                  <EquipmentPhotoPreview path={url} />
                  <button
                    onClick={() => removePhoto(i)}
                    className="absolute top-1 right-1 bg-background/80 rounded-full p-0.5"
                  >
                    <X className="h-3 w-3 text-foreground" />
                  </button>
                  <div className="absolute bottom-1 right-1 bg-primary rounded-full p-0.5">
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </div>
                </div>
              ))}

              {Object.entries(uploadingPhotos).map(([idx, progress]) => (
                <div key={`uploading-${idx}`} className="aspect-square rounded-lg border border-border bg-card flex flex-col items-center justify-center gap-1">
                  <Upload className="h-4 w-4 text-muted-foreground animate-pulse" />
                  <Progress value={progress} className="h-1 w-3/4" />
                  <span className="text-[9px] text-muted-foreground">{Math.round(progress)}%</span>
                </div>
              ))}

              <button
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square rounded-lg border-2 border-dashed border-border bg-card hover:border-muted-foreground/30 flex flex-col items-center justify-center gap-1 transition-colors"
              >
                <Camera className="h-5 w-5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">Add Photo</span>
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handlePhotoUpload(e.target.files)}
            />

            {validationErrors.equipment_photo_urls && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {validationErrors.equipment_photo_urls}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Gym-specific fields */}
      {data.training_location === "gym" && (
        <div className="space-y-2 animate-in fade-in-0 slide-in-from-top-2 duration-300">
          <Label>What gym will you be working out of? <span className="text-destructive">*</span></Label>
          <p className="text-xs text-muted-foreground">Include gym name and full address.</p>
          <Input
            placeholder="Alphaland - 1502 Industrial Dr, Missouri City, TX 77489, United States"
            value={data.gym_name_address || ""}
            onChange={(e) => updateField("gym_name_address", e.target.value)}
            className={cn(validationErrors.gym_name_address && "border-destructive")}
          />
          {validationErrors.gym_name_address && (
            <p className="text-xs text-destructive">{validationErrors.gym_name_address}</p>
          )}
        </div>
      )}
    </div>
  );
};

const EquipmentPhotoPreview = ({ path }: { path: string }) => {
  const [url, setUrl] = useState<string | null>(null);
  useState(() => {
    supabase.storage.from("equipment-photos").createSignedUrl(path, 3600).then(({ data }) => {
      if (data?.signedUrl) setUrl(data.signedUrl);
    });
  });
  if (!url) return <div className="w-full h-full bg-secondary animate-pulse" />;
  return <img src={url} alt="Equipment" className="w-full h-full object-cover" />;
};

export default OnboardingTrainingEnv;
