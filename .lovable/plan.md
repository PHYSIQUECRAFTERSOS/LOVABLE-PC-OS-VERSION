

# Replace All Tier Icons with Custom Uploaded Images

## Summary

Replace the current Lucide icon-based `TierBadge` and SVG-based `TierIcon` components with the user's custom tier artwork (Bronze kettlebell, Silver winged dumbbell, Gold gear dumbbell, Emerald gear portal, Diamond crystal armor, Champion flaming crown). The images will be used without their dark backgrounds -- rendered as transparent-background assets via `object-fit: contain`.

## Files to Change

| File | Action |
|------|--------|
| `src/assets/tiers/bronze.png` | **Copy** from user upload |
| `src/assets/tiers/silver.png` | **Copy** from user upload |
| `src/assets/tiers/gold.png` | **Copy** from user upload |
| `src/assets/tiers/emerald.png` | **Copy** from user upload |
| `src/assets/tiers/diamond.png` | **Copy** from user upload |
| `src/assets/tiers/champion.png` | **Copy** from user upload |
| `src/components/ranked/TierBadge.tsx` | **Rewrite** -- import all 6 tier PNGs, render as `<img>` with `width`/`height` set to `size` prop, `object-fit: contain` |
| `src/components/challenges/TierIcon.tsx` | **Rewrite** -- same approach, import tier PNGs, render `<img>` based on `name` prop |

## Implementation

**TierBadge.tsx** (used across Ranked system):
- Import each tier image: `import bronzeImg from "@/assets/tiers/bronze.png"`
- Map tier string to image: `const TIER_IMAGES: Record<string, string> = { bronze: bronzeImg, silver: silverImg, ... }`
- Render: `<img src={TIER_IMAGES[tier] || TIER_IMAGES.bronze} width={size} height={size} className={className} style={{ objectFit: "contain" }} />`
- No color tinting needed -- the images carry their own color identity

**TierIcon.tsx** (used in Challenges system):
- Same pattern as TierBadge but maps by `name` prop instead of `tier`
- Note: Challenges use "platinum" tier name -- map it to the Diamond image since there's no separate platinum upload

## Where These Show Up (no changes needed -- they consume TierBadge/TierIcon)
- `RankedLeaderboard.tsx` -- tier headers + player rows
- `MyRankCard.tsx` -- current rank display
- `RankUpOverlay.tsx` -- promotion/demotion popups
- `HowRankedWorksModal.tsx` -- tier ladder explanation
- `XPManager.tsx` -- coach XP management rows
- `MyRankDashboardCard.tsx` -- dashboard rank card
- `ChallengeTierProgress.tsx` -- challenge tier path
- `MyRankTab.tsx` (challenges) -- challenge rank display
- `ChallengeDetailView.tsx` -- challenge leaderboard

