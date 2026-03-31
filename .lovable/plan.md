

## Plan: Fix Client Cards — Remove Tags + Revamp Compliance Score

### Problem 1: Client names are obscured
Tags (e.g., "PROGRAM COMPLETE[ WEEKLY]") clutter the card and push the client name out of view, especially on smaller screens.

### Problem 2: Compliance score is inaccurate
Current compliance only counts `workout_sessions` with `completed_at` vs total sessions. It ignores nutrition tracking and cardio — so a client doing everything right still shows 37%.

---

### Fix 1: Remove Tag Badge from Client Cards

**File**: `src/components/clients/SelectableClientCards.tsx`

Remove the tags badge block (lines 561-566) that renders `client.tags[0]` on the right side of each card. Tags remain in the data model and are still filterable via the Tags dropdown — they just won't render on the card itself, freeing up space for the name and program type badge.

---

### Fix 2: Revamp 7-Day Compliance Score

**File**: `src/components/clients/SelectableClientCards.tsx`

Replace the current workout-only compliance calculation (lines 172-204) with a holistic 7-day score based on three pillars:

| Pillar | Source | "Scheduled" | "Completed" |
|---|---|---|---|
| Workouts | `calendar_events` where `event_type` contains workout-related types | Events with `linked_workout_id` or workout event_type in last 7 days | `is_completed = true` |
| Cardio | `calendar_events` where `event_type = 'cardio'` | Cardio events in last 7 days | `is_completed = true` |
| Nutrition | `nutrition_logs` | Days in last 7 where a nutrition target exists | Days where total logged calories > 0 |

**Calculation**: 
```
compliance = (completedEvents + nutritionDaysLogged) / (totalEvents + nutritionDaysExpected) × 100
```

This uses `calendar_events` (which already has `is_completed`, `event_type`, `user_id`) as the source of truth for scheduled workouts and cardio, and cross-references `nutrition_logs` + `nutrition_targets` for nutrition tracking days.

**Implementation**: Batch-fetch all calendar events and nutrition data for all client IDs in a single query set (not N+1), then compute per-client scores in JS. The streak calculation also updates to use this combined data.

### File Changes

| File | Change |
|---|---|
| `src/components/clients/SelectableClientCards.tsx` | Remove tag badge from card UI; replace compliance calc with calendar_events + nutrition-based 7-day score |

