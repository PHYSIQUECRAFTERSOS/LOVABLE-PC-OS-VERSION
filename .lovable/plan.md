

# Plan: Keep "Finished Check-In Review" Section Always Visible

## Problem

The "Finished Check-In Review" section is wrapped in `{totalSubmitted > 0 && (...)}` (line 464). On Monday when the week resets, there are zero submissions yet, so `totalSubmitted === 0` and the entire section disappears — including the layout, progress bar, and empty-state message.

You want the section to always be visible (showing "No reviews completed yet" when empty), but the **client names inside it** should reset each week as they do now.

## Fix

**File: `src/components/dashboard/CheckinSubmissionDashboard.tsx`**

Remove the `{totalSubmitted > 0 && (...)}` conditional on line 464. The section will always render. When no submissions exist yet:
- Progress bar shows 0/0 → 0%
- The existing empty state text ("No reviews completed yet — check off clients above.") displays
- Once clients start submitting and getting reviewed, names appear as normal

One small tweak: change the counter display from `{reviewedCount}/{totalSubmitted}` to handle the 0/0 case gracefully (show "0 reviewed" instead of "0/0").

## Files to modify
- `src/components/dashboard/CheckinSubmissionDashboard.tsx` — remove the `totalSubmitted > 0` gate around the Finished Check-In Review card

