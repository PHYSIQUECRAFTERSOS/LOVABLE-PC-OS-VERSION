

# Replace "All Time" Tab with Tier-Grouped Division View

## What Changes

Replace the flat "All Time" leaderboard with a **tier-grouped accordion view** — like League of Legends' ranked distribution page. Each tier (Champion → Bronze) is a collapsible section showing all players in that tier, grouped by division (I → V). Profile pictures appear beside each name.

## Design

```text
┌─────────────────────────────────────────┐
│ [Divisions]  [This Week]  [Streak Kings]  [Tier Climbers] │
├─────────────────────────────────────────┤
│ 🔍 Search members...                    │
├─────────────────────────────────────────┤
│ 👑 CHAMPION                    2 players │  ← tier header, colored accent
│  ┌──────────────────────────────────┐   │
│  │ [avatar] Kevin Client    5,800 XP│   │
│  │ [avatar] Ryan Smith      5,760 XP│   │
│  └──────────────────────────────────┘   │
├─────────────────────────────────────────┤
│ 💎 DIAMOND                     1 player  │  ← collapsed by default
│  ▸ Division I (1)                        │
│  ▸ Division III (0)                      │
├─────────────────────────────────────────┤
│ 🟢 EMERALD                    0 players  │
│ 🟡 GOLD                       1 player   │
│ ⚪ SILVER                      3 players  │
│ 🟤 BRONZE                     8 players  │  ← auto-expanded (most players)
│  Division V (5)                          │
│   [avatar] Test Account         0 XP     │
│   [avatar] Alley Raymond        0 XP     │
│  Division IV (0)                         │
│  ...                                     │
└─────────────────────────────────────────┘
```

Key visual elements:
- Each tier header has a colored left border + TierBadge icon + player count
- Tiers are collapsible (Champion at top, Bronze at bottom)
- Within each tier, divisions are sub-grouped (I at top, V at bottom)
- Profile avatars (from `avatar_url`) next to every name using the existing Avatar component
- Current user's row highlighted with primary accent
- Search filters across all tiers

## Files to Change

| File | Action |
|------|--------|
| `src/components/ranked/RankedLeaderboard.tsx` | Major edit — rename "All Time" tab to "Divisions", render tier-grouped accordion view when that tab is active, add avatar to all row types |
| `src/hooks/useRanked.ts` | Minor edit — leaderboard query for "divisions" tab fetches all profiles ordered by total_xp desc (same as all_time, just renamed) |

## Implementation Details

**RankedLeaderboard.tsx:**
- Rename tab key from `"all_time"` to `"divisions"`, label to `"Divisions"`
- When `tab === "divisions"`, group entries by `current_tier` using `TIER_ORDER` (reversed: champion first)
- Within each tier group, sub-group by `current_division` (1 → 5)
- Render collapsible tier sections using Collapsible component
- Add `Avatar` + `AvatarImage` + `AvatarFallback` to every `LeaderboardRow` (already have `avatar_url` in data)
- Tier headers: colored left border using `getTierColor()`, TierBadge icon, tier name, player count badge

**useRanked.ts:**
- Map `"divisions"` to the same query as `"all_time"` (order by total_xp desc) — the grouping is purely client-side

**Avatar integration:**
- Import Avatar components from `@/components/ui/avatar`
- Show `avatar_url` when available, fallback to initials
- Size: 28px (h-7 w-7) to keep rows compact

