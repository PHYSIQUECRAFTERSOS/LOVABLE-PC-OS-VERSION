## Goal
Make Training, Meal Plan, and Supplements PDF export work reliably on iPhone without requiring a new Xcode/native build.

## What is likely wrong
The current approach still depends on a new tab/data-URI navigation after async PDF generation. iOS Safari and especially iOS standalone PWAs are unreliable with that pattern: the placeholder tab can be blocked, detached from the original gesture, or fail to render a large `data:application/pdf` URL. The success toast can appear even though the user never actually receives a usable PDF.

## Game plan

### 1. Replace the iPhone export path with an in-app PDF preview modal
- Keep the export click inside the current app instead of relying on `window.open`, `data:` URLs, or native Capacitor plugins.
- Generate the PDF as a `Blob`/object URL.
- Show a full-screen mobile sheet/modal with:
  - PDF preview embedded in the app
  - `Share / Open PDF` button
  - `Download` fallback button
  - `Print` fallback button
  - clear failure state if Safari blocks one path

### 2. Use browser-native sharing when available
- On iPhone web/PWA, try `navigator.share()` with a real PDF `File` object.
- This uses Safari’s system share sheet without a native rebuild.
- If file sharing is unavailable or rejected, fall back to opening the object URL from a direct user tap inside the modal.

### 3. Stop showing success until a usable action is available
- Change `ExportPdfButton` so it does not toast “PDF ready” immediately after generation if the file was not opened/shared.
- Instead, show the preview modal and only show success after the user taps Share/Open/Download or the preview loads.

### 4. Apply the same flow everywhere
- Update the shared PDF helper, not just one screen, so these all use the same robust path:
  - Training export
  - Meal Plan export
  - Supplements export
- Keep desktop behavior simple with normal `doc.save(filename)`.
- Keep existing native Capacitor save/share attempt as a best-effort fallback, but do not depend on a new native build.

### 5. Add instrumentation for the repeated iPhone failure
- Add focused console logs around:
  - platform detection
  - PDF blob creation
  - preview URL creation
  - share support / share failure
  - open/download fallback failure
- This gives us useful evidence if iOS still blocks a specific path.

### 6. Test on mobile preview before handing back
- Use the mobile browser preview size to verify the buttons render and the modal flow appears.
- Test Training and Supplements export clicks in the client UI.
- Check console/network errors after export attempts.
- Since the preview browser is not real iOS Safari, I’ll validate the web flow here and leave the iOS-specific fallback logging in place for the actual device.

## Files expected to change
- `src/components/common/ExportPdfButton.tsx`
- `src/utils/pdf/brandedPdf.ts`
- Possibly a small new reusable component such as `src/components/common/PdfExportPreviewDialog.tsx`

## No backend or native changes
- No database migration.
- No new dependency.
- No Xcode/native rebuild required.