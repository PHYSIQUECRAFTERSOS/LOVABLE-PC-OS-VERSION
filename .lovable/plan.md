## Changes to `src/components/dashboard/WeightHistoryScreen.tsx`

**1. Expand "Recent Entries" from 5 → 7**
Change `.slice(0, 5)` to `.slice(0, 7)` so the list always shows the seven most recent entries (matches the 7D range perfectly, and still looks clean on longer ranges).

**2. Add a "7-Day Average" stat when the 7D range is active**
- Compute `avg7 = sum(entries.weight) / 7` (per user's requested formula: sum of the last 7 daily entries divided by 7), converted to the user's display unit and rounded to 1 decimal.
- Only render when `rangeIdx === 0` (7D tab selected), so it doesn't clutter longer views.

**3. Placement**
Add it as a fourth stat directly under the existing Starting / Current / Change summary bar — a full-width highlighted card with a subtle gold accent border so it stands out as the headline number for the 7D view:

```text
[ Starting ] [ Current ] [ Change ]
[      7-Day Average: 200.3 lbs      ]
```

This keeps it in the summary zone (the natural place to look for aggregate numbers) without disrupting the chart or the entries list.

No database, hook, or business-logic changes — purely presentational in the weight modal.
