# Fix: Copy Day to Client (Master Libraries) shows false "no active program"

## Root cause hypothesis
Jordan has an active program with `current_phase_id` set in the DB and Kevin has admin+coach role + an active `coach_clients` link, so the detection query *should* succeed. The most likely culprits, in order:

1. The embedded join `programs(name)` in `client_program_assignments` select silently throws or returns a shape PostgREST can't resolve, leaving `assignments` undefined and skipping straight to `no_program`.
2. A transient race: `setCopyDaySelectedClient` then `handleCopyDaySelectClient(v)` fire back-to-back; if the dialog is closed/reopened quickly the stale resolver lands.
3. Cached/stale code on the live build (less likely — preview also fails).

## Scope
Only `src/components/training/ProgramDetailView.tsx`. No changes to:
- DB / RLS
- The "Import from Master Library" flow inside the client profile (already working — explicitly do not touch).
- Phase-level "Copy to Client" (separate dialog, different code path).

## Changes

### 1. Bulletproof `handleCopyDaySelectClient` (lines 843–878)
- Drop the embedded `programs(name)` join. Use a flat select on `client_program_assignments` and resolve `program.name` in a separate query.
- Capture `error` from every Supabase call and `console.error` with context if anything fails (so we can see it in network/console next time).
- Guard against stale resolution: capture the `clientId` at call time and bail if `copyDaySelectedClient` has changed by the time the awaits return.

### 2. Auto-resolve to LAST phase when `current_phase_id` is null
Per user choice: if a client has an active assignment but no `current_phase_id`, query `program_phases` for that program ordered by `phase_order DESC LIMIT 1` and use that phase as the destination. The detection state becomes `ok` with the resolved phase name, and the green "Will copy into: {phase name}" hint shows the auto-picked phase. No more `no_phase` red error in this case.

If even *that* returns nothing (program has zero phases), fall back to the existing red error message but with a clearer wording: `"This program has no phases. Add a phase before copying."`

### 3. Keep the `no_program` red error
Only fires when truly no `active`/`subscribed` assignment exists for the client. Wording unchanged.

### 4. Detection state enum updated
- `idle | ok | no_program | no_phases` (rename `no_phase` → `no_phases` to reflect new meaning: program has zero phases at all).
- Render block at lines 1446–1451 updated to match.

## Acceptance test
1. Open Master Libraries → Programs → click any workout day → ⋯ → Copy to Client → select Jordan → expect green "Will copy into: phase 7: triple cluster" (Jordan's actual current phase). 
2. Select a client whose assignment has `current_phase_id = NULL` but program has phases → expect green "Will copy into: {last phase name}".
3. Select a client with no active assignment → expect red "no active program".
4. Phase-level "Copy to Client" untouched and still works.
5. Client-profile "Import from Master Library" untouched and still works.

## Files touched
- `src/components/training/ProgramDetailView.tsx` (only)
