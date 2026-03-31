
Goal: fix the two regressions that appeared in the last few hours without destabilizing the rest of Physique Crafters OS.

What I found
1. Steps sync is genuinely stuck for the affected client account:
   - `health_connections` shows the Apple Health connection in `sync_status = error`
   - `last_sync_at` is stale
   - `sync_error` says HealthKit is not authorized
   - `daily_health_metrics` is frozen at the older 6,022-step row
2. The current sync code is too brittle:
   - `useHealthSync.ts` re-requests HealthKit authorization before every sync
   - if that auth call or any one metric query fails, the entire sync is marked failed
   - that means one bad permission/state can block step updates completely
3. The overlay bug is not just a repaint issue:
   - nutrition overlays are rendered inline inside the page tree, not in a top-level portal
   - they use `fixed inset-0 + 100dvh + safe-area padding + autofocus`
   - on native iPhone, that combination can drift when the keyboard opens/closes, which matches your screenshots: gray band at top, Breakfast pushed down, header/nav displaced after backspace/back
4. The recent “repaint” fix helps after closing overlays, but it does not solve the root cause while the overlay is open.

Do I know what the issue is? Yes.
- Steps broke because the sync path is failing hard on HealthKit authorization/query state instead of recovering gracefully.
- Nutrition overlay broke because the full-screen screens are mounted in the wrong layer for iOS and are reacting badly to the visual viewport/keyboard.

Implementation plan

1. Harden Apple Health syncing so steps keep updating
Files:
- `src/hooks/useHealthSync.ts`
- `src/components/settings/HealthIntegrations.tsx`
- `src/components/dashboard/StepsCard.tsx`
- `src/components/HealthSyncBootstrap.tsx`

Changes:
- Stop treating every sync as a fresh permission flow. Keep `requestAuthorization()` for connect/reconnect, not as a required blocker before every sync.
- Make sync resilient:
  - query steps, distance, and energy independently
  - allow partial success
  - if steps succeed, complete the sync and update `last_sync_at`
  - do not overwrite good rows with zeroes from failed subqueries
  - clear `sync_error` automatically after a successful sync
- Improve stale-connection recovery:
  - if connection is marked `error`, foreground resume/manual sync should still retry cleanly
  - add explicit logging around resume trigger, interval trigger, and query failures so future regressions are easy to trace
- Keep the 30-minute interval and 5-minute resume throttle, but make sure the path actually executes successfully again.

2. Fix the nutrition overlay at the root layer, not just with repaint hacks
Files:
- `src/components/AppLayout.tsx`
- `src/index.css`
- `src/components/nutrition/AddFoodScreen.tsx`
- `src/components/nutrition/FoodDetailScreen.tsx`
- `src/components/nutrition/CreateMealSheet.tsx`
- `src/components/nutrition/CopyPreviousMealSheet.tsx`
- `src/components/nutrition/PCRecipeDetail.tsx`
- `src/components/nutrition/SavedMealDetail.tsx`
- possibly `src/components/dashboard/PhotosPopup.tsx`

Changes:
- Move full-screen iOS overlays to a shared top-level fullscreen shell rendered via portal to `document.body`.
- Standardize one overlay layout pattern:
  - true fullscreen root
  - safe-area aware top/bottom padding
  - internal scroll area only
  - no competing inline `fixed inset-0` wrappers scattered across components
- Remove the immediate auto-focus on Add Food open for iPhone, or delay it until the viewport is stable. This is likely what’s kicking off the top-gap/keyboard drift.
- Review and trim the recent root/layout CSS hardening so it doesn’t pin the whole app into a bad fixed-state on iOS during keyboard transitions.
- Keep `useIOSOverlayRepaint` as a close/unmount safety net, not as the main fix.

3. Make the visuals match the intended native layout again
Specific outcome to restore:
- top-left Physique Crafters branding sits flush where it did before
- top-right settings/hamburger remain visible
- bottom nav shows Home / Calendar / Training / Nutrition / Messages properly
- Add Food screen header sits higher with no gray dead space above it
- back/backspace from food flows does not push the app chrome down or hide it

4. Regression test the exact broken flows
I will validate these paths after implementation:
- Dashboard → Nutrition → Add Food → type/search → open food → back → back
- repeat with keyboard open/closed and after backspace
- switch to another tab after closing Add Food and confirm header/bottom nav remain correct
- Apple Health manual sync
- app resume after more than 5 minutes
- verify `health_connections.last_sync_at` advances and `daily_health_metrics` updates for today instead of staying at 6,022

Technical notes
- No database schema change is needed.
- The HealthKit Swift plugin can remain in place unless JS-side hardening is not enough; if needed, I will then do a second pass on the plugin query behavior.
- This is a native iPhone issue, so after the code fix you should pull the latest changes and run `npx cap sync` before testing on device.