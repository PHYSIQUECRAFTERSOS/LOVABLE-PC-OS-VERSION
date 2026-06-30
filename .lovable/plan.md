## Goal
Let coaches add clients to an already-created challenge (especially as new clients onboard daily), with a one-click "Add All Clients" option plus selective add — the same capability that currently only exists inside the Create Challenge wizard.

## Where it lives
On every active/upcoming challenge card in the Challenges tab (coach view) and inside `ChallengeDetailView`, add a new **"Add Clients"** button next to the existing controls. Past/completed challenges won't show it.

## Behavior
Clicking opens a new `AddClientsToChallengeDialog` with:
- **"Add All Clients"** button — one click enrolls every client on the coach's roster who isn't already a participant.
- A searchable, multi-select list of clients (using the existing `SearchableClientSelect` pattern) showing only clients not yet enrolled, so the coach can quickly add just new ones.
- Counter: "X clients available to add".
- Confirms with a toast: "Added N clients to {challenge title}".

## Technical notes
- New file: `src/components/challenges/AddClientsToChallengeDialog.tsx`.
- Reuses the same insert pattern as `CreateChallengeWizard.tsx` (lines 238–246): bulk insert into `challenge_participants` with `{ challenge_id, user_id }`.
- Filters roster against current `challenge_participants.user_id` for that challenge to avoid duplicate-key errors.
- Wire button into `ChallengesTab.tsx` (card actions, coach-only) and `ChallengeDetailView.tsx` header (coach-only).
- No DB schema changes; existing RLS on `challenge_participants` already permits coach inserts.

## Out of scope
No changes to the Create Challenge wizard, leaderboard, or scoring logic.
