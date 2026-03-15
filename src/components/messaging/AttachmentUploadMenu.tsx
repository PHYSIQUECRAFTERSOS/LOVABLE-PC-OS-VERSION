import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Paperclip, Image, Video, FileText, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { compressImage } from "@/lib/performance";

interface AttachmentUploadMenuProps {
  threadId: string;
  onSent: () => void;
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE = 200 * 1024 * 1024;
const MAX_PDF_SIZE = 20 * 1024 * 1024;
const MAX_VIDEO_DURATION = 59;

const AttachmentUploadMenu = ({ threadId, onSent }: AttachmentUploadMenuProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  const validateVideoDuration = (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
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
  };

  const uploadFile = async (file: File, type: "image" | "video" | "pdf") => {
    if (!user) return;
    setUploading(true);
    setOpen(false);

    try {
      // Validate sizes
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
        const valid = await validateVideoDuration(file);
        if (!valid) return;
      }

      // Compress images
      let uploadBlob: File | Blob = file;
      if (type === "image") {
        try {
          uploadBlob = await compressImage(file);
        } catch {
          // Use original if compression fails
        }
      }

      const ext = file.name.split(".").pop() || "bin";
      const path = `${threadId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("chat-attachments")
        .upload(path, uploadBlob, { contentType: file.type });

      if (uploadError) throw uploadError;

      // Get signed URL (1 year)
      const { data: urlData } = await supabase.storage
        .from("chat-attachments")
        .createSignedUrl(path, 60 * 60 * 24 * 365);

      if (!urlData?.signedUrl) throw new Error("Failed to get file URL");

      // Insert message with attachment
      const { error: msgError } = await supabase.from("thread_messages").insert({
        thread_id: threadId,
        sender_id: user.id,
        content: "",
        attachment_url: urlData.signedUrl,
        attachment_type: type,
        attachment_name: file.name,
      } as any);

      if (msgError) throw msgError;
      onSent();
    } catch (err: any) {
      console.error("Upload failed:", err);
      toast({ title: "Upload failed", description: err.message || "Please try again.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (type: "image" | "video" | "pdf") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file, type);
    e.target.value = "";
  };

  if (uploading) {
    return (
      <div className="flex items-center justify-center h-10 w-10">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect("image")} />
      <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={handleFileSelect("video")} />
      <input ref={pdfRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileSelect("pdf")} />

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="shrink-0 h-10 w-10">
            <Paperclip className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-48 p-1">
          <button
            className="flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors"
            onClick={() => { setOpen(false); imageRef.current?.click(); }}
          >
            <Image className="h-4 w-4 text-primary" />
            Upload Photo
          </button>
          <button
            className="flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors"
            onClick={() => { setOpen(false); videoRef.current?.click(); }}
          >
            <Video className="h-4 w-4 text-primary" />
            Upload Video
          </button>
          <button
            className="flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors"
            onClick={() => { setOpen(false); pdfRef.current?.click(); }}
          >
            <FileText className="h-4 w-4 text-primary" />
            Upload PDF
          </button>
        </PopoverContent>
      </Popover>
    </>
  );
};

export default AttachmentUploadMenu;
