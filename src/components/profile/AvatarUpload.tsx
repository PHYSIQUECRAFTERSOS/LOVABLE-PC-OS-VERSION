import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Camera, Trash2, Loader2 } from "lucide-react";
import UserAvatar from "./UserAvatar";

interface AvatarUploadProps {
  currentUrl?: string | null;
  fullName?: string;
  onUploaded: (url: string | null) => void;
}

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"];

const compressAndCropImage = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const size = Math.min(img.width, img.height);
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;

      // Create thumbnail (256px) and full (512px)
      const outputSize = 512;
      const canvas = document.createElement("canvas");
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas not supported"));
      ctx.drawImage(img, sx, sy, size, size, 0, 0, outputSize, outputSize);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Compression failed"));
          resolve(blob);
        },
        "image/jpeg",
        0.85
      );
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
};

const AvatarUpload = ({ currentUrl, fullName, onUploaded }: AvatarUploadProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast({ title: "Invalid format", description: "Please use JPG, PNG, or HEIC.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_SIZE) {
      toast({ title: "File too large", description: "Max 5MB allowed.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const compressed = await compressAndCropImage(file);
      const path = `${user.id}/avatar.jpg`;

      // Remove old file first (ignore error if not found)
      await supabase.storage.from("avatars").remove([path]);

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, compressed, { contentType: "image/jpeg", upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("user_id", user.id);
      onUploaded(publicUrl);
      toast({ title: "Profile photo updated" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    if (!user) return;
    setUploading(true);
    try {
      await supabase.storage.from("avatars").remove([`${user.id}/avatar.jpg`]);
      await supabase.from("profiles").update({ avatar_url: null }).eq("user_id", user.id);
      onUploaded(null);
      toast({ title: "Profile photo removed" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <UserAvatar src={currentUrl} name={fullName} className="h-20 w-20 text-lg" />
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
          onChange={handleFile}
          className="hidden"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="gap-2"
        >
          <Camera className="h-4 w-4" />
          {currentUrl ? "Change Photo" : "Upload Photo"}
        </Button>
        {currentUrl && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            disabled={uploading}
            className="gap-2 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Remove
          </Button>
        )}
      </div>
    </div>
  );
};

export default AvatarUpload;
