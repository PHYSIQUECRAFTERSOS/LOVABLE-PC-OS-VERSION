import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { exportMealPlanPdf } from "@/utils/pdf/exportMealPlanPdf";
import { exportSupplementsPdf } from "@/utils/pdf/exportSupplementsPdf";
import { exportTrainingPdf } from "@/utils/pdf/exportTrainingPdf";
import PdfExportPreviewDialog, { type PdfPreviewAsset } from "@/components/common/PdfExportPreviewDialog";
import { isNativePdfPreviewAvailable, previewPdfNative } from "@/lib/nativePdfPreview";


type Kind = "meal-plan" | "supplements" | "training";

const KIND_LABEL: Record<Kind, string> = {
  "meal-plan": "Meal Plan",
  supplements: "Supplements",
  training: "Training Program",
};

interface Props {
  kind: Kind;
  clientId: string | undefined | null;
  /** Optional visual size tweaks */
  variant?: "icon" | "labeled";
  className?: string;
}

const ExportPdfButton = ({ kind, clientId, variant = "icon", className }: Props) => {
  const [loading, setLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pdfAsset, setPdfAsset] = useState<PdfPreviewAsset | null>(null);

  useEffect(() => {
    return () => {
      if (pdfAsset?.url) URL.revokeObjectURL(pdfAsset.url);
    };
  }, [pdfAsset]);

  const handleClick = async () => {
    if (!clientId) {
      toast.error("Plan not loaded yet — try again in a moment.");
      return;
    }

    const ua = navigator.userAgent || "";
    const capCore: any = (window as any).Capacitor;
    const isNative = !!capCore?.isNativePlatform?.();
    const isMobileDevice = isNative || /iPhone|iPad|iPod|Android/i.test(ua) || window.matchMedia?.("(pointer: coarse)")?.matches;
    const wantsNativePreview = isNativePdfPreviewAvailable();
    const wantsAsset = isMobileDevice || wantsNativePreview;
    console.info("[ExportPdfButton] export requested", { kind, clientId, isNative, isMobileDevice, wantsNativePreview, ua });

    setLoading(true);
    try {
      const res =
        kind === "meal-plan"
          ? await exportMealPlanPdf(clientId, { returnAsset: wantsAsset })
          : kind === "supplements"
          ? await exportSupplementsPdf(clientId, { returnAsset: wantsAsset })
          : await exportTrainingPdf(clientId, { returnAsset: wantsAsset });
      if (!res.ok) {
        toast.error(res.reason || "Nothing to export yet.");
        return;
      }

      const saveResult = res.saveResult;
      if (saveResult?.mode === "preview") {
        // On native iOS, present QLPreviewController so all pages are
        // scrollable — WKWebView's <iframe> renderer only paints page 1.
        if (wantsNativePreview) {
          const presented = await previewPdfNative(saveResult.asset.blob, saveResult.asset.filename);
          if (presented) {
            URL.revokeObjectURL(saveResult.asset.url);
            return;
          }
        }
        setPdfAsset((prev) => {
          if (prev?.url) URL.revokeObjectURL(prev.url);
          return saveResult.asset;
        });
        setPreviewOpen(true);
        return;
      }

      toast.success(`${KIND_LABEL[kind]} PDF ready.`);

    } catch (err: any) {
      console.error("[ExportPdfButton]", err);
      toast.error("Could not generate PDF. Try again.");
    } finally {
      setLoading(false);
    }
  };


  const button =
    variant === "labeled" ? (
      <Button
        size="sm"
        variant="outline"
        onClick={handleClick}
        disabled={loading || !clientId}
        className={`h-8 gap-1.5 border-primary/40 text-primary hover:bg-primary/10 ${className || ""}`}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
        Export PDF
      </Button>
    ) : (
      <Button
        size="icon"
        variant="ghost"
        onClick={handleClick}
        disabled={loading || !clientId}
        className={`h-8 w-8 text-primary hover:bg-primary/10 ${className || ""}`}
        aria-label={`Export ${KIND_LABEL[kind]} as PDF`}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
      </Button>
    );

  return (
    <>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="bottom">Download {KIND_LABEL[kind]} as PDF</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PdfExportPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        asset={pdfAsset}
        label={KIND_LABEL[kind]}
      />
    </>
  );
};

export default ExportPdfButton;
