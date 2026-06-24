import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Loader2, Send, X } from "lucide-react";
import { compressImage } from "@/lib/performance";

interface AttachmentPreviewDialogProps {
  file: File | null;
  threadId: string;
  onClose: () => void;
  onSent: () => void;
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE = 200 * 1024 * 1024;
const MAX_PDF_SIZE = 20 * 1024 * 1024;
const MAX_VIDEO_DURATION = 59;

type AttachmentType = "image" | "video" | "pdf";

function classify(file: File): AttachmentType | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type === "application/pdf") return "pdf";
  // Fallback to extension
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext && ["jpg", "jpeg", "png", "webp", "heic", "heif", "gif"].includes(ext)) return "image";
  if (ext && ["mp4", "mov", "webm", "m4v"].includes(ext)) return "video";
  if (ext === "pdf") return "pdf";
  return null;
}

const validateVideoDuration = (file: File, toast: ReturnType<typeof useToast>["toast"]): Promise<boolean> =>
  new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      if (video.duration > MAX_VIDEO_DURATION) {
        toast({
          title: "Video too long",
          description: "Video must be under 1 minute. Shorten video and reupload.",
          variant: "destructive",
        });
        resolve(false);
      } else {
        resolve(true);
      }
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      toast({ title: "Invalid video", description: "Could not read video file.", variant: "destructive" });
      resolve(false);
    };
    video.src = URL.createObjectURL(file);
  });

const AttachmentPreviewDialog = ({ file, threadId, onClose, onSent }: AttachmentPreviewDialogProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [caption, setCaption] = useState("");
  const [sending, setSending] = useState(false);

  const type = useMemo<AttachmentType | null>(() => (file ? classify(file) : null), [file]);

  const previewUrl = useMemo(() => {
    if (!file || !type || type === "pdf") return null;
    return URL.createObjectURL(file);
  }, [file, type]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Reset caption when file changes
  useEffect(() => {
    setCaption("");
  }, [file]);

  if (!file) return null;

  if (!type) {
    // Unsupported type — show a toast and bail
    toast({
      title: "Unsupported file",
      description: "Only photos, videos, and PDFs can be sent.",
      variant: "destructive",
    });
    onClose();
    return null;
  }

  const handleSend = async () => {
    if (!user || !type) return;
    setSending(true);
    try {
      // Size validation
      if (type === "image" && file.size > MAX_IMAGE_SIZE) {
        toast({ title: "File too large", description: "Images must be under 10MB.", variant: "destructive" });
        return;
      }
      if (type === "video" && file.size > MAX_VIDEO_SIZE) {
        toast({ title: "File too large", description: "Videos must be under 200MB.", variant: "destructive" });
        return;
      }
      if (type === "pdf" && file.size > MAX_PDF_SIZE) {
        toast({ title: "File too large", description: "PDFs must be under 20MB.", variant: "destructive" });
        return;
      }

      // Video duration check
      if (type === "video") {
        const valid = await validateVideoDuration(file, toast);
        if (!valid) return;
      }

      // Compress images
      let uploadBlob: File | Blob = file;
      if (type === "image") {
        try {
          uploadBlob = await compressImage(file);
        } catch {
          // ignore, use original
        }
      }

      const ext = file.name.split(".").pop() || "bin";
      const path = `${threadId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("chat-attachments")
        .upload(path, uploadBlob, { contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: urlData } = await supabase.storage
        .from("chat-attachments")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (!urlData?.signedUrl) throw new Error("Failed to get file URL");

      const { error: msgError } = await supabase.from("thread_messages").insert({
        thread_id: threadId,
        sender_id: user.id,
        content: caption.trim(),
        attachment_url: urlData.signedUrl,
        attachment_type: type,
        attachment_name: file.name,
      } as any);
      if (msgError) throw msgError;

      onSent();
      onClose();
    } catch (err: any) {
      console.error("[AttachmentPreview] upload failed:", err);
      toast({
        title: "Upload failed",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const sizeKb = file.size / 1024;
  const sizeLabel = sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${Math.round(sizeKb)} KB`;

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && !sending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Send {type === "image" ? "Photo" : type === "video" ? "Video" : "PDF"}
          </DialogTitle>
        </DialogHeader>

        {/* Preview */}
        <div className="flex items-center justify-center rounded-lg bg-muted/40 p-3 max-h-[50vh] overflow-hidden">
          {type === "image" && previewUrl && (
            <img
              src={previewUrl}
              alt={file.name}
              className="max-h-[45vh] w-auto rounded-md object-contain"
            />
          )}
          {type === "video" && previewUrl && (
            <video
              src={previewUrl}
              controls
              className="max-h-[45vh] w-auto rounded-md"
            />
          )}
          {type === "pdf" && (
            <div className="flex flex-col items-center gap-2 py-6">
              <FileText className="h-12 w-12 text-primary" />
              <p className="text-sm font-medium text-foreground truncate max-w-[280px]">
                {file.name}
              </p>
              <p className="text-xs text-muted-foreground">{sizeLabel}</p>
            </div>
          )}
        </div>

        {type !== "pdf" && (
          <p className="text-xs text-muted-foreground truncate">
            {file.name} · {sizeLabel}
          </p>
        )}

        {/* Caption */}
        <Textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Add a caption (optional)"
          rows={2}
          className="resize-none text-[14px]"
          disabled={sending}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            <X className="h-4 w-4 mr-1.5" />
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-1.5" />
                Send
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AttachmentPreviewDialog;
