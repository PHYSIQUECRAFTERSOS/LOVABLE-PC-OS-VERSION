## Milestone Achievement Popups — iPhone-Optimized Dopamine System

A full-screen animated celebration that fires when a client crosses a workout / cardio / nutrition milestone. Mobile-first, premium matte-black + gold visual, no share button (per your direction) — just a beautiful screenshottable moment.

---

### 1. Milestone catalog (seeded into `badges` table)

**Workout count** (lifetime completed workouts, excluding accessories):  
`1, 10, 25, 50, 75, 100, 250, 500, 750, 1000`

**Cardio sessions** (lifetime completed cardio entries):  
`1, 25, 50, 100, 250, 500, 750,1000`

**Nutrition logging — total days logged:**
`7, 30, 100, 250, 500, 1000`

**Nutrition logging — current streak (consecutive days):**
`7, 14, 30, 60, 100, 180, 365`

Each is one row in `badges` with category (`workout_count` / `cardio_count` / `nutrition_total` / `nutrition_streak`), threshold, name, description, and Lucide icon name.

---

### 2. Database changes

Additive only — nothing destructive.

- New table `client_milestone_progress` (one row per client per category) — caches current counts so checks are O(1) and we don't recount every workout each time:
  - `client_id`, `workouts_completed`, `cardio_completed`, `nutrition_days_total`, `nutrition_current_streak`, `nutrition_longest_streak`, timestamps
- New table `client_milestone_unlocks` — records which milestone badges a client has earned and whether the celebration popup has been shown yet:
  - `client_id`, `badge_id`, `category`, `threshold`, `unlocked_at`, `celebrated_at` (null until shown)
- Add `category`, `threshold`, `tier` columns to existing `badges` table (additive, nullable)
- RLS: client can read/update their own rows; coaches/admins can read their clients'

**Backfill** (silent, one-time): a migration recounts every existing client's completed workouts (`workout_sessions` where status='completed' joined to non-accessory workouts), cardio (`cardio_logs`), total nutrition days (distinct dates in `nutrition_logs`), and current streak (reuse `get_logging_streak_v2`). Inserts all earned `client_milestone_unlocks` rows with `celebrated_at = now()` so existing clients see them in their trophy room but don't get popup-spammed.

---

### 3. Detection logic

A single hook `useMilestoneWatcher()` mounted in `AppLayout` for clients:

- Subscribes to relevant invalidation signals (workout completed, cardio logged, nutrition saved)
- Recomputes the affected counter, compares against the threshold list, inserts any newly-crossed `client_milestone_unlocks` rows
- Polls for unshown unlocks (`celebrated_at IS NULL`) and queues them into a popup stack

Going-forward triggers are also added at the moment of completion (workout completion handler, cardio log save, nutrition log save) so the popup fires within ~1 second of the action — no waiting on cron.

---

### 4. The celebration popup (the dopamine moment)

Full-screen modal, designed for iPhone (375–430px), portrait, safe-area aware:

```text
┌─────────────────────────┐
│   ✦ confetti burst ✦   │
│                         │
│      ╱ shield ╲         │  ← matte black shield, gold bevel
│     │   100   │         │  ← huge number (96pt, gold)
│     │   🏋️    │         │  ← Lucide icon (Dumbbell/Heart/Apple)
│      ╲       ╱          │
│                         │
│   YOU JUST HIT          │  ← uppercase gold label
│   100 WORKOUTS          │
│                         │
│   "Let's GOOO   "          ← personalized line
│                         │
│   [ Tap to continue ]   │
└─────────────────────────┘
```

**Animation sequence** (~2.5s total):

1. Backdrop fades to near-black with radial gold glow (300ms)
2. Shield scales in with spring bounce + 360° spin (600ms)
3. Number counts up from 0 → threshold (800ms ease-out)
4. Gold particles burst outward from shield (reuses existing `ConfettiBurst`)
5. Label + subtitle fade up (300ms stagger)
6. Subtle continuous shimmer across the shield surface

Built with framer-motion. Haptic feedback (`Haptics.impact({ style: 'Heavy' })`) on shield landing for native iOS feel.

**Stacking:** if a client unlocks multiple milestones at once (e.g. their 100th workout is also a 7-day streak day), popups queue and play one after another, dismissable by tap.

After dismiss → write `celebrated_at = now()` so it never replays.

---

### 5. Trophy Room (passive viewing surface)

New section on `/progress` page: "Achievements" grid showing all earned badges in matte-black-and-gold cards, locked ones shown as silhouettes with "X more workouts" countdown. Tap any earned badge to replay its celebration popup — gives clients an evergreen reason to screenshot.

---

### 6. Files

**New:**

- `supabase/migrations/<ts>_milestone_system.sql` — tables, RLS, badge seed, backfill
- `src/hooks/useMilestoneWatcher.tsx` — detection + queue
- `src/components/milestones/MilestoneCelebration.tsx` — the popup
- `src/components/milestones/MilestoneShield.tsx` — animated badge visual
- `src/components/milestones/TrophyRoom.tsx` — grid view
- `src/utils/milestoneDefinitions.ts` — threshold lists + copy

**Edited:**

- `src/components/layout/AppLayout.tsx` — mount watcher for clients
- `src/components/training/WorkoutSession*.tsx` — trigger check after completion
- `src/components/cardio/...` — trigger after cardio log save
- `src/components/nutrition/...` — trigger after nutrition log save
- `src/pages/Progress.tsx` — add Achievements tab

### Out of scope

- No Instagram share button (per your direction)
- No PR milestones (you didn't pick that category)
- No changes to existing `ranked_badges` / Ranked system — milestones are a separate, broader-audience layer
- No coach-facing notifications