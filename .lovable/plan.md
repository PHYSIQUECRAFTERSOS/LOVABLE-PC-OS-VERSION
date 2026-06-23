## Problem

The `first_workout` (and `first_signin`) lifecycle automations are firing for **existing clients** whose first workout / onboarding completion happened months ago. As soon as the toggle was switched ON, the edge function looked at the *earliest ever* completed workout and decided it qualified, then mass-sent "first workout" messages to ~15 existing clients including you.

Root cause in `supabase/functions/evaluate-auto-messages/index.ts`:
- `first_workout` picks the earliest `workout_sessions.completed_at` with no check that it happened **after** the trigger was activated.
- `first_signin` looks back 7 days at `onboarding_profiles.completed_at`, but does not check it happened **after** the trigger was activated either.

## Fix

### 1. Gate both triggers by an activation cutoff
Use `trigger.created_at` (or `updated_at` when re-enabled) as the cutoff timestamp. A client only qualifies if the qualifying event (`workout_sessions.completed_at` or `onboarding_profiles.completed_at`) is **strictly after** that cutoff.

This guarantees: only brand-new activity that happens after the coach turns the automation ON can ever fire. Pre-existing workouts and pre-existing onboarding completions are permanently ignored.

### 2. Backfill existing clients as "already sent"
For every currently-existing lifecycle trigger (`first_signin`, `first_workout`) owned by any coach, insert a row into `auto_message_logs` for every client on that coach's roster with `trigger_reason = '<type>_backfill'` and `message_content = '[backfill — pre-existing client, suppressed]'`. This ensures the dedupe check (`auto_message_logs` lookup by `trigger_id` + `client_id`) skips them forever, even if the cutoff check ever regresses.

### 3. Stop the misfires that already happened
Delete the erroneous outbound `thread_messages` and `auto_message_logs` rows created in the last few hours for `first_workout` so other coaches/clients are not stuck with a stray "first workout" message.
- Scope: `auto_message_logs.trigger_reason = 'first_workout'` AND `sent_at >= now() - interval '6 hours'`.
- For each row, delete the matching `thread_messages` row by `(thread_id, sender_id=coach_id, content, created_at within ±2 min of sent_at)`, then delete the log row.
- Surface counts so you can verify what got cleaned.

### 4. Verification (browser/Playwright + SQL)
1. SQL: confirm `auto_message_logs` now has backfill rows for every existing client per active lifecycle trigger.
2. SQL: confirm no recent `first_workout` log rows remain other than backfills.
3. Edge function: invoke `evaluate-auto-messages` manually and confirm 0 lifecycle messages sent.
4. Toggle OFF then ON the "First Completed Workout" automation in Settings → Automated Messaging. Confirm `auto_message_triggers.created_at`/`updated_at` advances and no existing client fires.
5. Logs: tail `evaluate-auto-messages` for one cycle, confirm no new lifecycle sends.

## Files touched

- `supabase/functions/evaluate-auto-messages/index.ts` — add `activatedAt = trigger.updated_at ?? trigger.created_at` cutoff in both `first_signin` and `first_workout` branches.
- New migration `supabase/migrations/<ts>_backfill_lifecycle_auto_messages.sql` — backfill `auto_message_logs` for all current clients per lifecycle trigger, and delete the recent misfired `first_workout` rows + their `thread_messages`.

No UI changes. No changes to other triggers. No schema changes.