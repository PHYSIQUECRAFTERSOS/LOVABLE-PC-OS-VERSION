

# Plan: Fix Dashboard Steps Display, Add Distance Modal, Redesign Widget Grid

## Problem Analysis

1. **Steps showing 0 on dashboard**: The `ProgressWidgetGrid` shows `todayMetrics?.steps` from `useHealthSync()`, but this only populates on native iOS with Apple Health connected. On PWA or when the hook hasn't synced yet, it falls back to `manualSteps` which queries `daily_health_metrics` for today. The issue is that `todayMetrics` returns `null` steps (not connected natively) while `manualSteps` may also miss because the date format or timing is off. Meanwhile the `StepTrendModal` queries the same table and finds 6,001 steps. The fix: always query `daily_health_metrics` as the source of truth for step display, regardless of health sync connection status.

2. **Distance box navigates to Steps tab instead of opening its own chart**: Currently hardcoded to `navigate("/progress?tab=steps")`. Needs its own `DistanceTrendModal`.

3. **Remove Active Cal box, redesign to 4 small + 1 wide**: New layout with Steps as a full-width bar with progress toward goal, then 2x2 grid for Weight, Photos, Calories, Distance.

---

## Changes

### File: `src/components/dashboard/ProgressWidgetGrid.tsx` — Full redesign

**A. Fix steps display**
Change the steps value logic to always use the DB value from `daily_health_metrics` (which `manualSteps` already queries). Also merge with `todayMetrics?.steps` when available, taking the higher value (health sync may have more recent data). This ensures the dashboard always shows what the StepTrendModal shows.

**B. New layout: 1 wide + 2x2 grid**
```text
┌───────────────────────────────────────────┐
│  👣 Steps   6,001        Goal: 10K  60%  │
│  ████████████░░░░░░░░░                    │
└───────────────────────────────────────────┘
┌──────────────────┐ ┌──────────────────────┐
│  ⚖️ Weight        │ │  📷 Progress Photos   │
│  211.6 lbs       │ │  [img] [img]         │
└──────────────────┘ └──────────────────────┘
┌──────────────────┐ ┌──────────────────────┐
│  🔥 Calories     │ │  📍 Distance          │
│  1,161           │ │  4.2 km              │
└──────────────────┘ └──────────────────────┘
```

**C. Remove Active Cal widget entirely**

**D. Distance widget opens DistanceTrendModal instead of navigating away**

### File: `src/components/dashboard/DistanceTrendModal.tsx` — New file

Create a modal identical in structure to `StepTrendModal` but for distance data:
- Same range tabs (7D, 30D, 3M, 6M, 1Y, All)
- Same summary stats layout (Avg Daily distance, Best Day, formatted in km)
- Queries `daily_health_metrics.walking_running_distance_km`
- Area chart with gradient fill
- Title: "My Distance"

### File: `src/components/biofeedback/StepsScreen.tsx` — Fix steps display

Same issue: uses `todayMetrics?.steps` which may be null. Fix to also query `daily_health_metrics` directly as fallback, matching what the chart data already shows.

---

## Files to modify
- `src/components/dashboard/ProgressWidgetGrid.tsx` — fix steps value, remove Active Cal, redesign layout, add distance modal state
- `src/components/dashboard/DistanceTrendModal.tsx` — new file, copy StepTrendModal pattern for distance
- `src/components/biofeedback/StepsScreen.tsx` — fix today steps to use DB value

