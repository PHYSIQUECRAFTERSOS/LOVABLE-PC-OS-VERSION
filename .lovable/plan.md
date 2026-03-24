

# Plan: Double All Tier Badge Icons Across All Sections

## Changes

### 1. Dashboard Rank Card (`src/components/dashboard/MyRankDashboardCard.tsx`)
- Container: `h-14 w-14` → `h-28 w-28`
- TierBadge size: `80` → `160`

### 2. How Ranked Works Modal (`src/components/ranked/HowRankedWorksModal.tsx`)
- Container: `h-12 w-12` → `h-24 w-24`
- TierBadge size: `100` → `200`
- Adjust row padding for taller rows

### 3. Workout Summary (`src/components/workout/WorkoutSummary.tsx`)
- Container: `w-10 h-10` → `w-20 h-20`
- TierBadge size: `40` → `80`

### 4. XP Manager — all 3 list sections (`src/components/ranked/XPManager.tsx`)
- Container: `h-10 w-10` → `h-20 w-20`
- TierBadge size: `100` → `200`
- Adjust row padding for taller rows

### 5. Ranked Leaderboard (`src/components/ranked/RankedLeaderboard.tsx`)
- **Tier group headers**: container `h-20 w-20` → `h-40 w-40`, size `440` → `880`
- **Player rows**: container `h-16 w-16` → `h-32 w-32`, size `360` → `720`

## Files to modify
- `src/components/dashboard/MyRankDashboardCard.tsx`
- `src/components/ranked/HowRankedWorksModal.tsx`
- `src/components/workout/WorkoutSummary.tsx`
- `src/components/ranked/XPManager.tsx`
- `src/components/ranked/RankedLeaderboard.tsx`

