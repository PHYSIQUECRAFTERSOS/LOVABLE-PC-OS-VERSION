# Automated Messaging — New Triggers + Settings Entry

Goal: Coach/Manager/Admin can configure auto-messages for **client first sign-in**, **client birthday**, and **client first completed workout** — managed from a new **Automated Messaging** card in Settings. Onboarding collects DOB so birthday firing works.

## 1. Database

Single additive migration (no destructive changes):

- `profiles`: add `date_of_birth date` (nullable).
- `onboarding_profiles`: add `date_of_birth date` (nullable).
- (Reuse existing `auto_message_triggers` / `auto_message_templates` / `auto_message_logs` — no schema change. New `trigger_type` values are just strings.)

Backfill: none required (existing clients can fill in later via profile or next onboarding edit).

## 2. Onboarding — collect birthday

In the existing Onboarding flow, add a **Birthday** field (Month / Day / Year selects, validated to a real date, must be 18+ Saves to `onboarding_profiles.date_of_birth` and mirrors to `profiles.date_of_birth` on completion (same pattern existing fields use). Skippable? No — required, since user explicitly asked for it.

## 3. New trigger types

Extend `AutoMessagingManager.tsx` `TRIGGER_TYPES` with:

- `first_signin` — "On First Sign-In" (instant)
- `birthday` — "Client Birthday" (9am client-local)
- `first_workout` — "First Completed Workout" (instant)

UI implications:

- These triggers don't need a cron — hide the cron input for them (same way `missed_workout` already does).
- Allow target = all clients / tag group / individual (existing logic).
- Show an "INSTANT" vs "9am" badge in the trigger list (cosmetic, matches the Trainerize-style screenshot).

## 4. Edge function `evaluate-auto-messages`

Add three new `case` branches in the `switch (trigger.trigger_type)` block. All use the existing "already sent today?" guard via `auto_message_logs` to prevent duplicates, plus a per-trigger uniqueness check:

- `**first_signin**`: target client where `profiles.created_at` is within the last 24h **and** no prior `auto_message_logs` row exists for `(trigger_id, client_id)` (lifetime-once). Sends immediately on next cron tick after signup.
- `**first_workout**`: target client where they have ≥1 row in `workout_sessions` with `completed_at IS NOT NULL` **and** no prior `auto_message_logs` row for `(trigger_id, client_id)` (lifetime-once).
- `**birthday**`: target client where `profiles.date_of_birth`'s `MM-DD` equals today in the client's local timezone (reuse `getTodayLocal(tz)`), gated to fire at the client's local 9am hour (reuse `getClientLocalHour`). Dedup by `(trigger_id, client_id, sent_at::date)`.

All three reuse the existing send pipeline (`auto_message_logs` insert → `message_threads` upsert → `thread_messages` insert → push notification optional). Push notification: send for `birthday` and `first_workout`; `first_signin` skips push (user just opened the app).

## 5. Settings entry

`src/pages/Profile.tsx`: when `role === "coach" || role === "admin"`, render a new section **Automated Messaging** that mounts `<AutoMessagingManager />` (component already exists). Leave the existing instance inside `CoachMessaging` so the messaging hub view is unchanged.

## 6. Verification

- Run migration; confirm `date_of_birth` columns exist.
- Onboard a fresh test client → DOB saved.
- As coach in Settings → Automated Messaging: create a template + a `first_signin` trigger active → manually invoke edge function → verify a thread message appears for the newly invited client and a log row exists.
- Set a test client's `date_of_birth` to today, tz to PST, create a `birthday` trigger → invoke edge fn at 9am PST window → verify single message.
- Complete a workout as a test client with a `first_workout` trigger active → invoke edge fn → verify single message, then re-run and confirm no duplicate.

## Technical detail (for engineers)

Files touched:

- `supabase/migrations/<new>.sql` — `ALTER TABLE profiles ADD COLUMN date_of_birth date; ALTER TABLE onboarding_profiles ADD COLUMN date_of_birth date;`
- `src/components/onboarding/*` — new birthday step component, wired into the step sequence + save logic.
- `src/integrations/supabase/client.ts` types regenerate automatically.
- `src/components/messaging/AutoMessagingManager.tsx` — extend `TRIGGER_TYPES`, hide cron for instant triggers, add INSTANT/9am badge.
- `supabase/functions/evaluate-auto-messages/index.ts` — add 3 cases; reuse existing helpers; deploy.
- `src/pages/Profile.tsx` — render `<AutoMessagingManager />` for coach/admin under a new "Automated Messaging" section.

Out of scope: editing other trigger types, redesigning the messaging manager, changing message templates content (coach writes their own), notifications preferences UI.