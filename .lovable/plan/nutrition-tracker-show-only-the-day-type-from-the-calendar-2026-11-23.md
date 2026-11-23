# Nutrition tracker: show only the day type from the calendar

## What's wrong
Gary has two meal plans (Training Day and Rest Day). When a client has both, the tracker shows a "Rest Day / Training Day" switcher he can tap, instead of the single badge other clients see. The switcher also picks its day only once and doesn't update when he moves to another date, so it can show Rest Day on a training day (his screenshot: "Rest Day" selected but "Copy from Training Day plan" underneath).

## Fix
- Remove the tappable Rest/Training switcher from the client's nutrition tracker.
- Always show the single badge (Training Day or Rest Day), decided by whether a workout is scheduled on the calendar that day (accessory workouts like mobility still count as rest).
- The meal plan used for "Copy from ... plan", the meal names and the macro targets all follow that same day type, and update when the client changes dates.
- Coaches' view is unchanged.

## Technical details
- `src/components/nutrition/DailyNutritionLog.tsx`: drop the client pill nav (`showPillNav` block) and the one-time `activePlanDayType` default effect; derive `dayTypeKey` purely from `dayType` (resolveDayType) for clients.
- No database changes.
