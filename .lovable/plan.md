## Goal

Replace the current generic milestone popup with the three on-brand designs shown in the reference images (Workout / Cardio / Nutrition), where every number, label, and stat dynamically matches the milestone the client just unlocked (1, 7, 50, 350, etc.).

## What changes

### 1. New popup component: `MilestoneCelebrationV2.tsx`
Three variants driven off `unlock.category`, all sharing the same matte-black gradient background, "PHYSIQUE CRAFTERS" header, close button, confetti, and gold CTA at the bottom.

**Workout variant** (`workout_count`)
- Big gold shield with laurel wreath, dynamic number (1, 7, 25, 50, 100, 350…) and a dumbbell icon underneath
- Title: `WORKOUT` / `MILESTONE UNLOCKED!`
- Copy: `You've crushed {N} workout{s}! Let's keep it going.` (singular when N=1)
- Stat row (3 cells): **{N} Workouts Completed** · **{prs} New PRs** · **100% Dedication**
- CTA: `KEEP CRUSHING IT!`

**Cardio variant** (`cardio_count`)
- Same gold shield + laurel, dynamic number, heart-with-pulse icon
- Title: `CARDIO SESSIONS` / `CARDIO MILESTONE UNLOCKED!`
- Copy: `You've completed {N} cardio session{s}! We're proud of you.`
- Single stat tile: **{N} Sessions Completed** with heart icon
- CTA: `CONTINUE`

**Nutrition variant** (`nutrition_total` and `nutrition_streak`)
- Same gold shield + laurel, dynamic number, apple icon
- Title: `NUTRITION TRACKING` / `NUTRITION MILESTONE UNLOCKED!`
- Copy total: `You've completed {N} day{s} of tracking! We're proud of you.`
- Copy streak: `You're on a {N}-day tracking streak! Keep it rolling.`
- Single stat tile: **{N} Days Tracked** (or `Day Streak`) with apple icon
- CTA: `CONTINUE`

The shield + laurel + confetti are built with inline SVG + framer-motion (not a baked image) so the number is always crisp and dynamic. The number uses the existing `CountUp` animation from `MilestoneShield`. Gold gradient `from-[#8a6b13] via-[#D4A017] to-[#f5e6a8]` (already in `TIER_RING`).

### 2. PR stat for workout popup (only stat that needs data)
For workout milestones, fetch the count of `personal_records` rows the client has, **scoped to the workout session that triggered the milestone**:
- After the unlock loads, query the latest completed `workout_sessions` row for `user.id` ordered by `completed_at desc limit 1`
- Count `personal_records` rows where `session_id` = that session id (and `user_id` = client)
- Cache per `unlock.id` so re-renders don't refetch
- "Dedication" is a static `100%` (visual celebration only) — confirmed by the reference design

Cardio and nutrition variants have no async stats; everything renders from `unlock.threshold`.

### 3. Wire into existing flow
- `MilestoneRoot.tsx` swaps `MilestoneCelebration` → `MilestoneCelebrationV2`. No changes to `useMilestoneWatcher`, no DB changes, no migration.
- `MilestoneCelebration.tsx` and `MilestoneShield.tsx` stay in repo (TrophyRoom still uses `MilestoneShield`).
- Singular/plural handled inline (`workout` vs `workouts`, `session` vs `sessions`, `day` vs `days`).

## Files touched

- `src/components/milestones/MilestoneCelebrationV2.tsx` — new, the three-variant popup
- `src/components/milestones/MilestoneRoot.tsx` — swap import
- `src/utils/milestoneDefinitions.ts` — add `CATEGORY_META[*].titleLine1/titleLine2/cta/copyTemplate` so the three variants share one config

## Out of scope

- No DB/migration changes
- No changes to backfill logic or `recompute_milestones`
- No share-to-Instagram button (per earlier decision)
- TrophyRoom keeps the existing shield component
