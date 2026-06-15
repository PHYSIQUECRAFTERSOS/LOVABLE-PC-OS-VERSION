# Persistent Client Exercise Notes

Add a Strong-style "My Notes" field to each exercise card in the workout logger. The note is scoped per `client_id` + `exercise_id`, so the same setup notes (e.g. "Seat 4, cable at notch 7, elbows tucked") reappear every time the client opens that exercise — across all workouts and programs.

This is separate from the existing coach-assigned `notes` (the gold/yellow programming cue at the top of the card) — both will coexist.

## What it looks like

- New section on each `ExerciseCard`, between the coach note (if any) and the Set/Previous/lbs/Reps header row.
- Collapsed default: a small "+ Add personal note" link if empty, or a one-line preview with an edit pencil if a note exists.
- Expanded: multi-line textarea (auto-grow, ~3 rows visible), placeholder "Seat height, cable position, cues...".
- Saves on blur (and debounced ~600ms while typing) with a subtle "Saved" check that fades. Optimistic — never blocks the lifting flow.
- Visible only to the client logging the workout. Coaches do not see client personal notes (their own coach notes remain separate).

## Database

New table `public.client_exercise_notes`:

- `client_id uuid` → `auth.users.id`
- `exercise_id uuid` → `public.exercises.id`
- `note text`
- `created_at`, `updated_at` (with update trigger)
- `UNIQUE (client_id, exercise_id)` so upsert by that pair works

RLS:
- Client can `SELECT/INSERT/UPDATE/DELETE` rows where `client_id = auth.uid()`.
- No coach/admin access (personal notes).
- Standard GRANTs to `authenticated` and `service_role`.

## Frontend changes

**`src/components/workout/ExerciseCard.tsx`**
- Accept new props: `personalNote: string`, `onPersonalNoteChange: (val: string) => void`.
- Render a compact collapsible note UI as described above, using existing card styling (gold border on focus, muted bg). No new dependencies.

**`src/components/WorkoutLogger.tsx`**
- On mount (after exercises load), batch-fetch personal notes:
  `select exercise_id, note from client_exercise_notes where client_id = user.id and exercise_id in (...)`.
- Hold notes in a `Record<exerciseId, string>` state.
- Pass current note + change handler down to each `ExerciseCard`.
- On change: update local state immediately, debounce 600ms, then upsert by `(client_id, exercise_id)`. Also flush on `Finish`/unmount via a ref.

No changes to existing coach `notes`, set logging, PR tracking, rest timer, or completion flow.

## Out of scope

- Coach-side viewing/editing of client personal notes.
- Per-workout (vs per-exercise) notes — one persistent note per exercise, matching Strong.
- Migrating any existing free-text fields.

## Technical details

- Table follows the project's role/RLS rules (no roles stored elsewhere, policies scoped to `auth.uid()`).
- Debounced save pattern mirrors the existing `useDebounce`/optimistic save patterns already used elsewhere in the app to honor the "Instant Feedback Loop" memory.
- Uses `useDataFetch` or a plain Supabase query batched alongside the existing previous-sets fetch in `WorkoutLogger.tsx` to avoid an extra round trip.
- Upsert: `supabase.from("client_exercise_notes").upsert({ client_id, exercise_id, note }, { onConflict: "client_id,exercise_id" })`.
