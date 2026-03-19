import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { withTimeout, TIMEOUTS } from "@/lib/performance";
import { Camera, Trash2, Loader2 } from "lucide-react";
import UserAvatar from "./UserAvatar";

interface AvatarUploadProps {
  currentUrl?: string | null;
  fullName?: string;
  onUploaded: (url: string | null) => void;
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_RAW_SIZE = 10 * 1024 * 1024; // 10MB raw limit

const compressImage = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const start = performance.now();
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
          console.log(`[Perf] Avatar compress: ${(performance.now() - start).toFixed(0)}ms, ${(blob.size / 1024).toFixed(0)}KB`);
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

const AvatarUpload = ({ currentUrl, fullName, onUploaded }: AvatarUploadProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [optimisticUrl, setOptimisticUrl] = useState<string | null>(null);

  const displayUrl = optimisticUrl || currentUrl;

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validate type
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast({ title: "Invalid format", description: "Use JPG, PNG, or WebP.", variant: "destructive" });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (file.size > MAX_RAW_SIZE) {
      toast({ title: "File too large", description: "Max 10MB before compression.", variant: "destructive" });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploading(true);
    const totalStart = performance.now();

    try {
      // Step 1: Compress
      const compressed = await compressImage(file);

      // Step 2: Optimistic preview
      const localPreview = URL.createObjectURL(compressed);
      setOptimisticUrl(localPreview);

      // Step 3: Upload with timeout
      const path = `${user.id}/avatar.jpg`;

      const uploadStart = performance.now();
      const { error: uploadError } = await withTimeout(
        Promise.resolve(
          supabase.storage
            .from("avatars")
            .upload(path, compressed, { contentType: "image/jpeg", upsert: true })
        ),
        TIMEOUTS.UPLOAD,
        "avatar-upload"
      );
      console.log(`[Perf] Avatar upload: ${(performance.now() - uploadStart).toFixed(0)}ms`);

      if (uploadError) throw uploadError;

      // Step 4: Get URL and update profile
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      await withTimeout(
        Promise.resolve(
          supabase.from("profiles").update({ avatar_url: publicUrl }).eq("user_id", user.id)
        ),
        TIMEOUTS.STANDARD_API,
        "avatar-profile-update"
      );

      // Clean up optimistic preview, set real URL
      URL.revokeObjectURL(localPreview);
      setOptimisticUrl(null);
      onUploaded(publicUrl);

      console.log(`[Perf] Avatar total: ${(performance.now() - totalStart).toFixed(0)}ms`);
      toast({ title: "Profile photo updated ✓" });
    } catch (err: any) {
      // Revert optimistic
      setOptimisticUrl(null);
      const msg = err?.message?.includes("timed out")
        ? "Upload timed out. Try again."
        : err?.message || "Upload failed";
      console.error("[Avatar] Upload failed:", msg);
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [user, toast, onUploaded]);

  const handleRemove = useCallback(async () => {
    if (!user) return;
    setUploading(true);
    try {
      await supabase.storage.from("avatars").remove([`${user.id}/avatar.jpg`]);
      await supabase.from("profiles").update({ avatar_url: null }).eq("user_id", user.id);
      setOptimisticUrl(null);
      onUploaded(null);
      toast({ title: "Profile photo removed" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [user, toast, onUploaded]);

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <UserAvatar src={displayUrl} name={fullName} className="h-20 w-20 text-lg" />
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
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          onChange={handleFile}
          className="hidden"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            try { setTimeout(() => { try { inputRef.current?.click(); } catch (e) { console.warn("[AvatarUpload] File picker error:", e); } }, 0); } catch (e) { console.warn("[AvatarUpload] File picker error:", e); }
          }}
          disabled={uploading}
          className="gap-2"
        >
          <Camera className="h-4 w-4" />
          {displayUrl ? "Change Photo" : "Upload Photo"}
        </Button>
        {displayUrl && !optimisticUrl && (
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
