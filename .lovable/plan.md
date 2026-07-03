## Problem

The "7-Day Average" on the weight modal currently does:

```
sum(last 7 entries in the range) ÷ 7
```

Two issues:

1. It always divides by **7**, even if only 2 entries were logged — so 2 entries of ~174 lbs each produce ~49.6 lbs (matches the screenshot).
2. It uses `slice(-7)` = last 7 rows, not "entries from the last 7 days" — so if a client logged 7 times in the past 30 days, all of them would be averaged.

## Fix

In `src/components/dashboard/WeightHistoryScreen.tsx`, replace the 7-Day Average calculation with:

- Filter deduped entries to those with `logged_at` within the **last 7 calendar days** (using `getLocalDateString()` for the cutoff so timezone matches the rest of the app).
- Divide the sum by the **actual count** of those entries, not 7.
- If zero entries fall in that window, hide the card (or show em-dash) instead of showing a misleading number.
- Update the label from `"Sum of last 7 entries ÷ 7"` to something honest like `"Avg of N entries in last 7 days"` (N substituted at render time).

## Files touched

- `src/components/dashboard/WeightHistoryScreen.tsx` — average calc + label + optional entry-count badge.

## Clarifying questions

- Do you want the average to appear on **other ranges too** (30D, 3M, etc.) with the same "actual entries only" logic, or keep it **7D-only**? only 7 day 
- If only **1 entry** exists in the last 7 days, should we (a) show that single value as the "average", (b) hide the card, or (c) show a prompt to log more? show that single value as the average
- Should the label include the entry count (e.g. `Avg of 2 entries in last 7 days`), or stay minimal? stay minimal
- &nbsp;