# Fix Training Phase Deadlines so no client is missed

## What went wrong with Jose
Jose's current program ("4 days a week") lists his phases in this order: Phase 3 (Aug 16 – Oct 10), then his old Phase 1 and Phase 2, which already finished months ago. The app treated any phase listed *after* the current one as "queued next", even though those old phases are in the past. So:
- The Clients list said "phase queued" (it was really an old, finished phase).
- The overview hid him from "Due within 7 days" because it thought something was queued.
- The new Phase 4 added today also gets dates in the past (it lines up after the old Phase 1/2 dates), so it doesn't count as a real next phase either.

## Changes
1. **"Queued" only means a real future phase.** A next phase only counts when it starts after the current phase ends and hasn't ended yet. Old, finished phases sitting later in the list no longer count. The Clients list and the overview use the same rule, so they always agree.
2. **Overdue clients always show, in red.** Any client whose last phase has ended with nothing real queued is listed under Overdue with a red highlight and "Xd overdue".
3. **Active clients with no training program show in red** under Overdue as "No program assigned".
4. **Due within 7 days** stays as is (amber), now correct thanks to change 1.
5. The overview only lists clients who need action, as you asked.

## Check after building
- Jose shows under Overdue in red on the overview, and the Clients list no longer says "phase queued" for him.
- A client whose next phase really is set up for the future still doesn't show.
- The count line at the top of the section matches what's listed.

## Technical details
- `src/lib/clientPhaseStatus.ts`: `next` = earliest phase with `start_date > current.end_date` and `end_date >= today`; in the "ended" state, also look for a real future phase. Add a `no_program` status for active clients with no active/subscribed assignment or no phases.
- `src/components/dashboard/CoachCommandCenter.tsx`: push `no_program` clients into the overdue group ("No program assigned"); keep red styling (`destructive` tokens) and sort overdue first.
- `SelectableClientCards.tsx` already reads `status.next`, so it picks up the fix automatically.
- Add a small vitest for the "past phase listed later is not queued" rule using Jose's phase layout.
- No database changes. Jose's phase dates/order can be fixed in the program builder if you want Phase 4 to land on the calendar from today; I won't touch his data without asking.
