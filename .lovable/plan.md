## Problem

On the client's Training → Workout History view, each exercise has a chart plotting **Max Weight** (gold) and **Volume** (blue) on a **single shared y-axis**. Because volume (weight × reps × sets) is typically 1,000–8,000 and max weight is only 50–250, the gold line gets squashed to the bottom and looks flat — exactly what your client Scott pointed out.

File: `src/components/training/WorkoutHistory.tsx` (the per-exercise trends block).

## Solution: Dual Y-Axis

Recharts supports two `<YAxis>` elements with `yAxisId`. Plot Max Weight on a right-side axis scaled to its own range, and Volume on the left axis. This is the cleanest, most readable fix and matches what Scott specifically requested ("max weight on a secondary right axis").

### Visual outcome

```text
 Volume                          Max Weight
 (left)                            (right)
  6000 ┤        ╭───────╮            ┤ 250
  4500 ┤   ╭────╯       ╰─╮          ┤ 200
  3000 ┤───╯              ╰──        ┤ 150
  1500 ┤                             ┤ 100
     0 ┤─────────────────────        ┤  50
       Apr 10   May 1   Jun 15
       ○─ Max Weight (gold, right)
       ○─ Volume (blue, left)
```

Both lines now use the full vertical space of the chart and trends are visible.

## Implementation Details

In the per-exercise `<LineChart>` block in `WorkoutHistory.tsx`:

1. Add two `<YAxis>` components:
   - Left: `yAxisId="left"` for Volume, blue tick color.
   - Right: `yAxisId="right" orientation="right"` for Max Weight, gold tick color (`hsl(var(--primary))`).
2. Add `yAxisId="left"` to the Volume `<Line>` and `yAxisId="right"` to the Max Weight `<Line>`.
3. Bump chart height slightly (e.g. `h-40` → `h-44`) so the extra axis labels don't crowd.
4. Keep tooltip + legend as-is (legend already labels both series).
5. Apply the same dual-axis treatment only to the **per-exercise trends** chart. The top-level "Total Volume Trend" chart stays single-axis (it only plots one series).

No data fetching, schema, or business-logic changes — purely a chart-rendering tweak in one file.

## Out of scope

- Changing how volume or max weight are computed.
- Reworking the top "Total Volume Trend" chart.
- Coach-side workout history views.
