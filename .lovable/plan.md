## Goal

Make the Training (and Meal Plan / Supplements) PDF preview show **every page** scrollable inside the existing in-app preview dialog — no Xcode rebuild, no App Store submission required. Save / Share / Download stay exactly as they work today.

## Why the current preview only shows page 1

`PdfExportPreviewDialog` renders the PDF via `<iframe src={blob}>`. On iOS Safari and inside the iOS WKWebView (the PWA), the built-in PDF viewer only paints the first page of a blob-URL PDF inside an iframe. Desktop Chrome happens to render all pages, which is why it looked fine there.

The native `QLPreviewController` plugin already fixes this, but it requires the Xcode rebuild + TestFlight/App Store cycle. To stay 100% web/PWA, we render the pages ourselves with **pdf.js** into a scrollable column of canvases.

## Plan

### 1. Add pdf.js
- Install `pdfjs-dist` (already a transitive dep of some PDF tooling; add it explicitly).
- Configure the worker via Vite-friendly `?url` import so it works in the Lovable preview and the published PWA without extra build config.

### 2. New component: `PdfCanvasPreview`
- Path: `src/components/common/PdfCanvasPreview.tsx`.
- Props: `{ blob: Blob }`.
- Behavior:
  - Loads the blob with `pdfjsLib.getDocument`.
  - Iterates every page, renders each into its own `<canvas>` at device-pixel-ratio scale.
  - Stacks them vertically in a scroll container with page numbers.
  - Shows a small loader while pages render; logs errors to console and shows an inline fallback message.
  - Cleans up the PDF document on unmount.

### 3. Update `PdfExportPreviewDialog`
- Replace the `<iframe>` block with `<PdfCanvasPreview blob={asset.blob} />`.
- Keep the dialog chrome, title, description, and the **Share PDF** button exactly as-is.
- Keep `sharePdf`, `openPdf`, `downloadPdf` logic untouched so saving works identically to today (Web Share API with file → fallback to opening / downloading the blob URL).
- Remove the iframe-based `printPdf` path (it relied on the iframe) — keep Share as the single primary action, matching current UI. No other call sites change.

### 4. Leave the native iOS path alone
- `ExportPdfButton` still calls `previewPdfNative` first when running inside the native shell. That code stays so a future native build keeps the QuickLook experience. In the browser PWA (what you want now), `isNativePdfPreviewAvailable()` is false, so it falls straight through to the new canvas preview.

### 5. Verification
- Open a client → Training → Export PDF in the Lovable preview at mobile viewport: confirm all pages scroll.
- Repeat for Meal Plan and Supplements: confirm preview still shows all pages and Share/Download still saves the same file you get today.
- Confirm no regression on desktop.

## Files

- `package.json` — add `pdfjs-dist`.
- `src/components/common/PdfCanvasPreview.tsx` — new.
- `src/components/common/PdfExportPreviewDialog.tsx` — swap iframe for `PdfCanvasPreview`, drop the print-via-iframe helper.
- No changes to `ExportPdfButton.tsx`, the export utilities, or the native plugin files.

## Out of scope

- No changes to PDF generation, filenames, or saving logic.
- No changes to the native iOS plugin or Capacitor config — nothing to rebuild in Xcode.
- No new database or backend work.
