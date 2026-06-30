
## Goal

Two fixes so coaches can pre-load training for pending (invited but not-yet-signed-up) clients exactly like active ones:

1. From a pending client's profile → Assign Training Program dialog: allow choosing a specific **phase** of the master program (not just the whole program).
2. From Master Libraries → "Assign Phase to Client" picker: include **pending** clients (currently only active clients show up).

## Changes

### 1. `src/pages/MasterLibraries.tsx` — include pending clients in the assign picker

In `loadClients()` (around line 218):
- Change the `coach_clients` query from `.eq("status", "active")` to `.in("status", ["active", "pending"])`.
- Select `status` alongside `client_id`, keep it on each entry in `clients` state (extend the state shape to `{ id, name, status }`).
- Sort active first, then pending; alphabetical within each group (same pattern already used in `CopyPhaseToClientDialog.tsx`).
- In the "Assign Dialog" (line 887), append a " (Pending)" suffix to the display name for pending entries before passing to `SearchableClientSelect`, so the coach can tell them apart. Add a small inline note under the picker when the selected client is pending: *"This client hasn't signed up yet — the program/phase will be waiting on first login."*

`assignToClient()` already works for any client_id (it inserts into `programs` + `client_program_assignments`), and the existing `assignPhaseId` branch already supports single-phase assignment, so no logic changes are needed beyond surfacing pending clients.

### 2. `src/components/clients/workspace/TrainingTab.tsx` — add Phase selector to AssignProgramDialog

The dialog currently only picks a Master Program. Add an optional **Phase** dropdown directly under the Master Program selector.

- Add new state: `selectedAssignPhaseId: string` (default `""` → "Entire program").
- After a master program is picked, reuse the existing `loadMasterPhases(programId)` helper to populate `masterPhasesList`. (It's already defined and used elsewhere on this page.)
- Render a second selector in `AssignProgramDialog` (lines 1440–1520):
  - Label: "Phase (optional)"
  - First option: "Entire program (all phases)"
  - Then each phase listed as `{name} · {duration_weeks}w`.
  - Hidden / disabled until a master program is chosen.
- Update `handleAssignProgram` (line 348):
  - If `selectedAssignPhaseId` is set, filter `masterPhases` to only that one phase before the clone loop, set `phase_order = 1`, and compute `programDuration` from that phase only. Use program name `"{master.name} — {phase.name}"` and set `is_linked_to_master: false` for single-phase assigns (matches the MasterLibraries convention so partial assigns don't try to sync from the multi-phase master).
  - Otherwise behavior is unchanged.
- Reset `selectedAssignPhaseId` to `""` whenever the master program changes or the dialog closes.

Both flows already write to `programs` + `client_program_assignments` keyed by `client_id`, which works for pending clients (their row exists in `coach_clients` and `auth.users` via the invite flow), so no schema or RLS changes are required.

## Out of scope

- No DB migration.
- No changes to `copyPhaseHelpers.ts` (already handles pending clients via `createSinglePhaseProgramForClient`).
- No UI redesign — keeping the existing dialog layout, only adding one optional select and a status-aware label.
