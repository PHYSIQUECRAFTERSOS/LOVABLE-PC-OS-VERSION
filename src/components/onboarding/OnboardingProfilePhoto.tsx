import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Camera, User, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

interface Props {
  onComplete: () => void;
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_RAW_SIZE = 10 * 1024 * 1024;

const compressImage = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const size = Math.min(img.width, img.height);
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas not supported"));
      ctx.drawImage(img, sx, sy, size, size, 0, 0, 512, 512);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Compression failed"));
          resolve(blob);
        },
        "image/jpeg",
        0.75
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
};

const OnboardingProfilePhoto = ({ onComplete }: Props) => {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Please use JPG, PNG, or WebP format.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (file.size > MAX_RAW_SIZE) {
      toast.error("File too large. Max 10MB.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const localPreview = URL.createObjectURL(compressed);
      setPreviewUrl(localPreview);

      const path = `${user.id}/avatar.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, compressed, { contentType: "image/jpeg", upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("user_id", user.id);

      if (updateError) throw updateError;

      URL.revokeObjectURL(localPreview);
      setPreviewUrl(publicUrl);
      setUploaded(true);
      toast.success("Profile photo saved!");
    } catch (err: any) {
      setPreviewUrl(null);
      toast.error(err.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [user]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm flex flex-col items-center text-center space-y-8">
        {/* Avatar circle */}
        <div className="relative">
          <div className="h-40 w-40 rounded-full border-2 border-dashed border-primary/50 flex items-center justify-center overflow-hidden bg-secondary/30">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Profile preview"
                className="h-full w-full object-cover rounded-full"
              />
            ) : (
              <User className="h-16 w-16 text-muted-foreground/40" />
            )}
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}
            {uploaded && !uploading && (
              <div className="absolute bottom-1 right-1 h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                <Check className="h-4 w-4 text-primary-foreground" />
              </div>
            )}
          </div>
        </div>

        {/* Copy */}
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-foreground">Set Your Profile Photo</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Add a profile photo so your coach can put a face to the name. You can always change this later.
          </p>
        </div>

        {/* Actions */}
        <div className="w-full space-y-3">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            capture="user"
            onChange={handleFile}
            className="hidden"
          />

          <Button
            className="w-full gap-2 h-12 text-base font-semibold"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            <Camera className="h-5 w-5" />
            {uploaded ? "RETAKE PHOTO" : "TAKE PROFILE PIC"}
          </Button>

          <Button
            variant="ghost"
            className="w-full text-muted-foreground hover:text-foreground"
            onClick={onComplete}
            disabled={uploading}
          >
            {uploaded ? "Continue →" : "Skip"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingProfilePhoto;
