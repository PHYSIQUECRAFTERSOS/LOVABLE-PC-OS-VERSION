

# Fix Challenge Leaderboard + Auto-Scoring + Remove My Rank Tab

## Root Cause Analysis

The Leaderboard tab queries `user_xp_summary` (a global XP table that's only populated when a challenge ends via the lifecycle function). Nobody appears because:
1. Points from workouts, PRs, and daily logging are **never auto-logged** to `challenge_logs` or `challenge_participants`
2. The leaderboard queries the wrong table — it should show challenge participants ranked by points, not global XP

## Changes

### 1. Auto-Score Challenge Points on Workout Completion

**Edit `src/components/WorkoutLogger.tsx`** — After `finishWorkout()` successfully completes:
- Fetch all active challenges the user is enrolled in
- For each challenge, fetch its `challenge_scoring_rules` (enabled only)
- Award points for `workout_completed` (check daily cap against today's logs)
- Award points for `personal_best` for each PR hit during the session (check daily cap)
- Insert rows into `challenge_logs` and update `challenge_participants.current_value`

Create a helper function `autoScoreChallengePoints(userId, actions: {type, count}[])` in `src/hooks/useChallenges.ts` that:
1. Fetches active challenges where user is a participant
2. For each challenge, fetches scoring rules
3. For each action type, checks today's existing logs against daily_cap
4. Inserts `challenge_logs` entries and updates `challenge_participants.current_value`

### 2. Change Leaderboard to Show Challenge Participants

**Edit `src/hooks/useChallenges.ts`** — Replace `useGlobalXPLeaderboard()` with `useChallengeLeaderboard()` that:
- Fetches all `challenge_participants` from active challenges
- Aggregates `current_value` per user across all active challenges
- Joins with profiles for names/avatars
- Returns sorted by total points descending

**Edit `src/components/challenges/GlobalLeaderboard.tsx`** — Update to:
- Use the new hook
- Show rank as 1, 2, 3, 4, 5... (simple numbers, top 3 get medals)
- Show total points instead of XP
- Remove tier badges/icons (those are XP-based, not relevant here)

### 3. Remove My Rank Tab

**Edit `src/pages/Challenges.tsx`** — Remove the "My Rank" tab and its TabsTrigger/TabsContent. Keep Leaderboard, Challenges, and Team Pulse tabs.

## Files to Edit

1. **`src/hooks/useChallenges.ts`** — Add `autoScoreChallengePoints()` helper, replace `useGlobalXPLeaderboard` with `useChallengeLeaderboard`
2. **`src/components/WorkoutLogger.tsx`** — Call auto-scoring after workout finish (for workout_completed + personal_best actions)
3. **`src/components/challenges/GlobalLeaderboard.tsx`** — Rewrite to show challenge participant rankings by points
4. **`src/pages/Challenges.tsx`** — Remove My Rank tab

## Auto-Scoring Logic Detail

```text
After finishWorkout():
1. Get active challenges where user is participant
2. For each challenge:
   a. Get enabled scoring rules
   b. Count today's existing challenge_logs by action_type
   c. For "workout_completed": if today's count < daily_cap, insert log with points
   d. For "personal_best": for each PR hit, if today's count < daily_cap, insert log
   e. Recalculate current_value = sum of all user's challenge_logs for this challenge
   f. Update challenge_participants.current_value
```

