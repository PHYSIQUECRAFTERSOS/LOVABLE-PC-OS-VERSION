

# Fix Floating-Point Display in Meal Plan Builder

## Problem
The `calcMacros()` function returns raw floating-point values (e.g., `91.46666666666668cal`, `2.80000000000000003P`). These are displayed without rounding in three places:
1. **Per-food inline macros** (line 912-916) — no rounding at all
2. **Day Total row** (line 950-954) — no rounding
3. **Day header summary** (line 836) — no rounding

The sidebar "remaining" display already uses `Math.round()` and works correctly. The fix keeps full floating-point precision in state/calculations but rounds only at the display boundary.

## The "0 cal left but 8g protein remaining" Problem
This happens because calories and macros are rounded independently. Example: 7.6g protein × 4 = 30.4 cal. Rounding protein → 8g, but 30.4 cal rounds to 0 remaining. The sidebar already handles this correctly with `Math.round(remaining)`. The food-level and day-level displays just need the same treatment.

## Changes

### File: `src/components/nutrition/MealPlanBuilder.tsx`

**1. Per-food macro display (lines 912-916)** — wrap each value in `Math.round()`:
```tsx
<span>{Math.round(macros.calories)}cal</span>
<span className="text-red-400">{Math.round(macros.protein)}P</span>
<span className="text-blue-400">{Math.round(macros.carbs)}C</span>
<span className="text-yellow-400">{Math.round(macros.fat)}F</span>
```

**2. Day Total display (lines 950-954)** — wrap in `Math.round()`:
```tsx
<span>{Math.round(dayTotals.calories)} cal</span>
<span className="text-red-400">{Math.round(dayTotals.protein)}P</span>
// ... same for carbs, fat, fiber, sugar
```

**3. Day header summary (line 836)** — wrap in `Math.round()`:
```tsx
{Math.round(dayTotals.calories)} cal · {Math.round(dayTotals.protein)}P · {Math.round(dayTotals.carbs)}C · {Math.round(dayTotals.fat)}F
```

**4. Meal header summary (line 869)** — already uses `Math.round()` ✓ — no change needed.

### NO changes to:
- `calcMacros()` — keeps full precision for accumulation
- `getMealTotals()` / `getDayTotals()` — keeps full precision so the sidebar remaining calculation stays accurate
- `activeDayTotals` — feeds into sidebar which already rounds
- Database persistence (lines 709-712) — already uses `Math.round()` ✓

## Summary
Three display-only lines need `Math.round()` wrappers. Zero logic changes. Full precision preserved in calculations and persistence. One file edited.

