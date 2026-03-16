# Fix: Custom Foods Search Returns No Results + Nutrition Search Improvements

## Root Cause

In `FoodSearchPanel.tsx` line 316, when the "Custom Foods" tab is active and a search query is entered, the code filters `localResults` (from the edge function) by `f.data_source === "custom"`. However, on line 201, the mapping sets `data_source: r.source ?? "open_food_facts"` — overwriting the actual database `data_source` value. The edge function never returns `source: "custom"`, so the filter matches nothing.

Meanwhile, the `customFoods` array (already loaded on mount from `food_items` where `data_source = "custom"`) is sitting in state but never used when there's a query.

## Fix

**File: `src/components/nutrition/FoodSearchPanel.tsx**`

Replace the Custom Foods tab search logic (line 316 area in `getDisplayList`) to:

1. When `activeFilter === "custom"` and there's a query, do a **client-side filter** on the already-loaded `customFoods` array using case-insensitive substring matching against name and brand. 2. Preserve `data_source` from edge function
  The mapping on line 201 (`data_source: r.source ?? "open_food_facts"`) should use a dedicated field if available. The edge function already returns per-food metadata — we should map `r.is_custom` or check for `data_source` in the response payload.
  ### 3. Custom foods should always surface first (across ALL tabs)
  When searching on the "All" tab, custom foods matching the query should be boosted to the top, similar to how MyFitnessPal prioritizes "My Foods." This is a sort-order change in `getDisplayList`.
2. Merge these with any edge function results that genuinely have `data_source === "custom"` (for future-proofing)
3. Also fix the `data_source` mapping (line 201) to preserve the actual value from the edge function response rather than defaulting to `"open_food_facts"`

```typescript
// In getDisplayList, replace the custom filter line:
else if (activeFilter === "custom") {
  const q = query.toLowerCase();
  const matchingCustom = customFoods.filter(f =>
    f.name.toLowerCase().includes(q) ||
    (f.brand ?? "").toLowerCase().includes(q)
  );
  combined = matchingCustom;
}
```

## Consultant-Level Improvements

Beyond the bug fix, here are high-impact improvements modeled after MyFitnessPal and MacroFactor:

### 1. Unified search across all sources in Custom tab

Currently the Custom tab is siloed. The fix above makes it searchable. No further DB changes needed.

### 2. Preserve `data_source` from edge function

The mapping on line 201 (`data_source: r.source ?? "open_food_facts"`) should use a dedicated field if available. The edge function already returns per-food metadata — we should map `r.is_custom` or check for `data_source` in the response payload.

### 3. Custom foods should always surface first (across ALL tabs)

When searching on the "All" tab, custom foods matching the query should be boosted to the top, similar to how MyFitnessPal prioritizes "My Foods." This is a sort-order change in `getDisplayList`.

### 4. Increase custom food load limit

Currently capped at 50 (line 150). Coaches with large food databases will hit this. Increase to 200 or remove the limit for the filtered view.

## Files Changed


| File                                           | Change                                                                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/components/nutrition/FoodSearchPanel.tsx` | Fix custom tab filtering, boost custom foods in All tab, increase load limit |
