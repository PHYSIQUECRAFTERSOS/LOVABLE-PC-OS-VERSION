

# Fix & Overhaul: Challenges System with In-Challenge Tiers

## Problem Analysis

**Black screen bug**: After publishing a challenge, the wizard closes but the Challenges page goes blank. Root cause: the `handlePublish` function calls `createChallenge.mutateAsync()` which inserts into `challenges` — but the SELECT RLS policy (`Read published challenges`) filters by `status <> 'draft' OR created_by = auth.uid()`. The insert works, but the subsequent query invalidation may fail silently if the `as any` cast causes a type mismatch or the toast/reset happens before the query refetch completes. Additionally, the `useChallenges` hook fetches participants in a second query using `.in("challenge_id", challengeIds)` — if `challengeIds` is empty, this returns an error on some Supabase versions. The page rendering depends on this query succeeding.

**Missing tier system within challenges**: Currently challenges only track raw values. The Trainerize-style progression tiers (where participants climb through ranks based on points) don't exist.

## What Changes

### 1. Database: Add `challenge_tiers` table and `challenge_scoring_rules`

**`challenge_scoring_rules`** — stores per-challenge point rules:
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| challenge_id | uuid FK → challenges | ON DELETE CASCADE |
| action_type | text | "workout_completed", "personal_best", "daily_logging", "streak_bonus" |
| points | integer | e.g. 1, 5, 3 |
| daily_cap | integer DEFAULT 1 | Max times per day this action earns points |
| is_enabled | boolean DEFAULT true | |

**`challenge_tiers`** — defines progression levels within a challenge:
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| challenge_id | uuid FK → challenges | ON DELETE CASCADE |
| name | text | "Bronze", "Silver", "Gold", "Platinum", "Diamond" |
| min_points | integer | Threshold to enter tier |
| color | text | Hex color |
| icon | text | Emoji or icon name |
| sort_order | integer | Display ordering |

Default tier presets seeded per challenge:
- Bronze: 0-25 pts (#CD7F32)
- Silver: 26-50 pts (#C0C0C0)
- Gold: 51-75 pts (#D4A017)
- Platinum: 76-100 pts (#00CED1)
- Diamond: 101+ pts (#B9F2FF)

RLS: Same pattern as other challenge tables — authenticated read, coach/admin write.

### 2. Fix Black Screen Bug

In `CreateChallengeWizard.tsx`:
- Wrap `handlePublish` in try/catch with proper error handling instead of letting exceptions silently kill the render
- Add error boundary toast on failure
- Ensure `reset()` and `onOpenChange(false)` only fire after successful mutation

In `useChallenges.ts`:
- Guard the `.in("challenge_id", challengeIds)` call — if `challengeIds` is empty, skip the participants query and return challenges with `participant_count: 0`
- Add `onError` handler to the `useChallenges` query to prevent silent failures

### 3. Wizard Step 2 Overhaul: Scoring Rules & Tiers

Add a new section to the Configure step (or a dedicated "Rules & Scoring" step between Configure and Participants):

**Scoring Rules** — checkboxes with point inputs:
- Workout Completed: [x] — `1` pts (daily cap: 1x)
- Personal Best Set: [x] — `5` pts (daily cap: 1x)
- Daily Logging (meals/steps/custom): [x] — `1` pts (daily cap: 1x)
- Streak Bonus (7+ day streak): [x] — `3` pts (daily cap: 1x)

**Challenge Tiers** — editable table pre-filled with defaults:
- Bronze: 0 pts
- Silver: 26 pts
- Gold: 51 pts
- Platinum: 76 pts
- Diamond: 101 pts

Coach can rename tiers, adjust point thresholds, add/remove tiers.

### 4. Challenge Detail View Overhaul

Replace the flat leaderboard with a tiered visual:
- Show tier progress bar at top (which tier the user is in, points to next)
- Leaderboard grouped by tier with colored tier badges
- Each participant shows their current points, tier badge, and rank within their tier
- Mountain/path visualization showing participant avatars at their tier level (inspired by the Trainerize screenshot)

### 5. Updated `handlePublish` Flow

After creating the challenge:
1. Insert challenge → get `challenge.id`
2. Insert `challenge_scoring_rules` rows for enabled rules
3. Insert `challenge_tiers` rows (5 default tiers)
4. If enrollment = "all", auto-insert all clients into `challenge_participants`
5. Close wizard, invalidate queries

### 6. Points Tracking

Add a `challenge_points` table (or reuse `challenge_logs` with `source = "points"`):
- When a workout is completed → check active challenges → award points per scoring rules
- When a PR is hit → check active challenges → award points
- Daily cap enforced by checking `challenge_logs` for same `user_id + challenge_id + log_date + action_type`

Update `challenge_participants.current_value` to reflect total points earned.

### 7. Files to Create/Edit

| File | Action |
|------|--------|
| Migration SQL | CREATE `challenge_tiers`, `challenge_scoring_rules` tables with RLS |
| `src/hooks/useChallenges.ts` | Fix empty array guard, add tier/scoring hooks, fix error handling |
| `src/components/challenges/CreateChallengeWizard.tsx` | Add scoring rules step, tier config, fix publish error handling |
| `src/components/challenges/ChallengeDetailView.tsx` | Add tiered leaderboard, tier progress, points display |
| `src/components/challenges/ChallengesTab.tsx` | Show tier badge on challenge cards |
| `src/components/challenges/ChallengeTierProgress.tsx` | New: visual tier progression component |

### 8. Key UX Improvements

- Challenge cards show a tier badge indicator (current user's tier in that challenge)
- "Rules & Settings" section visible on challenge detail (like Trainerize screenshot)
- Points breakdown visible per participant
- Threshold display: "Everyone who reaches X points enters [Tier Name]"
- Daily cap indicator: "Each action earns points 1x per day"

