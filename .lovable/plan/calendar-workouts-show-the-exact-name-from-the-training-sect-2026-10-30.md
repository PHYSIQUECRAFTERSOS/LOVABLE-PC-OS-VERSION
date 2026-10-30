# Calendar workouts show the exact name from the Training section

## What's wrong
The calendar isn't adding "Day 4:" when it shows a workout. The extra label gets saved into the calendar entry by two automatic background rules. They fire every time a workout is renamed or the workouts in a phase are reordered. When they fire, they number the workout by its position ("Day 4:") and rewrite every calendar entry linked to it. They also cut off any "Day 1:"-style text at the start of the name you typed.

Gary's "DAY3 : Push B (...)" is 4th in its phase, so the calendar shows "Day 4: DAY3 : Push B ...".

Right now, 351 calendar workouts have a "Day N:" label added that isn't part of the workout's real name. 33 of them are on upcoming dates.

## Fix
1. **Stop adding the label.** Change both background rules so a rename or reorder writes the workout's exact name to the calendar, without position numbers and without trimming your text. A workout you mark as "excluded from numbering" with a custom tag keeps its tag (for example "Mobility: ..."), the same way the calendar screen already shows it.
2. **Repair existing entries.** For every calendar workout whose title is "Day N: " plus the exact linked workout name, remove the added label. Entries a coach typed by hand, which don't match that pattern, stay as they are. Completed past workouts are repaired too, so history matches.
3. **Check it.** Confirm Gary's Nov 5 entry reads "DAY3 : Push B ( CHEST & SHOULDERS & TRICEPS)( work)". Then rename and reorder a test workout and confirm the calendar follows the exact name.

## Technical details
- Migration: `CREATE OR REPLACE FUNCTION` for `sync_workout_name_to_calendar` and `sync_phase_labels_on_reorder`. Label = `trim(w.name)`, or `custom_tag || ': ' || trim(w.name)` when `exclude_from_numbering` and a tag is set. No regex stripping. Triggers stay attached; no policy changes.
- Data update: `UPDATE calendar_events ce SET title = w.name FROM workouts w WHERE ce.linked_workout_id = w.id AND ce.event_type='workout' AND ce.title ~ '^Day \d+: ' AND regexp_replace(ce.title,'^Day \d+: ','') = w.name`.
- The front end already uses plain names (ScheduleEventForm, CalendarTab), so it doesn't need changes.
