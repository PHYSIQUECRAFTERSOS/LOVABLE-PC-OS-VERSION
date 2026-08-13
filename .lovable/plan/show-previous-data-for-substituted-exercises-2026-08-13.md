# Show previous data for substituted exercises

## What's happening

When a workout starts, the tracker loads "last time" data (previous performance, personal records, all-time bests) **once**, only for the exercises that were in the program at launch. If the client swaps an exercise mid-session — or adds one that isn't in the program — nothing is fetched for that new exercise, so it shows blank even when the client has logged it in previous weeks.

The sets themselves are still saved correctly to the log; what's missing is the history lookup for the swapped-in exercise.

## The fix

When an exercise is switched in or added mid-session, run the same history lookup that runs at launch, just for that one exercise, and merge the result into the existing state:

- Previous performance (last completed session's sets) so the greyed-out "last time" numbers appear.
- Personal record for that exercise.
- All-time bests so PR detection works on the substituted lift.

The lookup uses the same name-normalized identity expansion already in place, so history carries over even when the library holds duplicate rows for the same lift under different IDs (common with AI-imported and coach-built phases).

The fetch runs in the background: the switch still completes instantly, and the history fills in when it lands. If it fails, the exercise simply shows no history — no error toast, no blocked session.

## Technical notes

- Extract the existing identity-expansion + history query in `src/components/WorkoutLogger.tsx` (currently inline in the mount effect) into a reusable helper that accepts a list of `{ id, name }` and returns `{ previousPerformance, personalRecords, allTimeBests }` keyed by exercise id.
- Call it from `handleSwitchExercise` and `handleAddExercise` for the single new exercise, merging into the three state maps rather than replacing them.
- No schema changes, no changes to logging/persistence, completion, or the exercise-modification audit trail.
