# Fix "Could not render PDF preview" on iOS PWA

## Problem
The dialog loads the PDF (it correctly shows "Page 1 / 5"), but `page.render(...)` throws on iOS WKWebView, so all canvases stay blank and the red error banner appears. Two root causes:

1. We import from `pdfjs-dist` (modern build), which in v6 uses JS features (e.g. `Promise.withResolvers`, modern module worker) that older iOS Safari / WKWebView versions don't fully support during rendering.
2. In `pdfjs-dist` v6, `page.render({ canvasContext, viewport })` is deprecated — the canvas must be passed explicitly. On iOS this fails hard instead of falling back.

## Fix (web-only — no native rebuild, no App Store submission)

### 1. `src/components/common/PdfCanvasPreview.tsx`
- Import from the **legacy** build:
  - `import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs"`
  - `import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"`
- Set `GlobalWorkerOptions.workerSrc = pdfWorkerUrl` once at module load.
- In the render loop:
  - Create the canvas as today.
  - Call `page.render({ canvas, canvasContext: ctx, viewport }).promise` (pass both for safety).
  - Clamp `scale * dpr` so the final canvas area stays under ~16,000,000 pixels to avoid iOS canvas-memory errors on long/high-DPI pages.
- Keep the existing loader, per-page "Page X / N" label, error banner, and cleanup (`pdfDoc.destroy()`, `cancelled` flag) unchanged.

### 2. No other files change
- `PdfExportPreviewDialog.tsx`, `ExportPdfButton.tsx`, the native `PdfPreviewPlugin.swift`, and `capacitor.config.ts` are untouched.
- Share / Download / Open behavior is identical to today.

## Verification
- In the Lovable preview at mobile viewport, open Coach → a client → Meal Plan → Export PDF: all 5 pages should render stacked and scroll.
- Same check for Supplements (3 pages) and Training program.
- Share PDF still produces the same file as before.

## Out of scope
No changes to PDF generation, file names, native iOS plugin, Capacitor config, or backend.
