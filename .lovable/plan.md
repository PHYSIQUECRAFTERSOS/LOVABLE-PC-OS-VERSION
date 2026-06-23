## Goal

Make the lifecycle auto-messages (First Sign-In, First Completed Workout, Birthday) work like Trainerize: a simple list of preset automations with a single ON/OFF toggle + "Customize" button per coach. When toggled ON, the message fires automatically for every client on that coach's roster — no manual trigger creation, no per-client tagging required.

## What changes for the coach

Add a new "Lifecycle Automations" section at the top of the Automated Messaging settings (above the existing Triggers/Templates/History tabs). It shows three fixed rows, one per lifecycle event:

```text
[chip]  [delay badge]   [event name]                  [Customize]  [toggle]
 💬     +35 min          On First Sign-In               Customize     ON
 💬     +25 min          First Completed Workout        Customize    OFF
 💬     9am local        Client Birthday                Customize     ON
```

- Toggle ON = the message sends automatically to every active client of that coach the first time the event happens (lifetime-once for sign-in & first workout; yearly for birthday). No tagging, no selecting clients.
- Toggle OFF = nothing fires for that event.
- "Customize" opens a small dialog with one big textarea pre-filled with the coach's current message for that event. `{name}` is supported. Save updates only that coach's copy.
- Each coach has their own independent toggles + message text. Kevin's edits don't touch Aaron's, and vice versa.

The existing "Triggers" / "Templates" / "History" tabs stay as-is for power users who want tag-group or individual targeting, custom cron schedules, missed-workout/check-in nudges, broadcasts, etc. The three lifecycle events are simply removed from the manual "New Trigger" dropdown so the new section is the only path for them — no duplicate firing.

## How it works under the hood (technical)

Reuse the existing `auto_message_triggers` + `auto_message_templates` + `auto_message_logs` tables and the `evaluate-auto-messages` edge function. The lifecycle section is just an opinionated UI wrapper that manages a single trigger row per coach per event.

1. Lifecycle config resolution (per coach, per event):
   - Look for a row in `auto_message_triggers` where `coach_id = me`, `trigger_type IN ('first_signin','first_workout','birthday')`, `target_type = 'all_clients'`, and a sibling template row tagged with a stable `category` value (e.g. `lifecycle_first_signin`).
   - If none exists, the UI shows the toggle as OFF and the default starter message as the placeholder text inside Customize.

2. Toggling ON:
   - If no template exists, insert a default `auto_message_templates` row (coach_id, category = `lifecycle_<event>`, content = the default copy below).
   - If no trigger exists, insert a default `auto_message_triggers` row (coach_id, template_id, trigger_type, target_type = `all_clients`, is_active = true, excluded_client_ids = []).
   - If both exist, set `is_active = true`.

3. Toggling OFF: set `is_active = false` on the trigger row (preserve template + customized copy for next time).

4. Customize dialog: updates `auto_message_templates.content` for that coach's lifecycle template. Saving while OFF is allowed; toggle stays OFF until the coach flips it.

5. Edge function (`evaluate-auto-messages`): no behavior change needed. It already:
   - Resolves "all clients" via `coach_clients` scoped to `trigger.coach_id` (coach-isolated).
   - Honors the 35-min and 25-min delays added previously.
   - Dedupes via `auto_message_logs` so each event fires once per client lifetime (birthday: once per calendar day match).

6. Manual "New Trigger" dropdown: drop `first_signin`, `first_workout`, `birthday` from the options list so coaches can't accidentally create a second competing trigger. Existing manually-created lifecycle triggers from prior testing are left intact; the lifecycle section will simply pick them up if their `target_type = 'all_clients'`, otherwise the coach will see the toggle as OFF and can flip it to create the canonical one.

7. Default copy used when a coach first turns one on (editable via Customize):
   - First Sign-In: "Welcome {name}! Glad to have you on board. Take a look around the app and let me know if you have any questions."
   - First Workout: "Huge first workout, {name} — that's how it starts. Proud of you. Keep the momentum going."
   - Birthday: "Happy birthday, {name}! Wishing you an awesome day. Let's make this year your strongest one yet."

## Files touched

- `src/components/messaging/AutoMessagingManager.tsx` — add the new "Lifecycle Automations" section (3 rows, toggle + Customize dialog), wire it to the queries/mutations described above, and remove the 3 lifecycle entries from the manual `TRIGGER_TYPES` dropdown used by the "New Trigger" form.

No database migration, no edge function change, no changes to other coaches' workflows.

## Verification

- As coach A, flip "On First Sign-In" ON, sign up a brand new test client, complete onboarding → 35 min later the welcome message appears in that client's thread (and nowhere else).
- Flip OFF, sign up another test client → no message fires.
- Click Customize, change the copy, save, repeat → new client receives the edited copy.
- As coach B, confirm coach A's toggle states and copy do not appear on coach B's screen; coach B has independent toggles.
- Complete a workout for a test client with "First Completed Workout" ON → 25 min later message arrives, once. Complete a second workout → no duplicate.
- Birthday: set test client DOB to today in PST, toggle ON → message arrives at 9am local; toggle OFF → nothing.
