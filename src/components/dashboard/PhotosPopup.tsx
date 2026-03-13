import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Drawer, DrawerContent, DrawerFooter } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Camera, X, Check } from "lucide-react";
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

const POSES: { angle: Angle; label: string; guideImage: string; guideLines: string[] }[] = [
  {
    angle: "front",
    label: "Front",
    guideImage: "/assets/poses/front-pose.jpg",
    guideLines: ["Front View:", "Full Body, Relaxed."],
  },
  {
    angle: "side",
    label: "Side",
    guideImage: "/assets/poses/side-pose.jpg",
    guideLines: ["Side View:", "Full Body, Profile."],
  },
  {
    angle: "back",
    label: "Back",
    guideImage: "/assets/poses/back-pose.jpg",
    guideLines: ["Back View:", "Full Body."],
  },
];

const PhotosPopup = ({ open, onClose, eventId, onCompleted }: PhotosPopupProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  // "intro" = initial screen, 0/1/2 = pose step index, "uploading" = uploading state
  const [step, setStep] = useState<"intro" | number | "uploading">("intro");
  const [files, setFiles] = useState<Record<Angle, File | null>>({ front: null, side: null, back: null });
  const [previews, setPreviews] = useState<Record<Angle, string | null>>({ front: null, side: null, back: null });
  const inputRef = useRef<HTMLInputElement>(null);

  const currentPose = typeof step === "number" ? POSES[step] : null;

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
      setTimeout(() => advanceStep(), 600);
    } catch {
      toast({ title: "Failed to process image", variant: "destructive" });
    }
  };

  const advanceStep = () => {
    if (typeof step === "number" && step < POSES.length - 1) {
      setStep(step + 1);
    } else {
      // All poses done — start upload
      handleUpload();
    }
  };

  const handleUpload = async () => {
    if (!user) return;
    const uploadFiles = Object.entries(files).filter(([_, f]) => f !== null) as [Angle, File][];
    
    if (uploadFiles.length === 0) {
      toast({ title: "No photos to upload. Come back when you're ready!", variant: "destructive" });
      onClose();
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
        onClose();
      }, 400);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      setStep(2); // Go back to last step
    }
  };

  const handleClose = () => {
    const hasPhotos = Object.values(files).some(f => f !== null);
    if (hasPhotos && typeof step === "number") {
      if (!window.confirm("You have unsaved photos. Discard and go back?")) return;
    }
    // Clean up previews
    Object.values(previews).forEach(p => p && URL.revokeObjectURL(p));
    onClose();
  };

  return (
    <Drawer open={open} onOpenChange={(o) => !o && handleClose()}>
      <DrawerContent className="max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-base font-bold text-foreground">Upload Progress Photos</h2>
          <div className="w-5" />
        </div>

        <div className="overflow-y-auto px-4 pb-4 flex-1">
          {/* Intro Screen */}
          {step === "intro" && (
            <div className="flex flex-col items-center gap-5 py-6">
              <div className="h-20 w-20 rounded-full border-2 border-primary flex items-center justify-center">
                <Camera className="h-8 w-8 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">Take Progress Photos</p>
                <p className="text-xs text-muted-foreground mt-1">Scheduled</p>
              </div>
              <p className="text-xs text-muted-foreground text-center max-w-[260px]">
                You'll be guided through 3 poses: Front, Side, and Back. Upload a photo or skip each pose.
              </p>
            </div>
          )}

          {/* Step-by-step Pose Guide */}
          {typeof step === "number" && currentPose && (
            <div className="flex flex-col items-center gap-4 py-2">
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
              <div className="w-full max-w-[320px] rounded-2xl bg-card border border-border overflow-hidden shadow-lg">
                {/* Label */}
                <div className="px-4 pt-3 pb-1">
                  <span className="text-sm font-bold text-foreground">{currentPose.label}</span>
                </div>

                {/* Guide Image */}
                <div className="relative px-4 pb-3">
                  {previews[currentPose.angle] ? (
                    <div className="relative">
                      <img
                        src={previews[currentPose.angle]!}
                        alt={`${currentPose.label} photo uploaded`}
                        className="w-full rounded-xl object-cover max-h-[360px]"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-xl">
                        <div className="h-12 w-12 rounded-full bg-green-500 flex items-center justify-center">
                          <Check className="h-6 w-6 text-white" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <img
                      src={currentPose.guideImage}
                      alt={`${currentPose.label} pose guide`}
                      className="w-full rounded-xl object-cover max-h-[360px]"
                      onError={(e) => {
                        // Placeholder if image missing
                        (e.target as HTMLImageElement).src = "/placeholder.svg";
                      }}
                    />
                  )}
                </div>

                {/* Guide text */}
                <div className="px-4 pb-3">
                  <p className="text-xs text-muted-foreground text-center">
                    {currentPose.guideLines.join(" ")}
                  </p>
                </div>

                {/* Upload button */}
                <div className="px-4 pb-4">
                  <Button
                    variant="outline"
                    className="w-full border-primary text-primary hover:bg-primary/10 font-semibold"
                    onClick={() => inputRef.current?.click()}
                  >
                    UPLOAD PHOTO
                  </Button>
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
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
                className="text-sm font-bold text-muted-foreground hover:text-foreground transition-colors py-2"
              >
                SKIP POSE
              </button>
            </div>
          )}

          {/* Uploading state */}
          {step === "uploading" && (
            <div className="flex flex-col items-center gap-4 py-12">
              <div className="h-12 w-12 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <p className="text-sm font-medium text-foreground">Uploading photos...</p>
            </div>
          )}
        </div>

        {/* Footer - only show ADD PHOTOS on intro */}
        {step === "intro" && (
          <DrawerFooter className="pt-2">
            <Button
              onClick={() => setStep(0)}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-base"
              size="lg"
            >
              ADD PHOTOS
            </Button>
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );
};

export default PhotosPopup;
