import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { exportMealPlanPdf } from "@/utils/pdf/exportMealPlanPdf";
import { exportSupplementsPdf } from "@/utils/pdf/exportSupplementsPdf";
import { exportTrainingPdf } from "@/utils/pdf/exportTrainingPdf";

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

  const handleClick = async () => {
    if (!clientId) {
      toast.error("Plan not loaded yet — try again in a moment.");
      return;
    }

    // CRITICAL: open the placeholder tab synchronously inside the user-gesture.
    // iOS Safari (esp. PWA standalone) blocks window.open after any `await`.
    // We hand this pre-opened window down to savePdf which will navigate it to
    // a data: URI once the PDF is generated. Desktop/native ignore it.
    const ua = navigator.userAgent || "";
    const capCore: any = (window as any).Capacitor;
    const isNative = !!capCore?.isNativePlatform?.();
    const isMobileWeb = !isNative && /iPhone|iPad|iPod|Android/i.test(ua);
    let preWin: Window | null = null;
    if (isMobileWeb) {
      try {
        preWin = window.open("about:blank", "_blank");
        if (preWin) {
          try {
            preWin.document.write(
              '<title>Generating PDF…</title><body style="background:#0a0a0a;color:#D4A017;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">Generating PDF…</body>'
            );
          } catch { /* cross-origin or sandbox — ignore */ }
        }
      } catch { /* popup blocked */ }
    }

    setLoading(true);
    try {
      const res =
        kind === "meal-plan"
          ? await exportMealPlanPdf(clientId, { preWin })
          : kind === "supplements"
          ? await exportSupplementsPdf(clientId, { preWin })
          : await exportTrainingPdf(clientId, { preWin });
      if (!res.ok) {
        try { preWin?.close(); } catch { /* noop */ }
        toast.error(res.reason || "Nothing to export yet.");
        return;
      }
      toast.success(`${KIND_LABEL[kind]} PDF ready.`);
    } catch (err: any) {
      try { preWin?.close(); } catch { /* noop */ }
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
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="bottom">Download {KIND_LABEL[kind]} as PDF</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default ExportPdfButton;
