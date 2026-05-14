## Root Causes Found

**Issue 1 — Calendar shows no phase boundary banners**
The `usePhaseBoundaries` hook is failing silently with a Postgrest error. The query joins `client_program_assignments` with `programs`, but there are **two foreign keys** between those tables (`program_id` and `forked_from_program_id`), so Supabase rejects the ambiguous embed:

```
PGRST201: Could not embed because more than one relationship was found for
'client_program_assignments' and 'programs'
```

Result: assignment fetch returns null → 0 phases resolved → no banner, no "Phase 1 ends" pill on the coach's calendar.

**Issue 2 — Training tab opens to old/wrong phase**
`TrainingTab.tsx` (line 163) and `ClientProgramTwoPane.tsx` (line 110) both default the selected phase to `assignment.current_phase_id`. That stored field still points at Phase 1 (it isn't auto-rotated when a phase ends), so the UI lands on the expired phase even though today (May 14) is inside Phase 2.

**Issue 3 — Past phase still shows "Current" badge**
`ClientProgramTwoPane.tsx` line 289 uses:
```
const isCurrent = (dd?.isCurrent) || currentPhaseId === p.id;
```
The OR fallback to the stale `assignment.current_phase_id` keeps the badge on Phase 1 forever. Date-derived `dd.isCurrent` is the source of truth.

---

## Plan

### 1. Fix the ambiguous embed in `src/hooks/usePhaseBoundaries.ts`
Replace the embed with the explicit FK hint so the join resolves cleanly:
```
.select("program_id, programs!client_program_assignments_program_id_fkey(start_date)")
```
Keep all existing fallback/seed logic intact. This single change restores the gold "PHASE 2: PREP MENS PHYSIQUE · STARTS TUE MAY 12" banner above the May 11–17 row and the "Phase 1 ends" pill on May 11.

### 2. Make Training tab open to the date-current phase
- In `src/components/clients/workspace/TrainingTab.tsx` (lines 159–165): compute the active phase from program start date + phase durations using the existing `derivePhaseDates` helper, and prefer that over `assignment.current_phase_id` when expanding a phase on first load.
- In `src/components/clients/workspace/training/ClientProgramTwoPane.tsx` (lines 107–113): same change — when defaulting `selectedPhaseId`, look for a phase whose date range contains today; fall back to `currentPhaseId`, then to `phases[0]`.

### 3. Make the "Current" badge date-driven
In `ClientProgramTwoPane.tsx` line 289 change to:
```
const isCurrent = !!dd?.isCurrent;
```
Drops the stale fallback. Phase 1 (May 5–11) will no longer show the badge after May 11; Phase 2 (May 12+) will be the only one labelled Current. The `border-l-2` highlight on line 302–303 inherits the same fix automatically.

### Out of scope
- No DB migration. The stale `current_phase_id` value is left as-is (other systems may still reference it; auto-rotating it belongs to a separate "phase advancement" job).
- No changes to mobile workout editor, drag/drop, or program builder.

### Verification
- Reload Jack Fisher's profile → Calendar tab → confirm gold "PHASE 2…" banner appears across the May 11–17 row and the "Phase 1 ends" pill renders on May 11.
- Open Training tab → confirm Phase 2 is auto-selected/expanded with its workouts visible, and only Phase 2 carries the "Current" badge.
- Console should no longer log `PGRST201` from `usePhaseBoundaries`.
