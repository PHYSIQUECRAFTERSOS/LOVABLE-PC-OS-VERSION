

# Enlarge Tier Icon Containers to Match 5x Icon Sizes

## Problem
The last change wrapped all tier icons in small fixed-size containers (`h-12 w-12`, `h-10 w-10`, `h-8 w-8`) with `overflow-hidden` + `max-w-full max-h-full` on the `<img>`. This clips the 5x icons down to the container size, making them tiny again -- the opposite of what was intended.

## Fix Strategy
Enlarge each container to match or closely match the icon's `size` prop so the full artwork is visible. Adjust surrounding layout (padding, flex direction, card heights) so nothing overflows or gets pushed off-screen on mobile.

## Changes Per File

### 1. `src/components/dashboard/MyRankDashboardCard.tsx`
- Container: `h-12 w-12` → `h-20 w-20` (80px, showing full 120px icon scaled down slightly via max-w/max-h)
- Card: increase padding/height to accommodate; keep horizontal layout

### 2. `src/components/ranked/MyRankCard.tsx`
- Container: `h-32 w-32` → `w-full max-w-[240px] aspect-square` (full 240px on wide screens, responsive on narrow)
- Already centered vertically, just needs the container to stop clipping

### 3. `src/components/ranked/RankedLeaderboard.tsx`
- **Tier section headers**: Container `h-10 w-10` → `h-14 w-14` (56px, enough to show 110px icon clearly)
- **Flat leaderboard rows**: Container `h-8 w-8` → `h-12 w-12` (48px, shows 90px icon)

### 4. `src/components/ranked/HowRankedWorksModal.tsx`
- Container `h-10 w-10` → `h-12 w-12` (shows 100px icon)

### 5. `src/components/ranked/XPManager.tsx` (3 instances)
- Container `h-8 w-8` → `h-10 w-10` (shows 100px icon)

### 6. `src/components/ranked/RankUpOverlay.tsx`
- Already `w-[60vw] max-w-[320px]` -- this is fine, icons show large. No change needed.

### 7. `src/components/challenges/ChallengeTierProgress.tsx`
- Current tier container: `h-10 w-10` → `h-14 w-14`
- Path step containers: existing small circles → `h-10 w-10`

### 8. `src/components/challenges/ChallengeDetailView.tsx`
- Inline icon container: `h-4 w-4` → `h-6 w-6`

### 9. `src/components/challenges/CreateChallengeWizard.tsx`
- Tier editor container → `h-12 w-12`
- Preview container: `h-5 w-5` → `h-7 w-7`

### 10. `src/components/challenges/MyRankTab.tsx`
- Container: `h-16 w-16` → `h-24 w-24` (shows 200px icon)

## Result
Icons render at their full visual size (constrained only by `max-w-full max-h-full` inside proportionally-sized containers). Layout remains intact on mobile because containers are sized to fit within their parent rows/cards without overflow.

