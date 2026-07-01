
## Goal
Stop sending the automated mass message to participants when a challenge activates. Instead, surface a clear "LIVE NOW" indicator on the client dashboard's challenge banner so clients see it themselves.

## Changes

### 1. Remove the auto-message (backend)
- File: `supabase/functions/challenge-lifecycle/index.ts`
- Remove the block that creates message threads / inserts coach-to-participant messages when a challenge transitions from `upcoming` → `active`.
- Keep everything else intact: status flip, workout/nutrition backfill, cron scheduling.
- No database migration needed.

### 2. Add "LIVE NOW" indicator on the dashboard banner (frontend)
- File: `src/components/dashboard/ChallengeBanner.tsx`
- For each challenge already returned by `useChallenges` (active + upcoming within 7 days), compute status from `start_date`/`end_date`.
- If active today: show a small pulsing gold/green pill labeled **"LIVE NOW"** next to the challenge title (e.g., `PR Challenge · LIVE NOW`).
- If upcoming: show a muted pill like **"Starts <relative date>"** (e.g., "Starts in 3 days").
- Keep the existing `View` button behavior (deep link to the challenge).

### 3. No changes to
- Challenge activation logic (still auto-activates on start date).
- Points/leaderboard/backfill.
- Coach-side manual messaging (coaches can still message manually if they want).

## Notes / Confirmations
- This is retroactive only for future activations — the PR Challenge message already sent will remain.
- Banner styling stays in the existing matte-black + gold palette; the LIVE pill will use a subtle pulse animation for dopamine without being loud.

Want me to proceed?
