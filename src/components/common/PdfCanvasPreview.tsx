import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { loadPdfjsLegacy } from "@/lib/lazyPdfjs";

// iOS WKWebView caps canvas memory; keep total pixels under ~16M.
const MAX_CANVAS_PIXELS = 16_000_000;

interface Props {
  blob: Blob;
}

const PdfCanvasPreview = ({ blob }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let pdfDoc: any = null;

    const render = async () => {
      setLoading(true);
      setError(null);
      try {
        const pdfjsLib: any = await loadPdfjsLegacy();
        const buf = await blob.arrayBuffer();
        if (cancelled) return;
        const loadingTask = pdfjsLib.getDocument({ data: buf });
        pdfDoc = await loadingTask.promise;
        if (cancelled) return;

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = "";
        setPageCount(pdfDoc.numPages);

        const containerWidth = container.clientWidth || 600;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        for (let i = 1; i <= pdfDoc.numPages; i++) {
          if (cancelled) return;
          const page = await pdfDoc.getPage(i);
          const baseViewport = page.getViewport({ scale: 1 });
          let scale = ((containerWidth - 16) / baseViewport.width) * dpr;
          // Clamp so width * height stays under MAX_CANVAS_PIXELS
          const projectedPixels = baseViewport.width * scale * baseViewport.height * scale;
          if (projectedPixels > MAX_CANVAS_PIXELS) {
            scale *= Math.sqrt(MAX_CANVAS_PIXELS / projectedPixels);
          }
          const viewport = page.getViewport({ scale });

          const wrapper = document.createElement("div");
          wrapper.className = "relative mb-3 rounded-md bg-white shadow-sm";

          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.style.display = "block";

          const label = document.createElement("div");
          label.className =
            "absolute top-1 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white";
          label.textContent = `Page ${i} / ${pdfDoc.numPages}`;

          wrapper.appendChild(canvas);
          wrapper.appendChild(label);
          container.appendChild(wrapper);

          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          // pdfjs v6: pass `canvas` explicitly (canvasContext-only is deprecated
          // and throws on iOS WKWebView).
          await page.render({ canvas, canvasContext: ctx, viewport } as any).promise;
        }
        if (!cancelled) setLoading(false);
      } catch (err: any) {
        console.error("[PdfCanvasPreview] render failed", err);
        if (!cancelled) {
          setError("Could not render PDF preview. You can still share or download it.");
          setLoading(false);
        }
      }
    };

    render();

    return () => {
      cancelled = true;
      try {
        pdfDoc?.destroy?.();
      } catch {}
    };
  }, [blob]);

  return (
    <div className="relative h-full w-full overflow-y-auto bg-muted/30 p-2">
      <div ref={containerRef} className="mx-auto max-w-3xl" />
      {loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/40">
          <div className="flex items-center gap-2 rounded-md bg-background/90 px-3 py-2 text-sm text-muted-foreground shadow">
            <Loader2 className="h-4 w-4 animate-spin" />
            Rendering {pageCount ? `${pageCount} page${pageCount > 1 ? "s" : ""}` : "PDF"}...
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-x-0 bottom-2 mx-auto max-w-md rounded-md bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">
          {error}
        </div>
      )}
    </div>
  );
};

export default PdfCanvasPreview;
