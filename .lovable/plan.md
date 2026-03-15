

# Fix Challenge Creation + League-Style Tier Icons

## Problem Diagnosis

### Bug: Challenge creation appears to succeed but nothing shows up
**Root cause: RLS policy blocking participant enrollment.**

The `challenge_participants` table has INSERT policy: `WITH CHECK (user_id = auth.uid())`. When a coach creates a challenge with "All Clients (Auto-enroll)", the code tries to insert rows where `user_id` = each client's ID. Since the coach's `auth.uid()` doesn't match those client IDs, **every insert silently fails**. The challenge row itself IS created, but with 0 participants and no leaderboard data — hence the "blank screen" appearance.

Additionally, the `badges` table only allows admin management (`has_role('admin')`), so coaches creating a badge during challenge setup also fails silently.

### Visual: Tier icons need League of Legends-inspired wing/crest SVGs
Replace emoji icons (🥉🥈🥇💎👑) with custom SVG wing/crest components matching the LoL tier aesthetic — each with distinct colors and increasing visual complexity.

## Changes

### 1. Database Migration — Fix RLS Policies

**`challenge_participants`**: Add new INSERT policy allowing coaches/admins to enroll any user:
```sql
CREATE POLICY "Coaches can enroll participants"
  ON challenge_participants FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'coach') OR has_role(auth.uid(), 'admin')
  );
```

**`badges`**: Update to allow coaches to create badges:
```sql
DROP POLICY "Admin can manage badges" ON badges;
CREATE POLICY "Coaches and admins can manage badges" ON badges FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'coach') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'coach') OR has_role(auth.uid(), 'admin'));
```

### 2. New Component — `TierIcon.tsx`

Create `src/components/challenges/TierIcon.tsx` — an SVG component that renders League-inspired wing/crest icons per tier name. Five designs with increasing visual complexity:
- **Bronze**: Simple angular wings, warm bronze (#CD7F32)
- **Silver**: Slightly more detailed wings, cool silver (#C0C0C0)
- **Gold**: Ornate wings with center gem, gold (#D4A017)
- **Platinum**: Crystalline wings with glow effect, cyan (#00CED1)
- **Diamond**: Most ornate wings with multiple layered details, ice blue (#B9F2FF)

Each icon is a pure SVG, scalable via a `size` prop (default 32px).

### 3. Update Tier Displays to Use SVG Icons

Replace emoji rendering in these files:
- **`ChallengeTierProgress.tsx`** — Replace `{tier.icon}` emoji with `<TierIcon name={tier.name} />`
- **`CreateChallengeWizard.tsx`** (step 2 tier list) — Same replacement
- **`ChallengeDetailView.tsx`** (leaderboard tier badges) — Same replacement
- **`MyRankTab.tsx`** — Replace the single-letter tier circle with the SVG icon
- **`GlobalLeaderboard.tsx`** — Add tier icon next to tier badge

### 4. Update DEFAULT_CHALLENGE_TIERS in useChallenges.ts

Change the `icon` field from emoji strings to tier name strings (e.g., `"bronze"`) so the `TierIcon` component can render the correct SVG. The icon field becomes a key rather than a literal display character.

## Files Changed

| File | Change |
|------|--------|
| New migration | Fix RLS on `challenge_participants` and `badges` |
| `src/components/challenges/TierIcon.tsx` | NEW — SVG wing/crest icons |
| `src/components/challenges/ChallengeTierProgress.tsx` | Use TierIcon instead of emoji |
| `src/components/challenges/CreateChallengeWizard.tsx` | Use TierIcon in tier config step |
| `src/components/challenges/ChallengeDetailView.tsx` | Use TierIcon in leaderboard |
| `src/components/challenges/MyRankTab.tsx` | Use TierIcon for rank display |
| `src/components/challenges/GlobalLeaderboard.tsx` | Add TierIcon next to tier badge |
| `src/hooks/useChallenges.ts` | Update DEFAULT_CHALLENGE_TIERS icon values |

## What is NOT Touched
- No food/nutrition logic
- No training/calendar/workout logic
- No messaging logic
- No existing challenge data modified

