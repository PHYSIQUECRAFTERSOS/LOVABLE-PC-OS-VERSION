## Goal
Fix the PR Challenge sitting on "Upcoming" past its start date, ensure scoring/leaderboard fires correctly from activation onward, and notify participants when a challenge goes active.

## 1. Auto-activation via daily cron
- Enable `pg_cron` + `pg_net` (if not already).
- Schedule `challenge-lifecycle` edge function to run **daily at 00:05 UTC** via `cron.schedule` calling the function URL with the anon key.
- On activation, `challenge-lifecycle` also inserts an in-app notification (see #3).
- Immediately invoke the function once to flip today's PR Challenge (July 1) from `upcoming` → `active`.

## 2. Verify + backfill scoring
- Inspect `challenge_scoring_rules` for the current PR Challenge to confirm rules exist (workout completion, PR set, etc.). If none, that's why no points would score — surface the finding to you.
- Confirm `autoScoreChallengePoints` (already wired to workout/nutrition/cardio logging via `src/utils/challengeAutoScore.ts`) filters by `status='active'` — so once activation runs, new logs today will score correctly.
- **Backfill**: after activation, run a one-time backfill pass for each newly-activated challenge:
  - For every participant, look at today's `workout_sessions` (completed), `personal_records` set today, `cardio_logs` (completed), and `nutrition_logs` (day complete) that occurred *after* the challenge's `start_date` at 00:00.
  - Insert matching `challenge_logs` rows respecting `daily_cap`, then recompute `challenge_participants.current_value`.
- This backfill runs inside `challenge-lifecycle` right after the `upcoming → active` flip, so it's automatic on every future activation too.

## 3. Notifications on activation
For each participant of a newly-activated challenge:
- **In-app message thread**: post a system message from the coach into the existing thread with that client (`thread_messages` insert), body: `🔥 The "{title}" challenge is now LIVE! Tap Challenges to see the leaderboard.`
- **Banner**: Existing `ChallengeBanner` already surfaces active challenges — no code change needed; the flip alone re-shows it. Clear any prior dismissal for the newly-active challenge so participants see it again by deleting matching rows from `challenge_banner_dismissals` for this challenge.

No push notifications (per your selection).

## Files touched
- `supabase/functions/challenge-lifecycle/index.ts` — add backfill + notification logic on activation.
- Migration/Insert (via correct tool):
  - Enable `pg_cron`/`pg_net` extensions (migration).
  - Schedule the cron (insert tool, since URL/key are project-specific).

## Not changed
- `autoScoreChallengePoints` logic (already correct once challenges are active).
- Leaderboard component (reads `challenge_participants.current_value`, which backfill will populate).
- `ChallengeBanner` UI.

## Verification
- After deploy, invoke `challenge-lifecycle` once. Confirm the PR Challenge status flips to `active` in the DB, participants receive a thread message, and any of today's completed workouts show up as `challenge_logs` rows with points.
