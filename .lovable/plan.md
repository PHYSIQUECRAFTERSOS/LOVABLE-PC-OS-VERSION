

# Fix Scan Food Label -- End-to-End

## Diagnosis

**Root cause of "nothing happens"**: iOS Safari blocks programmatic `input.click()` when it is not in the direct user gesture chain. In `ScanFoodLabelButton.tsx` lines 393 and 400, the code first closes the Drawer (`setShowPicker(false)`) which triggers a React re-render and Drawer dismissal animation, then uses a 100ms `setTimeout` to call `cameraInputRef.current?.click()`. By the time the timeout fires, iOS has invalidated the user gesture context, so the file picker silently fails to open.

Compare with `MealScanCapture.tsx` line 66 which uses `setTimeout(() => fileRef.current?.click(), 0)` from a direct button click inside a Dialog (no Drawer dismissal in between) -- that works because the gesture chain is still alive.

**Architecture is sound**: The edge function (`scan-food-label`) uses Lovable AI Gateway (Gemini Pro/Flash vision), is deployed, and correctly returns structured JSON. The client-side component has proper form pre-fill, duplicate detection, suspicious value warnings, and nutrition logging. The only break is the file picker never opening on mobile.

## Plan

### Step 1: Fix the file picker gesture chain (ScanFoodLabelButton.tsx)

The Drawer "Take Photo" and "Upload from Library" buttons must trigger the file input click BEFORE closing the Drawer, not after. Change lines 393 and 400:

**Current (broken)**:
```typescript
onClick={() => { setShowPicker(false); setTimeout(() => cameraInputRef.current?.click(), 100); }}
```

**Fixed**:
```typescript
onClick={() => { cameraInputRef.current?.click(); setShowPicker(false); }}
```

Same pattern for the library upload button -- click `fileInputRef` first, then close the Drawer. Remove the `setTimeout` wrapper entirely. This preserves the user gesture context so iOS Safari allows the file picker to open.

### Step 2: Verify edge function is deployed and responding

Use `supabase--curl_edge_functions` to send a test request to `scan-food-label` with a small base64 image payload to confirm the function is live and returning data. Check `supabase--edge_function_logs` for any recent errors.

### Step 3: Add image compression before upload (robustness)

The current code sends raw camera photos (potentially 5-10MB) as base64 to the edge function. Add `browser-image-compression` (already in the project, used by MealScanCapture) to compress images to 800px max dimension and 0.5MB before base64 conversion. This prevents timeouts on large images and matches the pattern used by MealScanCapture.

### Step 4: Verify all integration points are wired

Confirm that:
- The "All" tab Quick Action grid button (`setScanLabelOpen(true)`) correctly opens the headless ScanFoodLabelButton's Drawer
- The "Custom Foods" tab inline ScanFoodLabelButton (variant="full") also works
- Both paths flow through the same `handleImageSelected` callback
- After successful scan + save, `onLogged()` is called to refresh the nutrition tracker

### Files Modified
- `src/components/nutrition/ScanFoodLabelButton.tsx` -- fix gesture chain, add image compression

### Files NOT Modified
- Edge function (`supabase/functions/scan-food-label/index.ts`) -- already correct
- `AddFoodScreen.tsx` -- wiring is already correct
- `CreateFoodScreen.tsx` -- not involved in scan flow
- No database tables, RLS policies, or other components

