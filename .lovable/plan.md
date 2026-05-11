## Problem

In a client's Training tab, editing a workout in Phase 3 and pressing Save jumps the view back to the current/active phase (e.g., Phase 1). The intent is to stay on Phase 3 so the coach can keep editing other workouts in that phase.

## Cause

`ClientProgramTwoPane` keeps `selectedPhaseId` in local state with this effect:

```
if (!phases.length) { setSelectedPhaseId(null); return; }
if (selectedPhaseId && phases.some(p => p.id === selectedPhaseId)) return;
setSelectedPhaseId(currentPhaseId ?? phases[0].id);
```

After saving, the parent `TrainingTab` calls `loadClientProgram()`, which briefly sets `phases` to `[]` during the refetch. That early-return wipes `selectedPhaseId` to `null`. When phases repopulate, the fallback re-selects the client's `currentPhaseId` (Phase 1).

## Fix

In `src/components/clients/workspace/training/ClientProgramTwoPane.tsx`:

- Remove the `setSelectedPhaseId(null)` reset when `phases.length === 0`. A transient empty list during a refetch should not clear the user's selection.
- Keep selection sticky: only fall back to `currentPhaseId` / `phases[0]` when `selectedPhaseId` is `null` OR no longer exists in the new phase list (e.g., the selected phase was deleted).
- Scope is session-only; no persistence to localStorage or DB.

Resulting effect logic:

```
if (!phases.length) return;                     // wait for data, keep current selection
if (selectedPhaseId && phases.some(p => p.id === selectedPhaseId)) return;
setSelectedPhaseId(currentPhaseId && phases.some(p => p.id === currentPhaseId)
  ? currentPhaseId
  : phases[0].id);
```

## Out of scope

- No changes to save flow, no changes to `loadClientProgram`, no DB or RLS changes.
- No cross-tab/cross-session persistence.

## Verification

1. As coach on a client's Training tab, click Phase 3 → edit a workout → Save.
2. Confirm the view stays on Phase 3 after the refetch completes.
3. Delete the currently selected phase → confirm it falls back to current/first phase (no broken state).
4. Switch to another tab and back → defaults to client's current phase as before.
