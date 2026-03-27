

# Fix: Daily Rewards Spam, Cardio XP Sync, and 0% Completion Ring

## Issue 1: Daily Rewards Popup Showing Multiple Times

**Root Cause**: Two problems:
1. The popup shows even when total XP is `+0` (screenshot confirms this — useless popup)
2. The `useEffect` depends on `[user?.id]` which can re-fire during auth state settling, and the localStorage guard is inside an async function with a 1.5s delay — creating a race window where the component can unmount/remount before localStorage is written

**Fix** (`src/components/ranked/DailyRewardsPopup.tsx`):
- Add a **module-level flag** (`let shownThisSession = false`) that prevents re-showing within the same app session, regardless of component mount/unmount cycles
- Skip showing the popup entirely when `totalXP === 0` — a "+0 XP" popup has zero dopamine value and feels broken
- Keep the localStorage date check as a cross-session guard

## Issue 2: Cardio XP Not Updating Dashboard Immediately

**Root Cause**: After `CardioPopup` completes, it calls `onCompleted()` which invalidates `today-actions` cache. But the **Rank Dashboard Card** uses separate React Query keys (`my-rank`, `xp-today`) that are never invalidated. The user has to leave and return for stale data to expire.

**Fix** (`src/components/dashboard/CardioPopup.tsx`):
- After completion + XP award, dispatch a `calendar-event-added` custom event (already listened to by TodayActions for instant refetch)
- Use React Query's `queryClient.invalidateQueries` to immediately invalidate `my-rank` and `xp-today` keys so the rank card refreshes with new XP
- Import `useQueryClient` from `@tanstack/react-query`

**Fix** (`src/components/dashboard/TodayActions.tsx`):
- In `handleCardioCompleted`, also dispatch `calendar-event-added` event to ensure all listeners (including the completion ring's data source) refresh

## Issue 3: Completion Ring Showing 0% When All Tasks Complete

**Root Cause**: The completion ring derives its data from `todayItems` state in `ClientDashboard`. When the user completes tasks and navigates back, `todayItems` starts as `[]` (initial state), showing 0/0 = 0%. The `TodayActions` component then loads cached (potentially stale) data, and `onDataLoaded` fires — but if cache is stale from before completion, the ring shows old data.

**Fix** (`src/pages/Dashboard.tsx`):
- Listen for `calendar-event-added` events in `ClientDashboard` to force TodayActions cache invalidation and refetch
- Add a `refreshKey` counter that increments on the event, passed to `TodayActions` to force a fresh query

**Fix** (`src/components/dashboard/TodayActions.tsx`):
- Accept an optional `refreshKey` prop that gets appended to the cache key, ensuring a fresh fetch when tasks are completed
- Move the `onDataLoaded` call out of `queryFn` and into a `useEffect` that watches `data`, so it fires on every data update (including cache hits), not just when `queryFn` runs

## Files Changed

1. `src/components/ranked/DailyRewardsPopup.tsx` — Module-level session guard + skip 0 XP
2. `src/components/dashboard/CardioPopup.tsx` — Dispatch events + invalidate React Query after completion
3. `src/components/dashboard/TodayActions.tsx` — Accept refreshKey prop, fix onDataLoaded to fire on all data updates
4. `src/pages/Dashboard.tsx` — Listen for calendar-event-added, pass refreshKey to TodayActions

