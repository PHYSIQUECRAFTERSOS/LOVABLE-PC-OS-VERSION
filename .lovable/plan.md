

## Root cause
The Workout Progress sheet is rendered as a Radix `Sheet` at `z-50`, but the parent `EventDetailModal` is a `Dialog` whose overlay is `z-[70]` and content is also `z-[70]`. So when the sheet opens, the Dialog's dark overlay sits **on top of** the Sheet → the numbers show but are dimmed and unclickable behind a black 80% scrim.

This matches our project's documented z-index hierarchy (Fullscreen overlays z-60, Dialogs z-70, Portals z-80), and the sheet currently violates it.

## Fix (surgical, ~2 small edits)

**1. Lift the Workout Progress sheet above the Dialog** — Edit `WorkoutProgressSheet.tsx` so its `SheetContent` (and its overlay) render at `z-[85]`, sitting above the `EventDetailModal` Dialog's `z-[70]`. This is done by passing a custom `className` (`z-[85]`) plus a custom `overlayClassName` — or by switching to a local `SheetPortal` + `SheetOverlay` with the higher z-index, leaving the shared `ui/sheet.tsx` untouched (so we don't risk regressions in other sheets).

**2. Close the parent Dialog when Progress opens (cleaner UX)** — In `EventDetailModal.tsx`, when the user taps "Workout Progress" in the dropdown, set `showProgress=true` AND call `onClose()` for the parent dialog. When the progress sheet is closed, do nothing extra (parent is already gone). This eliminates the stacked-modal feel entirely and matches iOS native behavior (push-to-front, single context at a time).

## UX improvements (senior iOS engineer recommendations)

These are small wins that make the sheet feel native:

- **Full-height bottom sheet on mobile** (`h-[92vh]` instead of `85vh`) with a visible drag handle bar at top — iOS users instinctively swipe down to dismiss.
- **Sticky workout name + session count header** with a back-chevron on the left (returns to the workout popup) and X on the right.
- **Highlight the "current session" column** with a subtle gold left border so users instantly see which one they just did vs. history.
- **Auto-scroll the table to the rightmost (newest) column** on open so the most recent session is in view without horizontal scrolling.
- **Show delta vs. previous session** under each cell when reps × weight beat the prior session (small green ▲ or red ▼). Reuses existing data, no new queries.
- **Sticky "Today" date pill** above the table when scrolled.
- **Haptic-style tap feedback** on row tap (already supported via Capacitor on iOS; web no-op).

I'll implement #1–#4 from the UX list as part of this fix; #5 (deltas) and #6 (sticky pill) only if you want them in this same pass.

## Files touched
- `src/components/calendar/WorkoutProgressSheet.tsx` — z-index fix + UX polish
- `src/components/calendar/EventDetailModal.tsx` — close parent dialog when launching progress sheet

## Out of scope (will not touch)
Shared `ui/sheet.tsx`, shared `ui/dialog.tsx`, any other modal, calendar fetch logic, workout finish flow, RLS, schema.

## Quick clarifying question
Do you want the deltas-vs-previous-session indicator (small green ▲ / red ▼ under each cell) included now, or keep this fix purely visibility + polish and ship deltas separately?

