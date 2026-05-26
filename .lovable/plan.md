## Goal
On the Clients page (coach view), make the **Next Phase** column visually mirror the **Current Phase** column with a progress bar, so you can scan the roster and instantly see who has a phase queued vs. who doesn't.

## Where
`src/components/clients/SelectableClientCards.tsx` — `renderNext()` (around lines 788–812) and `renderCurrent()` (725–786) for size parity.

## Changes (UI only, no data/logic changes)

1. **Next Phase — queued state** (when `phase.nextPhaseName` exists):
   - Top row: phase name (truncated) on left, `"in Xd"` or `"Starts {date}"` on right in muted text.
   - Bottom row: a `Progress` bar at `value={0}` styled in the **gold/primary** color (`hsl(var(--primary))`) to signal "queued, not started", plus a `Queued` label on the right where the % currently lives in Current Phase. This gold filled-but-empty bar is the visual cue you want for "has a next phase".

2. **Next Phase — empty state** (no next queued):
   - Same two-row structure as above for alignment.
   - Bar rendered at `value={0}` with **muted** color (or destructive when `isOverdueNoNext`).
   - Right-side label: `"None"` (muted) or `"Needed"` (destructive) — keeps the existing "Needs new phase" / "No next phase queued" copy directly above the bar.

3. **Tighten bar height** from `h-2` → `h-1.5` in **both** `renderCurrent()` and `renderNext()` so the two stacked bars fit comfortably without growing card height. Bump label font from `text-[10px]` to stay readable; no other typography changes.

4. Keep the existing grid (`grid-cols-1 sm:grid-cols-2`) so on the current desktop viewport the two phases sit side-by-side as today; the visual rhythm of two matching bars is what enables fast scanning.

## Out of scope
- No changes to `computeClientPhaseStatuses`, queries, RLS, or the phase data model.
- No change to mobile card layout beyond the height tweak.
- Empty "No active phase" current state keeps its existing `Progress value={0}` (already there).

## Acceptance
- Scott Szeto's card shows: Current bar (orange, 95%, "3d left") + Next bar (gold, 0%, "Phase 2: Standard Sets — Starts May 30 / Queued").
- Clients with no next phase show a muted/destructive flat bar so the *absence* of gold is the scan signal.
- Card heights stay within ~1–2 px of current.