## Why Export PDF silently fails on mobile

`savePdf()` in `src/utils/pdf/brandedPdf.ts` already tries a Capacitor branch, but **`@capacitor/filesystem` and `@capacitor/share` are not installed**. So on the native build the dynamic `import()` returns `null`, the code silently falls through to `doc.save()` (jsPDF's anchor-click), which is a no-op inside WKWebView/Android WebView — the toast says "PDF ready" but no file lands anywhere.

Same fix applies to all three buttons (`meal-plan`, `supplements`, `training`) because they all funnel through `savePdf()`.

## What I'll change

1. **Install plugins**: `@capacitor/filesystem` and `@capacitor/share`.
2. **Rewrite `savePdf()`** to write the PDF directly to a user-visible folder, no share sheet:
   - **iOS** → `Directory.Documents` (shows up in **Files app → On My iPhone → Physique Crafters**).
   - **Android** → `Directory.ExternalStorage` at path `Download/<filename>.pdf` (shows up in **Files / Downloads folder**).
   - After writing, show a toast: *"Saved to Files: Kevin-MealPlan-2026-06-10.pdf"* with a **"Open"** action that calls `Share.share({ url })` so the user can preview/move it if they want (optional, not a share sheet on save).
3. **Web fallback unchanged** (`doc.save()` works fine in desktop browsers).
4. **PWA-on-mobile fallback** (non-native browsers): build a blob, open via `window.open(URL.createObjectURL(blob))` so iOS Safari / Android Chrome render the PDF and the user can hit the browser's Save button. This avoids the broken anchor-download path inside standalone PWA mode.
5. **Native sync reminder**: after the install, you'll need to `git pull` and run `npx cap sync` locally so the new plugins are linked into the Xcode/Android Studio projects before rebuilding the native app.

## Files touched

- `src/utils/pdf/brandedPdf.ts` — replace the `savePdf` body with the new tiered logic.
- `package.json` / lockfile — add two Capacitor plugins.

No DB changes. No RLS changes. No edits to the three exporter files (`exportMealPlanPdf.ts`, `exportSupplementsPdf.ts`, `exportTrainingPdf.ts`) — they already share `savePdf()`.

## Non-goals

- No share sheet on Android (per your choice). Share is only exposed as an optional toast action after the file is saved.
- No new permissions prompts beyond what Capacitor Filesystem already declares.
