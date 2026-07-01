## Fix 7-Day Average card placement on mobile

**Problem**
The 7-Day Average block was accidentally inserted *inside* the "Change" column's `<p>` tag in `WeightHistoryScreen.tsx` (lines ~305–322). That's why on iPhone it renders squeezed into the top-right corner overlapping the chart — it's living inside one of the three grid columns instead of being its own row.

**Fix (single file: `src/components/dashboard/WeightHistoryScreen.tsx`)**

1. **Move the 7-Day Average card out of the grid.** Close the Change column's `<p>` and the grid `<div>` properly first, then render the average card as a sibling *below* the Starting/Current/Change grid — full width of the dialog.

2. **Rework the card to fit mobile cleanly** (matches the compact style of the rest of the summary):
   - Full-width row, horizontal layout
   - Left: small uppercase gold label `7-DAY AVERAGE` + tiny helper text `Sum of last 7 entries ÷ 7`
   - Right: large gold number `200.6 lbs` on a single line (no wrapping)
   - Subtle gold border + `bg-primary/5`, rounded, `px-4 py-3`
   - `whitespace-nowrap` + `tabular-nums` on the number so "200.6 lbs" never wraps to two lines like in the screenshot

3. No logic changes — `sevenDayAverage` calculation stays exactly as-is. Purely a JSX structure + styling fix.

**Result**

```text
[ Starting ]  [ Current ]  [ Change ]
[  7-DAY AVERAGE · Sum ÷ 7        200.6 lbs  ]
[  chart ...                                  ]
```

Card sits cleanly between the summary row and the chart, readable on 375px iPhone screens, no overlap with the graph.
