

# Physique Crafters Ranked — Implementation Plan

This is a large system with 5 database tables, 4 edge functions, a full new page (client + coach views), dashboard integration, animations, and badge logic. To deliver it reliably without breaking the existing app, I will implement it in ordered phases within a single build pass.

---

## Phase 1: Database Schema (Migration)

Create all 5 tables with RLS policies and IF NOT EXISTS guards:

- **`ranked_profiles`** — tier, division, XP, streak, boost tracking per user
- **`xp_transactions`** — full XP ledger (gains, losses, coach awards)
- **`badges`** — 16 badge definitions (seeded via insert)
- **`user_badges`** — earned badges per user
- **`ranked_notifications_queue`** — push notification queue

RLS policies follow the spec: clients see own rows, coaches see assigned clients (via `coach_clients`), admin sees all. System-only INSERT/UPDATE on `ranked_profiles`, `xp_transactions`, `user_badges`, and notification queue (service role).

---

## Phase 2: Navigation + Route

**`src/components/AppLayout.tsx`**:
- Client nav: insert `{ to: "/ranked", icon: Trophy, label: "Ranked" }` between Challenges (index 7) and Settings (index 8)
- Coach nav: insert `{ to: "/ranked", icon: Trophy, label: "Ranked" }` between Challenges (index 3) and Clients (index 4)
- No bottom tab changes

**`src/App.tsx`**:
- Add route: `<Route path="/ranked" element={<ProtectedRoute><Ranked /></ProtectedRoute>} />`

**`src/pages/Ranked.tsx`** — New page file

---

## Phase 3: Core XP Utility

**`src/utils/rankedXP.ts`** — Standalone utility (no React hooks, same pattern as `challengeAutoScore.ts`):
- `calculateAndAwardXP(userId, actionType, metadata)` — calculates base XP, applies streak/boost multipliers, inserts `xp_transactions`, updates `ranked_profiles`, checks rank changes
- `getTierConfig(tier)` — returns XP-per-division, color, etc.
- `calculateTierFromXP(totalXP)` — determines tier + division from total XP
- `checkAndUpdateStreak(userId)` — evaluates daily compliance, updates streak
- Helper constants: tier thresholds, XP values per action

---

## Phase 4: Edge Functions

### `supabase/functions/calculate-xp/index.ts`
Called from WorkoutLogger, nutrition logging, cardio logging, and check-in submission. Receives `{ userId, actionType, metadata }`, runs the XP calculation, badge checks, and notification queuing server-side.

### `supabase/functions/check-missed-events/index.ts`
Cron function (hourly). Scans `calendar_events` for items 24h+ past with no corresponding log. Applies XP losses. Checks midnight nutrition deadline. Handles 7+ day inactivity decay.

### `supabase/functions/weekly-rank-report/index.ts`
Cron every Monday. Compiles weekly XP summary per client, queues notification.

### `supabase/functions/check-badges/index.ts`
Called after XP transactions. Evaluates all 16 badge requirements against user data. Inserts unlocked badges into `user_badges`.

---

## Phase 5: Client Ranked Page

**`src/pages/Ranked.tsx`** — Full page with sections:

1. **My Rank Card**: tier badge (colored SVG/icon), division text, XP progress bar (tier-colored fill), streak + multiplier display, leaderboard position
2. **Leaderboard**: 4 tabs (All Time, This Week, Streak Kings, Tier Climbers), search bar, pinned own row, Champion rows with crown/glow treatment
3. **XP History Feed**: timeline of transactions, color-coded (green/red/gold), Day/Week filter, lazy-loaded
4. **Badge Collection**: 3-column grid of earned badges only

**`src/hooks/useRanked.ts`** — React hooks for:
- `useMyRank()` — fetches user's `ranked_profiles` row
- `useRankedLeaderboard(tab)` — fetches sorted participant list
- `useXPHistory(userId, filter)` — paginated XP transactions
- `useMyBadges(userId)` — earned badges

---

## Phase 6: Coach Ranked Page (XP Manager)

Same page component with coach-only tab:
- **Leaderboard** tab (shared with client)
- **XP Manager** tab with sub-sections:
  - At-Risk Clients (3+ XP loss days in last 7)
  - Top Movers This Week
  - Stagnant Clients (7+ days no XP activity)
  - Award XP (presets: PR Hit +20, Perfect Week +50, Consistency +20, Above & Beyond +50, Custom 10-50)
  - Client XP Ledger (searchable per-client history)

