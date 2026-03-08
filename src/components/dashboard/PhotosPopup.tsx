import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Drawer, DrawerContent, DrawerFooter } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Camera, X, Plus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import browserImageCompression from "browser-image-compression";
import referenceImage from "@/assets/reference-photo-instructions.png";

type Angle = "front" | "side" | "back" | "other";

interface PhotoSlot {
  file: File | null;
  preview: string | null;
  angle: Angle;
}

interface PhotosPopupProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  onCompleted: () => void;
}

const SLOTS: { defaultAngle: Angle; label: string }[] = [
  { defaultAngle: "front", label: "Front" },
  { defaultAngle: "side", label: "Side" },
  { defaultAngle: "back", label: "Back" },
];

const INSTRUCTIONS = [
  "Stand in your washroom with all lights on. Use your phone camera.",
  "Switch to selfie mode on your camera.",
  "Prop your phone against a water bottle or mirror — something to hold it vertically.",
  "Set your camera timer to 5 seconds. Step back and take a photo of your FRONT.",
  "Repeat Step 4 for your SIDE and BACK photos.",
];

const PhotosPopup = ({ open, onClose, eventId, onCompleted }: PhotosPopupProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showUpload, setShowUpload] = useState(false);
  const [photos, setPhotos] = useState<PhotoSlot[]>(
    SLOTS.map(s => ({ file: null, preview: null, angle: s.defaultAngle }))
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleFileSelect = async (index: number, file: File) => {
    try {
      const compressed = await browserImageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      });
      const preview = URL.createObjectURL(compressed);
      setPhotos(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], file: compressed, preview };
        return updated;
      });
      setError("");
    } catch {
      toast({ title: "Failed to process image", variant: "destructive" });
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => {
      const updated = [...prev];
      if (updated[index].preview) URL.revokeObjectURL(updated[index].preview!);
      updated[index] = { ...updated[index], file: null, preview: null };
      return updated;
    });
  };

  const handleAddPhotos = () => {
    setShowUpload(true);
    // Trigger first file input
    setTimeout(() => inputRefs.current[0]?.click(), 100);
  };

  const handleDone = async () => {
    if (!user) return;
    const withPhotos = photos.filter(p => p.file);
    if (withPhotos.length === 0) {
      setError("Please add at least one photo to continue");
      return;
    }

    setUploading(true);
    try {
      const today = format(new Date(), "yyyy-MM-dd");

      for (const photo of withPhotos) {
        if (!photo.file) continue;
        const fileName = `${user.id}/${Date.now()}_${photo.angle}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("progress-photos")
          .upload(fileName, photo.file, { contentType: "image/jpeg", upsert: false });

        if (uploadError) {
          console.error("Photo upload failed:", uploadError);
          continue;
        }

        await supabase.from("progress_photos").insert({
          client_id: user.id,
          storage_path: fileName,
          pose: photo.angle,
          photo_date: today,
          source: "photos_popup",
        });
      }

      // Mark calendar event complete
      await supabase.from("calendar_events").update({
        is_completed: true,
        completed_at: new Date().toISOString(),
      }).eq("id", eventId);

      toast({ title: "Photos uploaded! 📸" });
      setTimeout(() => {
        onCompleted();
        onClose();
      }, 400);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-base font-bold text-foreground">Add Progress Photos</h2>
          <div className="w-5" />
        </div>

        <div className="overflow-y-auto px-4 pb-4 space-y-5">
          {/* Icon + label */}
          <div className="flex flex-col items-center gap-2 py-3">
            <div className="h-14 w-14 rounded-2xl bg-primary/20 border-2 border-primary/40 flex items-center justify-center">
              <Camera className="h-6 w-6 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-foreground">Take Progress Photos</p>
              <p className="text-xs text-muted-foreground">Scheduled</p>
            </div>
          </div>

          {!showUpload ? (
            <>
              {/* Reference Image */}
              <div className="rounded-xl border border-primary/40 overflow-hidden">
                <img
                  src={referenceImage}
                  alt="Reference photo instructions showing front, side, and back poses"
                  className="w-full object-cover"
                />
                <div className="grid grid-cols-3 gap-1 p-2 bg-secondary/30">
                  <p className="text-[10px] text-center text-muted-foreground font-medium">Front View: Full Body, Relaxed.</p>
                  <p className="text-[10px] text-center text-muted-foreground font-medium">Side View: Full Body, Profile.</p>
                  <p className="text-[10px] text-center text-muted-foreground font-medium">Back View: Full Body.</p>
                </div>
              </div>

              {/* Instructions */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-foreground">Instructions:</p>
                {INSTRUCTIONS.map((step, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="h-5 w-5 rounded border border-muted-foreground/30 shrink-0 mt-0.5 flex items-center justify-center">
                      <span className="text-[10px] text-muted-foreground font-bold">{idx + 1}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{step}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* Upload slots */}
              <div className="grid grid-cols-3 gap-3">
                {photos.map((photo, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <button
                      onClick={() => inputRefs.current[idx]?.click()}
                      className="relative w-full aspect-square rounded-xl border-2 border-dashed border-primary/30 bg-secondary/30 flex flex-col items-center justify-center gap-1 hover:border-primary/50 transition-colors overflow-hidden"
                    >
                      {photo.preview ? (
                        <>
                          <img src={photo.preview} alt={photo.angle} className="absolute inset-0 w-full h-full object-cover rounded-xl" />
                          <button
                            onClick={(e) => { e.stopPropagation(); removePhoto(idx); }}
                            className="absolute top-1 right-1 h-5 w-5 rounded-full bg-background/80 flex items-center justify-center z-10"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </>
                      ) : (
                        <>
                          <Plus className="h-5 w-5 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">{SLOTS[idx].label}</span>
                        </>
                      )}
                    </button>
                    <input
                      ref={el => { inputRefs.current[idx] = el; }}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileSelect(idx, file);
                        e.target.value = "";
                      }}
                    />
                    {photo.file && (
                      <Select
                        value={photo.angle}
                        onValueChange={(val) => {
                          setPhotos(prev => {
                            const updated = [...prev];
                            updated[idx] = { ...updated[idx], angle: val as Angle };
                            return updated;
                          });
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="front">Front</SelectItem>
                          <SelectItem value="side">Side</SelectItem>
                          <SelectItem value="back">Back</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Tap any slot to add or change a photo. Label each with the correct angle.
              </p>

              {error && (
                <p className="text-xs text-destructive text-center">{error}</p>
              )}
            </>
          )}
        </div>

        <DrawerFooter className="pt-2">
          {!showUpload ? (
            <Button
              onClick={handleAddPhotos}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              size="lg"
            >
              Add Photos
            </Button>
          ) : (
            <Button
              onClick={handleDone}
              disabled={uploading}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              size="lg"
            >
              {uploading ? "Uploading..." : "Done — Upload Photos"}
            </Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export default PhotosPopup;
