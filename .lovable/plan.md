

# Plan: Fix Photos, Dashboard Sync, and Body Stats Visual Polish

## 4 Issues to Fix

### 1. Remove guide lines/labels from photo poses
**File: `src/components/dashboard/PhotosPopup.tsx`**

Delete lines 204-212 — the three overlay divs that render "Eyes" line, "Hip" line, and the vertical center line over the guide images. Also update the instruction text (line 222-224) to say "Match the pose shown above" instead of referencing "guiding lines". The uploaded pose images will display cleanly without any overlays.

### 2. "PICK PHOTO" should open photo library, not camera
**File: `src/components/dashboard/PhotosPopup.tsx`**

The problem: both "PICK PHOTO" and "TAKE NOW" buttons click the same `<input>` which has `capture="environment"` — this forces the camera on mobile.

Fix: use **two separate file inputs**:
- `pickInputRef`: `<input type="file" accept="image/*">` (no `capture` attribute → opens photo library)
- `cameraInputRef`: `<input type="file" accept="image/*" capture="environment">` (opens camera)

Wire "PICK PHOTO" to `pickInputRef` and "TAKE NOW" to `cameraInputRef`.

### 3. FAB-scheduled events don't appear on dashboard instantly
**File: `src/components/dashboard/QuickLogFAB.tsx`**

The issue