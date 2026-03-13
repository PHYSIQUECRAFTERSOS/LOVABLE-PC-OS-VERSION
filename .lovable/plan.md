
Issue restatement (what is still broken):
1) In Add Food → Barcode, first open often shows a black camera preview until user manually stops/restarts.
2) Barcode detection works, but requires getting very close; scan speed/range is below expected “MyFitnessPal-like” behavior.

Do I know what the issue is?
Yes. The scanner startup path in `src/components/nutrition/BarcodeScanner.tsx` is fragile on mobile Safari: it initializes camera/decoder too early and without a camera warm-up + readiness check. It also uses default decoding/camera constraints (lower resolution/focus behavior), which hurts read speed/range.

Files to fix:
- `src/components/nutrition/BarcodeScanner.tsx` (primary)
- `src/components/nutrition/SupplementScanFlow.tsx` (same scanner pattern; patch for consistency and to prevent repeat regressions)

Implementation plan:
1) Rebuild scanner start sequence (black-screen fix)
- Add an explicit startup pipeline:
  - wait until `<video>` is mounted and visible
  - perform a short `getUserMedia` warm-up request on open
  - re-enumerate devices after permission
  - start decode only after video is ready (`readyState`, `videoWidth/videoHeight` checks)
- Keep current UX (auto-start on modal open), but add internal retry so user does not need manual stop/start.

2) Add automatic black-screen recovery
- If preview is still black/not-ready after a short threshold, auto-restart once with fallback constraints/device selection.
- Surface a clear toast only after retries fail (not on first transient startup issue).

3) Improve instant scan performance and distance tolerance
- Configure decoder hints for product barcodes (`EAN_13`, `EAN_8`, `UPC_A`, `UPC_E`, `CODE_128`) + `TRY_HARDER`.
- Reduce decode interval to improve responsiveness.
- Use stronger camera constraints (environment-facing, higher ideal resolution, frame rate).
- Attempt autofocus-related constraints where supported (`focusMode: continuous`), without breaking unsupported browsers.

4) Preserve existing working behavior
- Do not change successful lookup/logging flow (`lookupBarcodeService`, nutrition insertion, macros flow).
- Only improve camera initialization + barcode decode behavior.

5) Apply same scanner hardening to supplement barcode flow
- Mirror startup/recovery improvements in `SupplementScanFlow.tsx` so the same first-open black-screen pattern doesn’t reappear there.

Technical details:
- Scanner control logic will explicitly manage:
  - `MediaStream` lifecycle (stop all tracks on close)
  - decoder lifecycle (`reset` + guard against double-start)
  - one in-flight startup token to prevent race conditions
- Device selection strategy:
  - prefer environment-facing
  - if labels unavailable, fallback by constraints instead of brittle label-only logic
- No backend/database schema changes required.

Validation plan (post-implementation):
1) Code-level validation
- Verify no duplicate scanner loops, no leaked tracks, and no stale refs after close/reopen.
- Confirm TypeScript safety for optional advanced constraints.

2) Runtime validation checklist on mobile
- First open of Add Food → Barcode shows live camera feed without manual restart.
- Scanning detects barcodes quickly at normal hand distance (no forced extreme close-up).
- Existing successful lookup + “Add to tracker” behavior remains unchanged.

3) Regression check
- Supplement barcode scan still opens and decodes normally after shared scanner hardening.
