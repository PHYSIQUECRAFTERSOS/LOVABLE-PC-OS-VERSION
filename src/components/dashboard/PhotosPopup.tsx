import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Camera, ArrowLeft, Check, SkipForward } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import browserImageCompression from "browser-image-compression";

type Angle = "front" | "side" | "back";

interface PhotosPopupProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  onCompleted: () => void;
}

const POSES: { angle: Angle; label: string; guideImage: string }[] = [
  {
    angle: "front",
    label: "Front",
    guideImage: "/assets/poses/front-pose.jpg",
  },
  {
    angle: "side",
    label: "Side",
    guideImage: "/assets/poses/side-pose.jpg",
  },
  {
    angle: "back",
    label: "Back",
    guideImage: "/assets/poses/back-pose.jpg",
  },
];

const PhotosPopup = ({ open, onClose, eventId, onCompleted }: PhotosPopupProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<"intro" | number | "uploading">("intro");
  const [files, setFiles] = useState<Record<Angle, File | null>>({ front: null, side: null, back: null });
  const [previews, setPreviews] = useState<Record<Angle, string | null>>({ front: null, side: null, back: null });
  const inputRef = useRef<HTMLInputElement>(null);

  const currentPose = typeof step === "number" ? POSES[step] : null;

  if (!open) return null;

  const handleFileSelect = async (file: File) => {
    if (!currentPose) return;
    try {
      const compressed = await browserImageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      });
      const preview = URL.createObjectURL(compressed);
      setFiles(prev => ({ ...prev, [currentPose.angle]: compressed }));
      setPreviews(prev => ({ ...prev, [currentPose.angle]: preview }));
      // Auto-advance after brief preview
      setTimeout(() => advanceStep(), 800);
    } catch {
      toast({ title: "Failed to process image", variant: "destructive" });
    }
  };

  const advanceStep = () => {
    if (typeof step === "number" && step < POSES.length - 1) {
      setStep(step + 1);
    } else {
      handleUpload();
    }
  };

  const handleUpload = async () => {
    if (!user) return;
    const uploadFiles = Object.entries(files).filter(([_, f]) => f !== null) as [Angle, File][];

    if (uploadFiles.length === 0) {
      toast({ title: "No photos to upload", description: "Come back when you're ready!", variant: "destructive" });
      handleClose();
      return;
    }

    setStep("uploading");
    try {
      const today = format(new Date(), "yyyy-MM-dd");

      for (const [angle, file] of uploadFiles) {
        const fileName = `${user.id}/${today}/${angle}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("progress-photos")
          .upload(fileName, file, { contentType: "image/jpeg", upsert: true });

        if (uploadError) {
          console.error("Photo upload failed:", uploadError);
          continue;
        }

        await supabase.from("progress_photos").insert({
          client_id: user.id,
          storage_path: fileName,
          pose: angle,
          photo_date: today,
          source: "photos_popup",
        });
      }

      // Mark calendar event complete
      await supabase.from("calendar_events").update({
        is_completed: true,
        completed_at: new Date().toISOString(),
      }).eq("id", eventId);

      toast({ title: "Progress photos saved! 📸" });
      setTimeout(() => {
        onCompleted();
        handleClose();
      }, 400);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      setStep(2);
    }
  };

  const handleClose = () => {
    Object.values(previews).forEach(p => p && URL.revokeObjectURL(p));
    setStep("intro");
    setFiles({ front: null, side: null, back: null });
    setPreviews({ front: null, side: null, back: null });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="text-base font-bold text-foreground">Today</h1>
        <div className="w-8" />
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-6">
        {/* Intro Screen */}
        {step === "intro" && (
          <div className="flex flex-col items-center gap-6 w-full max-w-sm">
            <div className="h-24 w-24 rounded-full border-2 border-primary flex items-center justify-center">
              <Camera className="h-10 w-10 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-foreground">Take Progress Photos</p>
              <p className="text-sm text-muted-foreground mt-1">Scheduled</p>
            </div>
          </div>
        )}

        {/* Step-by-step Pose Guide */}
        {typeof step === "number" && currentPose && (
          <div className="flex flex-col items-center gap-5 w-full max-w-sm">
            {/* Step indicator */}
            <div className="flex items-center gap-2">
              {POSES.map((p, i) => (
                <div
                  key={p.angle}
                  className={`h-2 w-8 rounded-full transition-colors ${
                    i < step ? "bg-green-500" : i === step ? "bg-primary" : "bg-muted"
                  }`}
                />
              ))}
            </div>

            {/* Pose Card */}
            <div className="w-full rounded-2xl bg-card border border-border overflow-hidden shadow-lg">
              <div className="px-5 pt-4 pb-2">
                <span className="text-lg font-bold text-foreground">{currentPose.label}</span>
              </div>

              <div className="relative px-5 pb-4">
                {previews[currentPose.angle] ? (
                  <div className="relative">
                    <img
                      src={previews[currentPose.angle]!}
                      alt={`${currentPose.label} photo uploaded`}
                      className="w-full rounded-xl object-cover max-h-[400px]"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-xl">
                      <div className="h-14 w-14 rounded-full bg-green-500 flex items-center justify-center">
                        <Check className="h-7 w-7 text-white" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <img
                    src={currentPose.guideImage}
                    alt={`${currentPose.label} pose guide`}
                    className="w-full rounded-xl object-contain max-h-[400px]"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/placeholder.svg";
                    }}
                  />
                )}
              </div>

              {/* Upload Photo button */}
              <div className="px-5 pb-5">
                <Button
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-base h-12"
                  onClick={() => inputRef.current?.click()}
                >
                  Upload Photo
                </Button>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>

            {/* Skip button */}
            <button
              onClick={advanceStep}
              className="flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors py-2"
            >
              <SkipForward className="h-4 w-4" />
              Skip This Pose
            </button>
          </div>
        )}

        {/* Uploading state */}
        {step === "uploading" && (
          <div className="flex flex-col items-center gap-5">
            <div className="h-14 w-14 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-base font-medium text-foreground">Uploading photos...</p>
          </div>
        )}
      </div>

      {/* Footer - only on intro */}
      {step === "intro" && (
        <div className="px-6 pb-8 pt-4">
          <Button
            onClick={() => setStep(0)}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-base h-14 rounded-xl"
            size="lg"
          >
            ADD PHOTOS
          </Button>
        </div>
      )}
    </div>
  );
};

export default PhotosPopup;
