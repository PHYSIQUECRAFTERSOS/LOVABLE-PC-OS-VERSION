

# Fix Challenge Detail: Remove Old Rank Names, Improve UI

## Problem
Existing challenges in the database still store "Bronze/Silver/Gold/Platinum/Diamond" as tier names. The `StarTierIcon` component tries to parse a digit from the name and defaults to 1 star for all of them. The tier names are also displayed as text labels, creating confusion with the Ranked system.

## Changes

### 1. Update `StarTierIcon.tsx` — Add legacy name mapping

Add a fallback map so old database tier names render correct star counts:

```typescript
const LEGACY_MAP: Record<string, number> = {
  bronze: 1, silver: 2, gold: 3, platinum: 4, diamond: 5
};
// Parse "2 Stars" → 2, OR "Bronze" → 1
const count = parseInt(name.match(/(\d)/)?.[1] || "") 
  || LEGACY_MAP[name.toLowerCase()] 
  || 1;
```

### 2. Redesign `ChallengeTierProgress.tsx` — Remove tier name text

- Remove the text labels showing tier names ("Bronze", "Silver", etc.)
- Show only star icons in the progression path (1★, 2★★, 3★★★...)
- Replace the point threshold labels with just the min_points number
- Keep the progress bar and "pts to go" info
- Remove the large circular current-tier display (redundant), replace with a compact inline star + points display

### 3. Clean up `ChallengeDetailView.tsx` — Remove tier names from leaderboard

- Remove the tier name text next to each participant in the leaderboard (lines 272-276)
- Keep just the star icons as a subtle visual indicator
- Remove the `getParticipantTier` function and the tier badge below participant names — the leaderboard already shows rank numbers (#1, #2...) which is sufficient
- Alternatively: keep stars but remove the tier name text label

### 4. Overall detail popup improvements

- Keep the leaderboard as-is (with rank numbers and points)
- Remove the separate "Tier Progress" card entirely — it's the source of confusion. The challenge progress bar + leaderboard rank is enough context
- Keep: Challenge Progress bar, My Stats card, How to Earn Points, Actions, Leaderboard

## Files to edit
- `src/components/challenges/StarTierIcon.tsx` — add legacy name mapping
- `src/components/challenges/ChallengeDetailView.tsx` — remove tier progress section, remove tier labels from leaderboard
- `src/components/challenges/ChallengeTierProgress.tsx` — simplified (or removed entirely from this view)

