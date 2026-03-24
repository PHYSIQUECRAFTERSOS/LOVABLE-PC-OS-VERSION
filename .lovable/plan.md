

# Plan: Align Coach's Client Summary with Client Dashboard Layout

## Goal
Make the coach's view of a client's dashboard (`SummaryTab.tsx`) match the client's own dashboard layout — same visual hierarchy and widgets — while keeping Macros Today, 7-Day Macro Averages, Food Log, Progress Momentum, and Last Check-In. Remove Workout Compliance and Current Streak cards.

## Changes

### File: `src/components/clients/workspace/SummaryTab.tsx`

**Replace the Quick Stats grid (lines 648-708)** — remove the 4-card grid containing Workout Compliance, Current Weight, Current Streak, and Last Check-In. Replace with:

1. **Client Rank Card** — new section that fetches the client's `ranked_profiles` data and renders a compact rank display (tier badge, division label, XP progress bar, streak) matching the `MyRankDashboardCard` style. Uses the same `calculateTierAndDivision`, `getDivisionLabel`, `getTierColor` utilities. Read-only (no navigation on tap since coach is viewing).

2. **Today's Actions** — keep the existing actions section (lines 725-767) but move it up to be right after the Date Navigator (matching client dashboard order). Already styled cleanly with checkmarks and icons.

3. **Steps full-width bar** — replace the current 3-column `md:grid-cols-3` stats row (lines 792-850) with:
   - A full-width Steps bar matching the client's `