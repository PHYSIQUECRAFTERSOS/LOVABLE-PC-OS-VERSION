

# Fix CalendarTab Click Behavior and "+more" Overflow

## Problems

1. **Event clicks open schedule form instead of event details** — The entire day cell has an `onClick={() => handleDayClick(day)}` that opens the schedule dialog. Individual event items inside cells are plain `<div>`s with no click handler. Clicking an event bubbles up to the day cell, opening the schedule form.

2. **"+N more" is not clickable** — It's a plain `<span>` element with no interactivity, so users can't see overflow events.

Both issues are in `CalendarTab.tsx`. The `CalendarGrid.tsx` (used on the coach `/calendar` page) already handles both correctly — events use `e.stopPropagation()` and "+more" opens an expanded day dialog. CalendarTab needs the same treatment.

## Changes — `src/components/clients/workspace/CalendarTab.tsx`

### 1. Add event detail modal
- Import `EventDetailModal` from `@/components/calendar/EventDetailModal`
- Add state for `selectedEvent` and `showEventDetail`
- Wire up `onComplete` and `onDelete` handlers (reuse existing supabase patterns)
- Render `<EventDetailModal>` at the bottom of the component

### 2. Make event items clickable
- Change event items from `<div>` to `<button>` 
- Add `onClick` with `e.stopPropagation()` → set `selectedEvent` and open detail modal
- Keep drag behavior on these items

### 3. Fix "+more" overflow
- Add state `expandedDay: Date | null`
- Change the "+N more" `<span>` to a `<button>` with `e.stopPropagation()` → set `expandedDay`
- Add an expanded day `<Dialog>` (same pattern as CalendarGrid) listing all events for that day, each clickable to open event detail

### 4. Map CalEvent to CalendarEvent type
- The `EventDetailModal` expects a `CalendarEvent` type. Need to adapt the local `CalEvent` to include missing fields (description, notes, etc.) or fetch them. Simplest: expand the initial query to include `description, notes, linked_workout_id, linked_cardio_id, linked_checkin_id, is_recurring, recurrence_pattern, target_client_id, completed_at, end_time` so the modal has full data.

## No database changes needed