---

## Phase 7: Dashboard Integration

**`src/pages/Dashboard.tsx`** — Add compact "My Rank" card in `ClientDashboard` after `ChallengeBanner` / before `DateNavigator`:
- Shows: tier badge icon (24x24), tier + division text, "X XP to next"
- Gold border card
- Tappable → navigates to `/ranked`

---

## Phase 8: Workout/Nutrition Integration

**`src/components/WorkoutLogger.tsx`** — After workout completion, call `calculate-xp` edge function with `{ actionType: "workout_completed" }` and for each PR: `{ actionType: "personal_best" }`

**Nutrition logging** (DailyNutritionLog / AddFoodScreen) — After food log, call edge function to evaluate macro compliance XP in real-time

**Check-in submission** — After weekly check-in, trigger `{ actionType: "checkin" }`

---

## Phase 9: Animations

**`src/components/ranked/RankUpOverlay.tsx`** — Full-screen overlay with tier-colored particles, bounce animation, haptic trigger
- Standard division rank-up: 3-4s
- Major tier promotion: confetti variant, 4-5s
- Champion entry: crown descending, red/black/gold, 5-6s

**`src/components/ranked/XPToast.tsx`** — Pill toast sliding from bottom, "+X XP" green / "-X XP" red, 1.5s auto-dismiss

**`src/components/ranked/BadgeUnlockOverlay.tsx`** — Smaller overlay with shimmer, 2s

**`src/components/ranked/DemotionBanner.tsx`** — Subtle top-bar notification, 2-3s

---

## Phase 10: Badge Seeding

Insert all 16 badge definitions into `badges` table via the insert tool (not migration):
- 5 Consistency badges (Iron Stomach, Cardio Machine, Relentless, Locked In, In Momentum)
- 6 Milestone badges (First Blood, Century Club, 1K Club, 10K Club, Tier Breaker, Summit)
- 5 Rare badges (Untouchable, Perfect Month, Coach's Pick, Comeback King, The Wall)

---

## Phase 11: Migration Placement System

Admin function to assign starting tiers based on tenure buckets. New client 14-day 1.5x boost flag on `ranked_profiles`.

---

## Files Created (New)
1. `src/pages/Ranked.tsx`
2. `src/hooks/useRanked.ts`
3. `src/utils/rankedXP.ts`
4. `src/components/ranked/RankUpOverlay.tsx`
5. `src/components/ranked/XPToast.tsx`
6. `src/components/ranked/BadgeUnlockOverlay.tsx`
7. `src/components/ranked/DemotionBanner.tsx`
8. `src/components/ranked/TierBadge.tsx`
9. `src/components/ranked/MyRankCard.tsx`
10. `src/components/ranked/RankedLeaderboard.tsx`
11. `src/components/ranked/XPHistoryFeed.tsx`
12. `src/components/ranked/BadgeCollection.tsx`
13. `src/components/ranked/XPManager.tsx`
14. `src/components/dashboard/MyRankDashboardCard.tsx`
15. `supabase/functions/calculate-xp/index.ts`
16. `supabase/functions/check-missed-events/index.ts`
17. `supabase/functions/weekly-rank-report/index.ts`
18. `supabase/functions/check-badges/index.ts`

## Files Modified
1. `src/components/AppLayout.tsx` — Add Ranked nav item
2. `src/App.tsx` — Add /ranked route
3. `src/pages/Dashboard.tsx` — Add MyRankDashboardCard
4. `src/components/WorkoutLogger.tsx` — Trigger XP on workout completion

## Database Changes
- 5 new tables with RLS
- 16 badge seed rows

---

## Technical Notes

- All XP writes are async and non-blocking (fire-and-forget from UI, edge function handles persistence)
- `ranked_profiles` is initialized lazily — first time a user visits /ranked or first XP event, a row is created
- Champion detection: after any XP update, query top 5 by `total_xp`, update `current_tier` accordingly
- Streak multiplier: calculated at XP award time from `ranked_profiles.current_streak`
- Weekly reset for "This Week" tab: query `xp_transactions` where `created_at >= last Monday midnight`
- Demotion shield logic: `calculateTierFromXP` never drops below current tier floor unless `inactive_days >= 7`

This will be implemented across multiple messages due to the sheer volume of code. I will start with the database migration, then navigation/routing, then the core components.

