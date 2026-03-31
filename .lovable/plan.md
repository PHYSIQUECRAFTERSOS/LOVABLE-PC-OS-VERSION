

## Fix Plan: iOS Overlay Layout + Bottom Nav Stability

### Root Causes Identified

**Bug 1 — Gray gap / content pushed down on AddFoodScreen:**
- Every overlay combines `fixed inset-0` (which already fills the viewport) with an inline `height: 100dvh` that computes to a different value on iOS Capacitor, creating a sizing conflict
- Safe-area padding is applied via inline `style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}` instead of using the existing `.safe-top` CSS class, which is unreliable in some iOS WebKit builds
- The overlay header adds `pt-4` (16px) on top of the safe-area padding, creating ~75px total offset vs ~59px in the app shell header

**Bug 2 — Bottom nav disappears after closing overlay:**
- Bottom nav uses `bg-card/95 backdrop-blur-sm` (semi-transparent + blur). After the OverlayPortal unmounts, iOS WebKit's GPU compositor fails to re-render this blurred translucent layer
- The repaint hook helps but cannot reliably fix compositor layer corruption from backdrop-blur

### Changes

**1. `src/index.css`** — Add a reusable `.overlay-fullscreen` utility class:
```css
.overlay-fullscreen {
  position: fixed;
  inset: 0;
  background-color: #0a0a0a;
  display: flex;
  flex-direction: column;
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  overscroll-behavior-y: contain;
}
```
This replaces the broken inline style pattern in every overlay with a single CSS class that works reliably on iOS WebKit.

**2. `src/components/AppLayout.tsx`** — Make bottom nav fully opaque:
- Change `bg-card/95 backdrop-blur-sm` to `bg-card` (solid background, no blur)
- This prevents the iOS compositor from losing track of the nav layer after overlay transitions

**3. All overlay files** (7 files, same mechanical change in each):
- Replace `className="fixed inset-0 z-[XX] bg-background flex flex-col ..."` + inline `style={{ paddingTop: ..., paddingBottom: ..., height: '100dvh', overscrollBehaviorY: 'contain' }}`
- With `className="overlay-fullscreen z-[XX] animate-fade-in"` and remove the inline style entirely
- Change overlay header padding from `pt-4` to `pt-2` to eliminate the extra gap (safe-area padding on the container already provides the offset)

Files affected:
| File | Overlay divs to fix |
|---|---|
| `AddFoodScreen.tsx` | 1 main overlay (line 1076) |
| `FoodDetailScreen.tsx` | 1 overlay (line 183) |
| `CreateMealSheet.tsx` | 2 overlays (lines 468, 677) |
| `CopyPreviousMealSheet.tsx` | 1 overlay (line 172) |
| `SavedMealDetail.tsx` | 2 overlays (lines 486, 550) |
| `PCRecipeDetail.tsx` | 1 overlay (line 111) |
| `PhotosPopup.tsx` | 1 overlay (line 144) |

### What this does NOT touch
- No Supabase tables, RLS, or Edge Functions
- No training, workout, calendar, or messaging logic
- No new component files created
- No routes changed
- No water tracking added

### Why this will work
- `fixed inset-0` without `height: 100dvh` = viewport-sized element, zero ambiguity
- CSS-class-based `env()` values are parsed by the stylesheet engine (reliable on all iOS WebKit versions), unlike inline style `env()` which bypasses the CSS parser
- Solid opaque bottom nav means no compositor layer corruption after overlay transitions
- Reduced header padding (`pt-2` vs `pt-4`) matches the visual density of the app shell header

