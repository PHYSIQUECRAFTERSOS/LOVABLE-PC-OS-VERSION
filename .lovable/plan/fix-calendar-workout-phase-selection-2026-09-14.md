# Fix calendar workout phase selection

## Goal
When a coach schedules a workout, show only the workouts belonging to the training phase active on the selected calendar date.

## Confirmed findings
- Jack’s active program has Phase 2 with 11 workouts and Phase 3 with 5 different workouts.
- Phase 3 starts September 14, 2026, while the derived Phase 2 range also includes September 14. The shared resolver currently chooses the first matching phase, which selects Phase 2 on that transition date.
- The client calendar starts one workout request before the newly clicked date has reached state, then starts another request for the selected date. Those requests can finish out of order and leave the previous phase’s workouts in the picker.
- Both calendar scheduling screens use the same date-based phase logic, but maintain separate workout-loading flows.

## Changes
1. Update shared phase resolution so overlapping transition dates select the newer phase with the latest start date/highest phase order.
2. In the client calendar, load workouts using the clicked date directly instead of launching an initial request with the previous date.
3. Prevent older in-flight workout requests from overwriting the latest selected date’s results.
4. Clear the selected workout and old workout choices whenever the scheduling date or resolved phase changes.
5. Apply the same stale-request protection to the main calendar scheduling form so both coach entry points behave consistently.
6. Keep workout queries strictly scoped to the resolved phase; do not change programs, phase dates, workout data, calendar events, or unrelated features.

## Validation
- For Jack, verify September 14 and later Phase 3 dates show only the five “Growing season” workouts.
- Verify a Phase 2 date still shows only its eleven workouts.
- Rapidly switch scheduling dates across the phase boundary and confirm an older response cannot replace the correct list.
- Verify the displayed phase label matches the workout list and scheduling still saves the selected workout.
- Run focused type validation and test the coach calendar flow on desktop and mobile widths.

## Technical scope
- Frontend-only; no database, permissions, or data migration changes are required.
- Expected files: the shared phase-boundary hook and the two existing calendar scheduling components.
