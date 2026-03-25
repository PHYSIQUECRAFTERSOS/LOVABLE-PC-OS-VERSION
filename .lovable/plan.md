

# Rebrand Challenge Tiers to Star Ratings (with Custom Star Asset)

## Overview
Replace the Bronze/Silver/Gold/Platinum/Diamond tier system in Challenges with a 5-star rating system, using the uploaded golden star image instead of emoji stars. This completely separates the Challenge progression visuals from the PC Ranked system.

## Changes

### 1. Copy uploaded star image to project
- Copy `user-uploads://Radiant_golden_star_with_swirling_vortex.png` → `src/assets/challenge-star.png`

### 2. Update default tier presets (`src/hooks/useChallenges.ts`)

Replace `DEFAULT_CHALLENGE_TIERS` (lines 641-647):

| Old | New | Color |
|-----|-----|-------|
| Bronze (0+) | 1 Star | #FFD700 |
| Silver (26+) | 2 Stars | #FFA500 |
| Gold (51+) | 3 Stars | #FF6347 |
| Platinum (76+) | 4 Stars | #DA70D6 |
| Diamond (101+) | 5 Stars | #00CED1 |

### 3. New component: `src/components/challenges/StarTierIcon.tsx`
- Renders 1-5 copies of the golden star image (small, ~12-16px each) in a row
- Parses the tier name to extract count (e.g. "2 Stars" → 2 stars)
- Falls back to matching partial name or defaulting to 1 star
- Accepts `size` prop to control individual star dimensions

```tsx
import starImg from "@/assets/challenge-star.png";

const StarTierIcon = ({ name, size = 16 }: { name: string; size?: number }) => {
  const match = name?.match(/(\d)/);
  const count = Math.min(Math.max(parseInt(match?.[1] || "1"), 1), 5);
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <img key={i} src={starImg} width={size} height={size} alt="" className="object-contain" />
      ))}
    </span>
  );
};
```

### 4. Update `ChallengeTierProgress.tsx`
- Replace `import TierIcon` → `import StarTierIcon`
- Swap all `<TierIcon>` → `<StarTierIcon>` with appropriate sizes
- Update max-tier message to "⭐ 5-Star Legend!"

### 5. Update `ChallengeDetailView.tsx`
- Replace `import TierIcon` → `import StarTierIcon`
- Swap leaderboard participant tier icons to `<StarTierIcon>`

### 6. Update `CreateChallengeWizard.tsx`
- Replace `import TierIcon` → `import StarTierIcon`
- Swap tier preview icons in the wizard steps

### 7. Leave `TierIcon.tsx` and `MyRankTab.tsx` untouched
- These serve the PC Ranked system and remain unchanged

### Files to edit
- Copy: `user-uploads://Radiant_golden_star_with_swirling_vortex.png` → `src/assets/challenge-star.png`
- New: `src/components/challenges/StarTierIcon.tsx`
- Edit: `src/hooks/useChallenges.ts` (lines 641-647)
- Edit: `src/components/challenges/ChallengeTierProgress.tsx`
- Edit: `src/components/challenges/ChallengeDetailView.tsx`
- Edit: `src/components/challenges/CreateChallengeWizard.tsx`

