

# Fix Plan: White Space, Cardio Buttons, Daily XP Popup

## Issue 1: White Space at Bottom of Screen

**Root cause**: The `DrawerContent` in `drawer.tsx` uses `bg-background` which maps to `hsl(0 0% 7%)`. However, when the vaul drawer's `shouldScaleBackground` is enabled, it transforms the root content and can reveal the underlying browser viewport color. On iOS Capacitor, the area below the drawer (around the home indicator) may show the WKWebView's default background rather than the app's dark theme.

The bottom nav uses `safe-bottom` padding but the main content area and the root `<div>` may not fully cover the safe-area-inset-bottom gap on notched devices. The `pb-24` on `<main>` is generous, but the actual bottom nav `safe-bottom` class only adds *padding*, not background extension.

**Fix**: Add `safe-bottom` padding to the `DrawerFooter` so drawer buttons clear the home indicator. Also ensure the bottom nav background extends fully through the safe area by adding an explicit `bg-card` pseudo-element or using `pb-[env(safe-area-inset-bottom)]` directly on the nav. The CSS `safe-bottom` class already exists, so this is likely a drawer-specific issue where the footer content doesn't account for the home indicator bar.

**Files**: `src/components/dashboard/CardioPopup.tsx` (add safe-bottom to footer), `src/components/ui/drawer.tsx` (add safe-bottom padding to DrawerContent)

## Issue 2: Cardio Popup Cancel / Mark as Complete Buttons Not Working

**Root cause**: The previous fix added `data-vaul-no-drag` and `e.stopPropagation()` to `CardioPopup.tsx`. Looking at the current code (lines 230-245), the fix IS already applied. However, the vaul drawer's drag-to-dismiss gesture can still intercept `pointerdown`/`touchstart` events before the `click` fires on iOS.

The issue is that `data-vaul-no-drag` is on the `DrawerFooter` div, but vaul's internal gesture handler attaches at the `DrawerContent` level. On iOS Safari/WKWebView, the `touchstart` → `touchend` → `click` chain can be interrupted by the drawer's pan-recognizer even with `data-vaul-no-