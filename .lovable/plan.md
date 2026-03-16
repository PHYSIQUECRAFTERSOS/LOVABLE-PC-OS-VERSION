

# Fix: Recurring Event Skips Second Week

## Root Cause

In `CalendarTab.tsx`, `generateRepeatDates()` (line 392-411) has two bugs:

1. **Day system mismatch**: `repeatDays` uses Mon=0 (from UI toggle indices 0-6 = Mon-Sun), but `weekStart.getDay()` returns JS convention (Sun=0, Mon=1, ..., Sat=6). The diff calculation `(dayNum - weekStart.getDay() + 7) % 7` produces wrong offsets.

2. **Off-by-one via `diff || 7`**: When diff happens to be 0 for week > 0, the expression `diff || 7` forces it to 7, pushing the event forward an entire week — causing the skip.

Tracing example: Schedule Thursday (dayNum=3) from March 19:
- Week 0: weekStart=Mar 19 (Thu, getDay()=4). diff=(3-4+7)%7=6. Adds Mar 25 (Wed) — wrong day!
- Week 1: weekStart=Mar 26. diff=6 again. Adds Apr 1 (Wed) — wrong again.

The base date (Mar 19) is added correctly from initialization, but week 1 (Mar 26 Thu) never gets generated because the diff math lands on the wrong date.

## Fix

Replace `generateRepeatDates` with clean logic that:
1. Finds the Monday of the base date's week
2. For weeks 1 through repeatForWeeks-1, offsets from that Monday by `week * repeatEveryN` weeks
3. Adds `dayNum` directly (since Mon=0 maps perfectly to "days after Monday")
4. If no `repeatDays` selected, defaults to repeating on the same weekday as the base date

```typescript
const generateRepeatDates = (baseDate: Date): string[] => {
  const baseDateStr = format(baseDate, "yyyy-MM-dd");
  const dates: string[] = [baseDateStr];
  if (!repeatEnabled) return dates;

  if (repeatFrequency === "daily") {
    for (let i = 1; i < repeatForWeeks * 7; i++)
      dates.push(format(addDays(baseDate, i), "yyyy-MM-dd"));
  } else if (repeatFrequency === "weekly") {
    // Convert base date to its week's Monday
    const jsDay = baseDate.getDay(); // Sun=0
    const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
    const baseMonday = addDays(baseDate, mondayOffset);

    // If no specific days selected, default to same day as base
    const daysToRepeat = repeatDays.length > 0
      ? repeatDays
      : [jsDay === 0 ? 6 : jsDay - 1]; // convert JS day to Mon=0

    for (let week = 1; week < repeatForWeeks; week++) {
      const weekMonday = addWeeks(baseMonday, week * repeatEveryN);
      for (const dayNum of daysToRepeat) {
        const d = addDays(weekMonday, dayNum);
        const dateStr = format(d, "yyyy-MM-dd");
        if (!dates.includes(dateStr)) dates.push(dateStr);
      }
    }
  } else if (repeatFrequency === "monthly") {
    for (let i = 1; i <= repeatForWeeks; i++)
      dates.push(format(addMonths(baseDate, i), "yyyy-MM-dd"));
  }
  return dates;
};
```

This also fixes the same bug in `ScheduleEventForm.tsx` (lines 238-264) which has the same day-system mismatch in its recurring logic.

## Files Changed

| File | Change |
|------|--------|
| `src/components/clients/workspace/CalendarTab.tsx` | Rewrite `generateRepeatDates` with correct Mon=0 day math |
| `src/components/calendar/ScheduleEventForm.tsx` | Fix recurring generation loop with same day-system fix |

