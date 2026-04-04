

## Fix Dashboard Unit Preferences

### Problem
The `CurrentWeightCard` and `ProgressMomentum` components hardcode "lbs" instead of using the client's preferred unit from `useUnitPreferences()`. The `WeightHistoryScreen` (opened on tap) already converts correctly, but the dashboard surface does not.

### Changes

**File 1: `src/components/dashboard/CurrentWeightCard.tsx`**
- Import and call `useUnitPreferences()` to get `convertWeight` and `weightLabel`
- Apply `convertWeight()` to `latest.weight`, `diff` calculation display
- Replace hardcoded `"lbs"` with `weightLabel`

**File 2: `src/components/dashboard/ProgressMomentum.tsx`**
- Import and call `useUnitPreferences()` to get `convertWeight` and `weightLabel`
- Apply `convertWeight()` to `weightChange`, `currentWeight` display values
- Replace hardcoded `"lbs"` with `weightLabel`

### What stays the same
- Database values remain stored in lbs (no storage changes)
- `ProgressWidgetGrid` distance widget already uses `convertDistance`/`distanceLabel` — no change needed
- `WeightHistoryScreen` already handles unit conversion — no change needed
- Coach/admin views stay imperial (the hook returns identity conversions for those roles)

