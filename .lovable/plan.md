# Fix: Keith & Julian show "No active phase" on Clients list

## Root cause (verified against the database)

Keith's active assignment points to program `Phase 14 : Standard sets` and Julian's points to `JULIAN LESNEVICH - Phase 15`. **Both of those `programs` rows have `start_date = NULL`.** The corresponding `client_program_assignments` rows do have a valid `start_date` (Keith 2026-04-07, Julian 2026-04-27), which is what their profile Plan view uses to render the phase list.

The Clients-grid resolver does not use it. In `src/components/clients/SelectableClientCards.tsx` the assignments query is:

```ts
.from("client_program_assignments")
.select("client_id, program_id")   // missing start_date
```

That row is then fed into `computeClientPhaseStatuses` as:

```ts
{ client_id, program_id, start_date: programStartById.get(a.program_id) || null }
```

So the "assignment start_date" passed in is actually the program's start_date. When the program's `start_date` is NULL (Keith & Julian's case), the helper has no anchor, `derivePhaseDates` returns nothing, and the card shows "No active phase / No next phase queued". Everyone else on the page has a populated `programs.start_date`, which is why only these two break.

## Fix

Single-file, surgical change to `src/components/clients/SelectableClientCards.tsx`:

1. Add `start_date` to the assignments select so we actually have the per-client anchor.
2. When building the input to `computeClientPhaseStatuses`, fall back to the assignment's own `start_date` whenever the program's `start_date` is null:
   ```ts
   start_date: programStartById.get(a.program_id) || a.start_date || null
   ```
3. Apply the same fallback in the local `programStart` computation a few lines below (used for the inline progress bar / next-phase label), so the badge and progress bar agree:
   ```ts
   const programStart =
     programStartById.get(a.program_id) ||
     (a as any).start_date ||
     sortedPhases[0]?.start_date ||
     null;
   ```

That's the whole change. No schema migration, no RLS change, no behavior change for clients whose programs already have a `start_date`.

## Why not "just backfill `programs.start_date`"

We could `UPDATE programs SET start_date = <assignment.start_date>` for the two affected rows, but:
- The same bug will silently reappear any time a coach creates a program without a start date and assigns it (which is clearly already happening).
- The profile Plan view already treats the assignment as the source of truth, so making the Clients list do the same restores parity with the rest of the app.

If you also want me to backfill the two existing NULL `programs.start_date` rows as a one-time data fix, say the word and I'll add that as a separate insert/update step after the code fix lands.

## Out of scope
- No changes to `clientPhaseStatus.ts` (its `programStart || a.start_date` fallback is already correct — we just weren't feeding it the assignment date).
- No changes to dashboard cards, calendar, training tab, or RLS.
- No edits to coach-set targets, current_phase_id, or any program structure.
