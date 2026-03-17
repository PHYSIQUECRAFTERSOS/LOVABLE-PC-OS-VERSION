

# Fix Ranked Leaderboard + Add "How It Works" Guide

## Problems Identified

1. **Only 1 person on leaderboard**: Only Kevin Wu has a `ranked_profiles` row. The 4 active clients (Kevin Client, Ryan Smith, Alley Raymond, Test Account) have no rows because `ensureRankedProfile` only runs when someone visits `/ranked` or earns XP. The leaderboard queries `ranked_profiles` directly, so missing rows = missing people.

2. **No way for clients to understand the ranking system**: Clients see tiers and XP but have zero context on how it works, what tiers exist, how to earn XP, or how promotion works.

3. **"This Week" tab**: Currently tracks `weekly_xp` on `ranked_profiles` — shows who earned the most XP this week (resets Monday). This is actually useful for driving weekly competition. **Recommendation: Keep it.** It gives clients a fresh race every week so newcomers aren't demoralized by the All Time gap. However, it only works once XP is actively flowing.

---

## Changes

### 1. Auto-Populate All Clients into Ranked

**Modify `useRankedLeaderboard`** in `src/hooks/useRanked.ts`:
- Before querying leaderboard, fetch all active client IDs from `coach_clients`
- For any client ID not already in `ranked_profiles`, batch-insert rows (Bronze V, 0 XP)
- This ensures every client appears on the leaderboard immediately

Also update `useMyRank` to do the same for the current user (already does via `ensureRankedProfile`, but the leaderboard hook needs to populate everyone).

### 2. Add "How Ranked Works" Info Modal

**Create `src/components/ranked/HowRankedWorksModal.tsx`**:
- A full-screen sheet/drawer triggered by a button near the page header
- Sections:
  - **Tier Ladder**: Visual display of all 6 tiers (Bronze → Champion) with colors, division counts, and XP per division. Shows the full path from Bronze V to Champion.
  - **How XP Works**: Table of all XP gains (+5 workout, +3 cardio, +7 calories on target, etc.) and losses (-4 missed workout, etc.)
  - **Streak Multipliers**: 7-day = 1.25x, 30-day = 1.5x, gains only
  - **Promotion Rules**: Auto-promote on division fill, demotion shield (can't drop tier unless 7+ days inactive), Champion = top 5 only
  - **Divisions**: V → IV → III → II → I, then next tier

**Add trigger button** to `src/pages/Ranked.tsx`:
- Small info/question-mark button next to the page title, or a "How It Works" text button
- Opens the modal

### 3. Keep "This Week" Tab (with minor improvement)

Keep the tab. It drives weekly competition. Add a small label showing "Resets Monday" so clients understand the cadence.

---

## Files

| File | Action |
|------|--------|
| `src/hooks/useRanked.ts` | Edit — add `ensureAllClientsRanked()` helper, call it in leaderboard hook |
| `src/components/ranked/HowRankedWorksModal.tsx` | Create — full explainer modal with tier ladder, XP table, rules |
| `src/pages/Ranked.tsx` | Edit — add "How It Works" button triggering the modal |
| `src/components/ranked/RankedLeaderboard.tsx` | Edit — add "Resets Monday" label to This Week tab |

### Auto-Population Logic
```text
1. Coach loads /ranked → leaderboard hook fires
2. Fetch all client_ids from coach_clients (active)
3. Fetch existing ranked_profiles user_ids
4. Diff → missing client_ids
5. Batch insert into ranked_profiles (defaults: bronze, div 5, 0 XP)
6. Then query leaderboard as normal
```

For clients: `useMyRank` already calls `ensureRankedProfile` which creates their own row on first visit. But to see ALL clients, the leaderboard needs the batch approach above.

### "How It Works" Modal Design
- Dark card style matching existing UI (#0a0a0a bg)
- Tier ladder shown as vertical progression with colored badges
- XP table with green/red color coding for gains/losses
- Streak multiplier visual with fire icons
- Champion section with crown icon explaining top-5 rule
- Scrollable, dismissible via X or swipe

