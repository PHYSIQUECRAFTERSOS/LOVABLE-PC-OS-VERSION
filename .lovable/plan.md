# Speed up calendar and day switching

## Goal
Make the client calendar paint immediately from recent data and make dashboard date taps avoid the current multi-round-trip delay.

## Changes
- Remove the calendar’s workout-label lookup from the critical loading path; calendar events render as soon as the main data wave finishes.
- Reduce calendar payloads to only the fields used by the UI and use the existing fast calendar database function for client event retrieval where safe.
- Cache successful client calendar results locally as display-only snapshots so reopening the calendar does not begin on a blank skeleton.
- Collapse the dashboard day-action fetch into fewer request waves by loading linked workout details with calendar events, while retaining completion checks and independent error fallbacks.
- Prefetch adjacent dashboard dates after the selected day loads so tapping another visible day is usually a cache hit.
- Keep current role permissions, event completion behavior, local-date handling, and coach scheduling behavior unchanged.

## Validation
- Run focused tests/type validation through the project harness.
- Verify the client dashboard date strip and calendar on a 402px mobile viewport, including cached revisits and event opening.

## Technical details
- Frontend-only unless investigation proves the existing fast calendar function cannot preserve current visibility semantics.
- Display snapshots are never authoritative and are replaced by fresh backend results.
