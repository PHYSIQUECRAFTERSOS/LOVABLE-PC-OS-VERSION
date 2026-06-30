## Goal
From Master Libraries → open a program → "Copy Phase to Client", be able to pick a client who was invited but hasn't completed signup/onboarding yet, so their phase is already waiting when they first log in.

## Why it's currently blocked
When you send a client invite, the backend already pre-creates the auth user, profile, and a `coach_clients` row with `status = 'pending'`. But every "Copy Phase to Client" picker filters strictly to `status = 'active'`, so pending invitees never appear in the search dropdown.

Affected pickers (same bug, three call sites):
1. `src/components/training/ProgramDetailView.tsx` → `loadCopyClients()` (the dialog shown in your first screenshot, inside Master Libraries)
2. `src/components/clients/workspace/training/CopyPhaseToClientDialog.tsx` (used from the client workspace Training tab)
3. The "Subscribe Program" / assign flow on the client workspace Training tab (same `status='active'` filter via `SearchableClientSelect` source)

## Changes

### 1. Include pending clients in all three pickers
- Change the `coach_clients` query from `.eq("status", "active")` to `.in("status", ["active", "pending"])` in the three files above.
- In each result row, attach a `status` flag and render a small "Pending" badge next to the name in `SearchableClientSelect` so the coach knows the client hasn't logged in yet.
- Sort: active first, then pending, each alphabetical.

### 2. Auto-handle "no active program" for pending clients
`copyPhaseToClientProgram` (append mode) refuses when the client has no active program. The Master-Libraries dialog already has a fallback that creates a brand-new one-phase program for them and inserts a `client_program_assignments` row with `status='active'`. We need to make sure that fallback always runs for pending clients:
- In `ProgramDetailView.handleCopyPhaseToClient`: if the selected client has no active program (detected either by `copyPhaseToClientProgram` returning the "no active program" error OR by checking `coach_clients.status === 'pending'`), skip the append attempt and go straight to the "create fresh program" path. Default `startDate` to today unless the coach picked a specific date.
- In `TrainingTab.handleCopyPhaseToClient` (which currently only calls the append helper): add the same fallback — when the target client has no active program, create a one-phase program for them and insert the assignment, mirroring the logic already in `ProgramDetailView`. Extract the duplicated fallback into a small shared helper in `src/lib/copyPhaseHelpers.ts` (e.g. `createSinglePhaseProgramForClient`) so both call sites use the same path.

### 3. Dialog copy/UX tweaks (small)
- In the Master-Libraries copy dialog, when the selected client is pending, show an inline note: "This client hasn't signed up yet — the phase will be waiting on their first login."
- Keep the existing "Start immediately / Start on a specific date" options; default to "specific date = today" for pending clients so the assignment has a concrete start.

## Out of scope
- No DB schema changes. `coach_clients.status='pending'` and pre-created auth user already exist from the invite flow.
- No changes to the invite email or onboarding flow.
- No changes to nutrition/meal plan assignment (this request is training-only).

## Files touched
- `src/components/training/ProgramDetailView.tsx` — widen client query, add pending badge, route pending clients to fresh-program path.
- `src/components/clients/workspace/training/CopyPhaseToClientDialog.tsx` — widen client query, add pending badge.
- `src/components/clients/workspace/TrainingTab.tsx` — widen client query for subscribe/assign, add fresh-program fallback in `handleCopyPhaseToClient`.
- `src/lib/copyPhaseHelpers.ts` — new shared `createSinglePhaseProgramForClient` helper used by both fallbacks.
- `src/components/ui/searchable-client-select.tsx` — optional: support an optional `status` field per option to render the "Pending" badge.

## Verification
- Invite a brand-new client (don't accept the invite). From Master Libraries → open a program → Copy Phase to Client → the pending client appears with a "Pending" badge, copy succeeds, and an active `client_program_assignments` row is created for them.
- Accept the invite as that client → on first login the program shows up in their Training tab with the correct phase and workouts.
- Existing active-client copy flow (both from Master Libraries and from the client workspace) still works unchanged.
