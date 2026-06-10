import { useMemo, useRef } from "react";
import { Download, ExternalLink, Printer, Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface PdfPreviewAsset {
  filename: string;
  blob: Blob;
  url: string;
  file?: File;
  shareSupported?: boolean;
}

interface PdfExportPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: PdfPreviewAsset | null;
  label: string;
}

const PdfExportPreviewDialog = ({ open, onOpenChange, asset, label }: PdfExportPreviewDialogProps) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const previewUrl = useMemo(() => (asset ? `${asset.url}#toolbar=1&navpanes=0` : ""), [asset]);

  const sharePdf = async () => {
    if (!asset) return;
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    console.info("[PdfExportPreview] share requested", {
      filename: asset.filename,
      size: asset.blob.size,
      shareSupported: asset.shareSupported,
    });

    try {
      if (asset.file && typeof nav.share === "function" && (!nav.canShare || nav.canShare({ files: [asset.file] }))) {
        await nav.share({ title: label, files: [asset.file] });
        toast.success(`${label} PDF shared.`);
        return;
      }
      openPdf();
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        console.warn("[PdfExportPreview] share failed", err);
        toast.error("Share failed. Try Open PDF instead.");
      }
    }
  };

  const openPdf = () => {
    if (!asset) return;
    console.info("[PdfExportPreview] open requested", { filename: asset.filename, size: asset.blob.size });
    const opened = window.open(asset.url, "_blank", "noopener,noreferrer");
    if (!opened) {
      console.warn("[PdfExportPreview] popup blocked; navigating current tab to PDF");
      window.location.href = asset.url;
    }
  };

  const downloadPdf = () => {
    if (!asset) return;
    console.info("[PdfExportPreview] download requested", { filename: asset.filename, size: asset.blob.size });
    const anchor = document.createElement("a");
    anchor.href = asset.url;
    anchor.download = asset.filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    toast.success(`${label} PDF ready.`);
  };

  const printPdf = () => {
    if (!asset) return;
    console.info("[PdfExportPreview] print requested", { filename: asset.filename, size: asset.blob.size });
    try {
      frameRef.current?.contentWindow?.focus();
      frameRef.current?.contentWindow?.print();
    } catch (err) {
      console.warn("[PdfExportPreview] iframe print failed", err);
      openPdf();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92dvh] w-[96vw] max-w-4xl flex-col gap-3 overflow-hidden border-border bg-background p-3 sm:h-[88vh] sm:p-4">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="text-base text-foreground">{label} PDF</DialogTitle>
          <DialogDescription className="text-xs">{asset?.filename || "PDF export"}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
          {asset ? (
            <iframe
              ref={frameRef}
              title={`${label} PDF preview`}
              src={previewUrl}
              className="h-full min-h-[55dvh] w-full bg-background"
              onLoad={() => console.info("[PdfExportPreview] iframe loaded", { filename: asset.filename })}
            />
          ) : (
            <div className="flex h-full min-h-[55dvh] items-center justify-center text-sm text-muted-foreground">
              Preparing PDF...
            </div>
          )}
        </div>

        <div className="flex justify-center">
          <Button
            type="button"
            variant="default"
            onClick={sharePdf}
            disabled={!asset}
            className="h-14 w-full max-w-md gap-3 text-base font-semibold"
          >
            <Share2 className="h-5 w-5" /> Share PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PdfExportPreviewDialog;