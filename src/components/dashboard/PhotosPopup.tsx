import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Camera, ArrowLeft, Check, SkipForward, Images } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import browserImageCompression from "browser-image-compression";

import frontPoseImg from "@/assets/poses/front-pose.jpeg";
import sidePoseImg from "@/assets/poses/side-pose.jpeg";
import backPoseImg from "@/assets/poses/back-pose.jpeg";

type Angle = "front" | "side" | "back";

interface PhotosPopupProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  onCompleted: () => void;
}

const POSES: { angle: Angle; label: string; subtitle: string; guideImage: string }[] = [
  {
    angle: "front",
    label: "Front View",
    subtitle: "Full Body, Relaxed.",
    guideImage: frontPoseImg,
  },
  {
    angle: "side",
    label: "Side View",
    subtitle: "Full Body, Profile.",
    guideImage: sidePoseImg,
  },
  {
    angle: "back",
    label: "Back View",
    subtitle: "Full Body.",
    guideImage: backPoseImg,
  },
];

const PhotosPopup = ({ open, onClose, eventId, onCompleted }: PhotosPopupProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<"intro" | number | "uploading">("intro");
  const [files, setFiles] = useState<Record<Angle, File | null>>({ front: null, side: null, back: null });
  const [previews, setPreviews] = useState<Record<Angle, string | null>>({ front: null, side: null, back: null });
  const pickInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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

      await supabase.from("calendar_events").update({
        is_completed: true,
        completed_at: new Date().toISOString(),
      }).eq("id", eventId);

      toast({ title: "Progress photos saved! 📸" });
      window.dispatchEvent(new Event("photos-uploaded"));
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
    <div className="fixed inset-0 z-[60] bg-background flex flex-col animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="text-base font-bold text-foreground">Today</h1>
        <div className="w-8" />
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-6">
        {/* Intro Screen — Trainerize style */}
        {step === "intro" && (
          <div className="flex flex-col items-center gap-6 w-full max-w-sm">
            <div className="h-28 w-28 rounded-full border-2 border-primary flex items-center justify-center">
              <Images className="h-12 w-12 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-foreground">Take Progress Photos</p>
              <p className="text-sm text-muted-foreground mt-1">Scheduled</p>
            </div>
          </div>
        )}

        {/* Step-by-step Pose Guide — Trainerize card style */}
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

            {/* Pose Card — white card like Trainerize */}
            <div className="w-full rounded-2xl bg-white overflow-hidden shadow-xl">
              {/* Pose label */}
              <div className="px-5 pt-4 pb-2">
                <span className="text-lg font-bold text-gray-900">{currentPose.label.split(" ")[0]}</span>
              </div>

              <div className="relative px-5 pb-2">
                {previews[currentPose.angle] ? (
                  <div className="relative">
                    <img
                      src={previews[currentPose.angle]!}
                      alt={`${currentPose.label} uploaded`}
                      className="w-full rounded-xl object-cover max-h-[400px]"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-xl">
                      <div className="h-14 w-14 rounded-full bg-green-500 flex items-center justify-center">
                        <Check className="h-7 w-7 text-white" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    {/* Guide image with alignment lines */}
                    <div className="relative">
                      <img
                        src={currentPose.guideImage}
                        alt={`${currentPose.label} guide`}
                        className="w-full object-contain max-h-[380px] rounded-xl"
                      />
                    </div>

                    {/* Instruction text */}
                    <p className="text-center text-sm text-gray-500 mt-3 leading-tight">
                      Match the pose shown above.
                    </p>
                  </div>
                )}
              </div>

              {/* Action buttons — Trainerize style */}
              {!previews[currentPose.angle] && (
                <div className="flex border-t border-gray-200 mt-3">
                  <button
                    className="flex-1 py-3.5 text-center text-blue-600 font-semibold text-sm border-r border-gray-200 active:bg-gray-50 transition-colors"
                    onClick={() => { try { setTimeout(() => pickInputRef.current?.click(), 0); } catch (e) { console.warn("[PhotosPopup] File picker error:", e); } }}
                  >
                    PICK PHOTO
                  </button>
                  <button
                    className="flex-1 py-3.5 text-center text-blue-600 font-bold text-sm active:bg-gray-50 transition-colors"
                    onClick={() => { try { setTimeout(() => cameraInputRef.current?.click(), 0); } catch (e) { console.warn("[PhotosPopup] File picker error:", e); } }}
                  >
                    TAKE NOW
                  </button>
                </div>
              )}

              {/* Library picker — no capture attribute */}
              <input
                ref={pickInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                  e.target.value = "";
                }}
              />
              {/* Camera capture */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                  e.target.value = "";
                }}
              />
            </div>

            {/* Skip button */}
            <button
              onClick={advanceStep}
              className="flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors py-2"
            >
              SKIP THIS POSE
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
