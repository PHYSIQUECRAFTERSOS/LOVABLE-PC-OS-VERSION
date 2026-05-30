## Problem

The client dashboard's Steps card reads `daily_health_metrics.step_goal` for today's row. When HealthKit auto-syncs and writes a new metrics row without your coach-set goal, it falls back to a hardcoded **10,000** — so Andrew sees 10K instead of the 11K you set in Nutrition Targets.

## Fix (client dashboard only)

**1. `src/components/dashboard/StepsCard.tsx`**
- Fetch the client's `nutrition_targets.daily_step_goal` on mount.
- Resolve goal in this priority: `nutrition_targets.daily_step_goal` → `todayMetrics.step_goal` → `10000`.
- Display the resolved goal in the "/ 10K" label area.

**2. `src/components/dashboard/ProgressWidgetGrid.tsx`**
- Same: fetch `nutrition_targets.daily_step_goal` and use it as the authoritative goal, overriding the value pulled from today's `daily_health_metrics` row.

**3. Backfill `daily_health_metrics`**
- When the dashboard resolves the coach goal and detects that today's `daily_health_metrics.step_goal` differs (or is null), upsert today's row with the correct `step_goal`. This keeps trend charts and downstream reads consistent without changing other surfaces.
- Guarded so it only runs once per session per day (ref flag) to avoid write storms.

## Out of scope

Per your answer, no changes to: biofeedback `StepsScreen`, `StepTrendModal`, or coach `SummaryTab`. Those continue reading from `daily_health_metrics` (which will now also be backfilled correctly).

## Why this works

Coach Authority rule: `nutrition_targets.daily_step_goal` is the single coach-controlled source of truth. HealthKit sync never overwrites it again because we read the coach value first and reconcile the metrics row to match.
