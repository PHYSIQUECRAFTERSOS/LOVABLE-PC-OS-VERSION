## Goal
Keep the colored phase progress bar on the Clients tab cards, but stop it from incorrectly showing red ("Overdue") for clients who aren't actually mid-phase yet.

## Root cause
In `SelectableClientCards.tsx` (phase fetch effect, ~lines 311–401), when no phase contains today (`isCurrent`), the code falls back to the most recent phase by `end_date`. For a brand-new client whose program starts today/in the future, or whose program data is incomplete, that fallback grabs an ended phase → `daysLeft <= 0` → bar renders red and labeled "Overdue."

## Fix (frontend only, single file: `src/components/clients/SelectableClientCards.tsx`)

1. **Replace the fallback logic.** Resolve phase strictly as:
   - **a. Current** — phase where `derived[p.id].isCurrent === true` (today is inside [start, end]).
   - **b. Upcoming** — if none current and today is *before* the program's first phase start, pick the first phase and mark it as `upcoming`.
   - **c. None** — otherwise (program fully ended, or no phases/program at all), do **not** set a phase entry. No red bar.

2. **Extend `PhaseInfo`** with a `state: "current" | "upcoming" | "none"` field (default `"current"`). Always write an entry for every client in `clients`, including a `"none"` placeholder when there's no resolvable phase.

3. **Render rules** in the card (~lines 659–689):
   - `state === "current"`: existing behavior — green / amber / red by elapsed %, label `"{phaseName} · Ends {endDate}"` + `"{daysLeft}d left"`.
   - `state === "upcoming"`: grey bar at `0%`, label `"{phaseName} · Starts {startDate}"` + `"Starts in Xd"` in muted text. Never red.
   - `state === "none"`: empty grey bar at `0%`, label `"No active phase"` in muted text. Never red.
4. **Cap the red threshold** so it only triggers on truly-current phases that are at/past their end. Remove the `elapsedPct > 90` red trigger — keep red strictly for `daysLeft <= 0 && state === "current"`. Amber stays at `elapsedPct > 80`.

## Out of scope
- No DB changes, no RLS changes, no changes to `derivePhaseDates` or `usePhaseBoundaries`.
- No changes to compliance, streak, nutrition, or filters.
- Other pages (Plan view, calendar) unchanged.

## Verification
- New client with program starting today → grey 0% bar, "Starts in 0d" (not red).
- Client mid-Phase 2 → green/amber bar with correct phase name (regression check from prior fix).
- Client with no program assigned → empty grey bar, "No active phase".
- Client whose program has fully ended → empty grey bar (not red Overdue).
