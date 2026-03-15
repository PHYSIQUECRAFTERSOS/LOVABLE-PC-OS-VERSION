

# Add "Clear Calendar" Feature to Coach Client Calendar

## What It Does

Adds a trash-can icon button next to the "Schedule" button in the CalendarTab header. Clicking it opens a "Clear Calendar" dialog with:

1. **Date range picker** — two date inputs (start/end) defaulting to current month
2. **Program selector** — shows the client's active program (pre-selected)
3. **Status filter** — dropdown: "All items", "Scheduled only", "Completed only"
4. **Event type checkboxes** — Workouts, Cardio, Body Stats, Photos, Auto Messages, Check-in Form (all unchecked by default)
5. **CLEAR button** — deletes matching `calendar_events` rows in the date range for the client, filtered by selected types and status

This mirrors the Trainerize "Clear calendar" dialog shown in the screenshots.

## Technical Approach

### Single file change: `src/components/clients/workspace/CalendarTab.tsx`

**New state variables:**
- `showClearDialog`, `clearStartDate`, `clearEndDate`, `clearStatus`, `clearTypes`, `clearing`

**New handler: `handleClearCalendar`**
- Builds a Supabase delete query on `calendar_events` filtered by `user_id = clientId`, date range (`gte`/`lte`), selected `event_type` values, and optional `is_completed` filter
- Executes delete, shows toast with count, reloads month

**UI additions:**
- Trash icon `Button` in the header bar (next to Schedule)
- New `Dialog` with the form layout matching Trainerize: date range inputs, status select, checkbox grid for event types, and a prominent "CLEAR" button

**Event type mapping for clear dialog:**
| Checkbox label | `event_type` value |
|---|---|
| Workouts | `workout` |
| Cardio | `cardio` |
| Body Stats | `custom` |
| Photos | `rest` |
| Auto Messages | `auto_message` |
| Check-in Form | `checkin` |

### No database changes needed
The delete query uses existing RLS — the coach created these events with `user_id = clientId`, and existing policies allow delete by the event owner or coach roles.

## Files Changed

| File | Change |
|------|--------|
| `src/components/clients/workspace/CalendarTab.tsx` | Add clear calendar dialog + trash icon button + delete handler |

