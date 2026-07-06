# Physique Crafters OS: Lazy-Load Heavy Dependencies (Bundle Fix, Step 1 of 3 safe wins)

## STOP. SCOPE THIS TIGHTLY.

This is the first of three approved safe performance wins from the read-only audit. Implement ONLY this change: make four heavy libraries load on demand instead of in the initial bundle. Do NOT change any feature's behavior, do NOT touch images, monitoring, RLS, indexes, virtualization, or the Overview snapshot idea, those are separate items. Do NOT revert the completed Step 1 fan-out, Step 2 Master Libraries fix, or the collapsible Command Center sections. If you find yourself editing feature logic rather than import mechanics, stop and report.

## ROLE

You are a senior full stack engineer working inside my Lovable project for "Physique Crafters OS" (React, TypeScript, Vite, Supabase). Make one precise bundle-size change.

## CONFIRMED FINDING (from the read-only audit)

The production build ships a large "deps" chunk (about 3.39 MB raw / 913 KB gzip) that is downloaded on every page load. It contains heavy libraries that most pages never use:

- `@ffmpeg/core` and `@ffmpeg/ffmpeg` (about 1 MB), used only by `src/lib/audioTranscode.ts`.
- `zxing/library`, the barcode scanner, used only on the scan screen.
- `emoji-picker-react`, used only in the messaging composer.
- `pdfjs-dist`, the PDF engine, used only at the PDF preview / export call site. These are being pulled into the eager bundle because they are statically imported. Loading them on demand instead is the single biggest first-load win, and it is safe because feature behavior does not change.

## THE CHANGE

Convert each of these four libraries from a static top-level import to an on-demand dynamic import at its call site, so it downloads only when the user first triggers that feature.

1. `@ffmpeg/*` in `src/lib/audioTranscode.ts`: load via `await import(...)` inside the function that actually transcodes, on first use. Cache the loaded module so repeat calls do not re-import.
2. `zxing/library`: dynamic-import it when the barcode scanner is opened, not at module top level.
3. `emoji-picker-react`: load the picker component with `React.lazy` plus a `Suspense` fallback so it only downloads when the emoji picker is opened in the messaging composer.
4. `pdfjs-dist`: dynamic-import it at the PDF preview / export call site only. Leave `jspdf` and `html2canvas` as they are if they are already split into the `pdf` chunk; only address `pdfjs-dist` if it is leaking into the eager `deps` chunk.

Where a dynamic import introduces a brief pause before the feature is ready (ffmpeg especially), show a small loading indicator so the user gets feedback instead of a dead moment.

## BUILD CONFIG NOTE

The primary change is the dynamic imports above. If, after making them dynamic, the production build still bundles any of these four into an eager chunk because of a `manualChunks` catch-all rule in `vite.config.ts`, make only the minimal `manualChunks` adjustment needed to let these four libraries code-split into their own async chunks. Do not otherwise restructure the build config, and report exactly what you changed.

## IMPLEMENTATION CONSTRAINTS

- Change import mechanics only. Do NOT change what any of these features do or how they behave once loaded.
- Do NOT touch avatar/image rendering, monitoring, RLS, indexes, schema, or any other roadmap item.
- Do NOT alter the Step 1 fan-out (`Promise.allSettled` plus `unwrap` plus 30 s), the Step 2 batch query, or the collapsible sections.
- Cache each dynamically imported module after first load so features do not re-download it on every use.
- Use `Promise.allSettled`, never `Promise.all`, if any parallel loading is introduced.
- Preserve `en-CA` local date formatting anywhere dates are touched.
- "Track Water" and `water_logs` are out of scope here. If encountered, leave them for a separate flagged item, do not act on them.

## ACCEPTANCE CRITERIA (all mandatory)

1. A fresh production build shows `@ffmpeg/*`, `zxing/library`, `emoji-picker-react`, and `pdfjs-dist` are no longer in the eager initial bundle, and each now loads as its own async chunk.
2. Report the `deps` chunk gzip size before and after. It must be measurably smaller.
3. Each feature still works end to end, just loading its library on first use: audio transcode, barcode scan, emoji picker in messaging, and PDF preview / export.
4. No feature logic changed beyond the import mechanism.
5. The production build completes with no new errors or warnings.
6. The Step 1 fan-out, Step 2 batch fix, and collapsible sections are unchanged.

## DO NOT TOUCH

- Avatar/image handling, Web Vitals monitoring, RLS policies, indexes, schema, virtualization, and the Overview snapshot idea (all separate roadmap items).
- Feature behavior for transcode, scanning, emoji, or PDF beyond how the library is loaded.
- The rest of `vite.config.ts` beyond the minimal `manualChunks` change, if any, needed for these four libraries.
- `getDisplayPosition()`, the `calendar_events` source-of-truth rule, `en-CA` formatting.
- `water_logs` / water tracking (flagged separately).

## AFTER IMPLEMENTING, REPORT

- Which files changed and how each of the four libraries is now loaded.
- The `deps` chunk gzip size before and after, and the new async chunk sizes for the four libraries.
- Whether any `manualChunks` change was needed, and exactly what it was.
- A short checklist confirming each of the four features still works: transcode, barcode scan, emoji picker, PDF preview / export.
- Do not proceed to the image transform or monitoring steps. Those are separate approved prompts.