

# Fix Check-In Completion + Remove Biofeedback Trends + Fix Photo Compare

## Problem 1: Check-in doesn't cross off dashboard/calendar

The root cause: when a coach schedules a check-in event for a client, the event is stored with `target_client_id = client_id` (not `user_id = client_id`). But both `WeeklyCheckinForm` and `CheckinSubmissionForm` only update events matching `.eq("user_id", user.id)`, which never matches coach-scheduled events. The fix is to also update events where `target_client_id` matches.

**Files:** `src/components/checkin/WeeklyCheckinForm.tsx`, `src/components/checkin/CheckinSubmissionForm.tsx`

Change: Replace the single calendar update call with two calls — one for `user_id` match and one for `target_client_id` match. This covers both self-created and coach-scheduled check-in events.

```typescript
// Update both user_id and target_client_id matches
await Promise.all([
  supabase.from("calendar_events")
    .update({ is_completed: true, completed_at: now })
    .eq("user_id", user.id).eq("event_date", today)
    .eq("event_type", "checkin").eq("is_completed", false),
  supabase.from("calendar_events")
    .update({ is_completed: true, completed_at: now })
    .eq("target_client_id", user.id).eq("event_date", today)
    .eq("event_type", "checkin").eq("is_completed", false),
]);
```

## Problem 2: Remove Biofeedback Trends tab

**File:** `src/pages/Progress.tsx`

- Remove the "Trends" `TabsTrigger`
- Remove the `TabsContent value="trends"` block
- Remove the `BiofeedbackTrends` import
- Remove `trends` from `TAB_MAP`

## Problem 3: Fix Side-by-Side photo comparison layout

The current layout stacks the two comparison photos vertically on mobile (`grid-cols-1 md:grid-cols-2`), and the week selectors take up too much space. The user wants both photos always side-by-side with the date underneath each photo.

**File:** `src/components/biofeedback/PhotoComparisonSlider.tsx`

Changes to the Side-by-Side tab:
- Change the comparison grid from `grid-cols-1 md:grid-cols-2` to always `grid-cols-2` so photos are always side-by-side on mobile
- Remove the `aspect-[3/4]` constraint and use a more compact layout so both fit on screen
- Keep the date label beneath each photo (already present)
- Simplify the week selector area — make the selectors more compact with smaller buttons

