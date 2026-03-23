

# Plan: Replace Tier Badge Assets with New No-Background Versions

## Summary

Replace all tier badge images with the new uploaded versions (no background, no text) across the entire app. The **only place** that keeps the old logos is the hero badge at the top of the Ranked page (`MyRankCard`).

## Asset Strategy

1. **Move current images** to `src/assets/tiers/legacy/` (bronze.png through champion.png)
2. **Copy new uploaded images** into `src/assets/tiers/` (overwriting the originals)
3. **Copy new uploaded images** into `src/assets/tiers/anim/` (used by RankUpOverlay post-workout popup)

This means every component importing from `@/assets/tiers/*.png` automatically gets the new art.

## Code Change

### File: `src/components/ranked/MyRankCard.tsx`

Update the hero badge import to use the legacy path instead of the default:

```typescript
// Change from:
import TierBadge from "./TierBadge";
// To: inline <img> using legacy imports
import legacyBronze from "@/assets/tiers/legacy/bronze.png";
// ... etc
```

Only the large hero `<TierBadge>` at the top of MyRankCard switches to the legacy asset. This is the single full-width badge display.

### No changes needed for:
- `TierBadge.tsx` — automatically picks up new images from `@/assets/tiers/`
- `TierIcon.tsx` — same, automatic
- `HowRankedWorksModal.tsx` — uses TierBadge, gets new images
- `RankUpOverlay.tsx` — uses `@/assets/tiers/anim/`, gets new images
- `WorkoutSummary.tsx` — uses TierBadge, gets new images
- `MyRankDashboardCard.tsx` — uses TierBadge, gets new images
- `RankedLeaderboard.tsx` — uses TierBadge, gets new images
- `XPManager.tsx` — uses TierBadge, gets new images
- Challenge components (`TierIcon`) — gets new images

## Files to modify
- Copy 6 uploaded images → `src/assets/tiers/` (overwrite)
- Copy 6 uploaded images → `src/assets/tiers/anim/` (overwrite)
- Move 6 old images → `src/assets/tiers/legacy/` (preserve)
- `src/components/ranked/MyRankCard.tsx` — use legacy imports for hero badge

