

# Plan: Add Apple Health Metrics to Client Dashboard

## What Changes

The HealthKit integration already syncs **active calories** and **walking/running distance** into the `daily_health_metrics` table, but the dashboard only shows Steps, Weight, Photos, and Calories. We'll expand the grid to 3 rows (6 cards) and add two new metric cards that display real HealthKit data with 7-day sparklines.

## File: `src/components/dashboard/ProgressWidgetGrid.tsx`

### 1. Add Active Calories card (row 3, left)
- Icon: `Zap` (energy bolt)
- Label: "Active Cal"
- Value: `todayMetrics.active_energy_kcal` from `useHealthSync()` — already available, no new fetch needed
- Sparkline: 7-day `weekMetrics.map(d => d.active_energy_kcal ?? 0)`
- Fallback: "–" when no data, "Connect Health App" hint when disconnected

### 2. Add Distance card (row 3, right)
- Icon: `MapPin` or `Route` (Lucide)
- Label: "Distance"
- Value: `todayMetrics.walking_running_distance_km` formatted as `X.X km`
- Sparkline: 7-day `weekMetrics.map(d => d.walking_running_distance_km ?? 0)`
- Same fallback pattern

### 3. Fix Steps card sync
- The Steps card currently has a split logic: `isConnected && steps` vs `manualSteps`. With HealthKit now syncing into the same `daily_health_metrics` table, the `todayMetrics.steps` value should already contain the HealthKit steps. Update `isConnected` to also be true when `todayMetrics?.source === "apple_health"` — so the sparkline and value render correctly even when the health_connections record isn't loaded yet.

### 4. Layout — iPhone-optimized 2-column grid
- Change from 4 cards (2x2) to 6 cards (2x3)
- Same `grid grid-cols-2 gap-3` — no layout change needed, just add 2 more children
- Cards already use `p-3 sm:p-4`, `text-lg sm:text-xl`, `truncate`, and `overflow-hidden` — iPhone-safe
- New cards follow the exact same card pattern/classes as existing ones

### 5. Click behavior
- Active Calories: taps navigate to `/progress?tab=steps` (reuses the existing steps/health screen)
- Distance: same navigation target

## No database changes needed
The `daily_health_metrics` table already has `active_energy_kcal` and `walking_running_distance_km` columns, populated by the HealthKit sync in `useHealthSync.ts`.

## Files to modify
- `src/components/dashboard/ProgressWidgetGrid.tsx` — add 2 cards, fix steps display logic

