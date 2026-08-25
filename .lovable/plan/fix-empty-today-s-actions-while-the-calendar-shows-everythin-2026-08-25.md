# Fix empty Today's Actions while the calendar shows everything

## What's happening

Confirmed by reading the code and checking the data: the client in the screenshots (the one with "CHEST + TRIS" and two walking sessions) genuinely has 4 scheduled events on Aug 25 in the database, and the calendar renders them. The dashboard shows only "Track Nutrition — 0/1".

The reason is how the two screens handle a failed request:

- The calendar treats a failed events request as an error and shows a retry state.
- Today's Actions treats a failed events request as "no events". It then builds the list from an empty events set, always appends the synthetic "Track Nutrition" row, and returns that as a **successful** result — which gets cached in memory for 60 seconds, saved into the local dashboard snapshot, and pre-cached for the previous and next day too.

So one slow or timed-out request (common on cellular / after the app resumes) turns into a confidently wrong "nothing scheduled today, 0/1" that sticks around and paints instantly on the next open. This is exactly what the client described: finished a workout, then the dashboard showed nothing for today except nutrition, while the calendar was fine.

## The fix

1. **Fail loudly instead of silently emptying the list.** In the Today's Actions fetch, if the calendar events request fails or is aborted, throw. Only the supporting lookups (cardio logs, nutrition presence, completed workout sessions) stay best-effort, since losing them degrades a completion checkmark rather than deleting the whole day.
2. **Never cache or snapshot a bogus empty day.** Because the fetch now throws, the shared fetch layer keeps the previous good data, marks the state as failed, and nothing empty is written to the local snapshot or the adjacent-day prefetch caches.
3. **Show a recoverable state in the card.** When the fetch fails and there is no cached/snapshot data, the card shows a short "Couldn't load today's actions" message with a Retry button instead of the misleading "No actions scheduled today. Enjoy your rest!". Keep the current instant-paint-from-snapshot behavior when a snapshot exists.
4. **Distinguish a real empty day from a failure.** The "Enjoy your rest!" copy only renders after a successful fetch.
5. **Also apply the same treatment where the day's actions are prefetched** so a failed adjacent-day prefetch doesn't poison the cache for that date.

## Validation

- Type-check and run the existing test suite.
- Drive the client dashboard in a browser at mobile width: verify a normal day lists all scheduled events, then simulate a failing/aborted events request and confirm the card shows Retry (not an empty day), that retry recovers, and that no empty snapshot is persisted.
- Confirm the calendar and completion behavior are unchanged.

## Technical details

- Files: `src/components/dashboard/TodayActions.tsx` (fetch error handling, prefetch, failure UI). No schema, RLS, or query-shape changes; the underlying data and permissions are already correct.
- The shared `useDataFetch` layer already keeps stale-but-good data and exposes `error` / `timedOut` / `refetch`; this change just starts using those signals for this card.
