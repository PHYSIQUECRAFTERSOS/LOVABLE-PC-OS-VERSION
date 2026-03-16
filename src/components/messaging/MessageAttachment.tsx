import { useState } from "react";
import { FileText, Download, Play } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface MessageAttachmentProps {
  url: string;
  type: "image" | "video" | "pdf" | "audio";
  name?: string;
  isOwn: boolean;
}

const MessageAttachment = ({ url, type, name, isOwn }: MessageAttachmentProps) => {
  const [lightbox, setLightbox] = useState(false);

  if (type === "image") {
    return (
      <>
        <img
          src={url}
          alt={name || "Photo"}
          className="rounded-lg max-w-full max-h-60 object-cover cursor-pointer"
          onClick={() => setLightbox(true)}
          loading="lazy"
        />
        <Dialog open={lightbox} onOpenChange={setLightbox}>
          <DialogContent className="max-w-[90vw] max-h-[90vh] p-1 bg-black/90 border-none">
            <img src={url} alt={name || "Photo"} className="w-full h-full object-contain rounded" />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (type === "video") {
    return (
      <video
        src={url}
        controls
        preload="metadata"
        className="rounded-lg max-w-full max-h-60"
        playsInline
      >
        Your browser does not support video.
      </video>
    );
  }

  if (type === "pdf") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-sm border",
          isOwn ? "border-primary-foreground/20 text-primary-foreground" : "border-border text-foreground"
        )}
      >
        <FileText className="h-5 w-5 shrink-0" />
        <span className="truncate flex-1">{name || "Document.pdf"}</span>
        <Download className="h-4 w-4 shrink-0 opacity-60" />
      </a>
    );
  }

  return null;
};

export default MessageAttachment;
