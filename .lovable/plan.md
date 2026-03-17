

# Scale Up All Tier Icons 5x

## Current vs New Sizes

Every `size` prop passed to `TierBadge` and `TierIcon` will be multiplied by 5:

| Location | Component | Current | New (×5) |
|----------|-----------|---------|----------|
| **Leaderboard tier headers** | TierBadge | 22 | 110 |
| **Leaderboard player rows** | TierBadge | 18 | 90 |
| **My Rank Card** | TierBadge | 48 | 240 |
| **Dashboard rank card** | TierBadge | 24 | 120 |
| **How It Works modal** | TierBadge | 20 | 100 |
| **XP Manager rows** | TierBadge | 20 | 100 |
| **Rank Up Overlay** | TierBadge | 64/80 | 320/400 |
| **Challenge tier progress** | TierIcon | 24/18 | 120/90 |
| **Challenge detail** | TierIcon | 14 | 70 |
| **Challenge wizard** | TierIcon | 20/16 | 100/80 |
| **Challenge MyRank** | TierIcon | 40 | 200 |

> **Note:** A literal 5× on every instance will make some contexts very large (e.g., 240px My Rank Card badge, 400px champion overlay). This will work visually since the icons are high-res PNGs, but some containers may need flex/layout adjustments to accommodate the larger images. If the result feels too large in certain spots, we can fine-tune per-location afterward.

## Files to Edit

| File | Change |
|------|--------|
| `src/components/ranked/RankedLeaderboard.tsx` | Update size props: 22→110 (headers), 18→90 (rows) |
| `src/components/ranked/MyRankCard.tsx` | 48→240 |
| `src/components/ranked/RankUpOverlay.tsx` | 64→320, 80→400 |
| `src/components/ranked/HowRankedWorksModal.tsx` | 20→100 |
| `src/components/ranked/XPManager.tsx` | 20→100 (3 instances) |
| `src/components/dashboard/MyRankDashboardCard.tsx` | 24→120 |
| `src/components/challenges/ChallengeTierProgress.tsx` | 24→120, 18→90 |
| `src/components/challenges/ChallengeDetailView.tsx` | 14→70 |
| `src/components/challenges/CreateChallengeWizard.tsx` | 20→100, 16→80 |
| `src/components/challenges/MyRankTab.tsx` | 40→200 |

Straightforward find-and-replace of `size=` values in each file — no logic changes needed.

