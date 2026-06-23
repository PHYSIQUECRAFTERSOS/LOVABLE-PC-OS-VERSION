# Challenge Banner: Hide past + deep-link to challenge

Two small, presentation-layer fixes to the client dashboard's challenge banner.

## 1. Hide past challenges from the banner

The banner currently filters by `status IN ('upcoming','active')`, but a challenge whose `end_date` has already passed often still carries `status='active'` until the `challenge-lifecycle` edge function runs. That's why expired "PR Challenge" rows still appear at the top of the dashboard.

**Change in `src/hooks/useChallenges.ts` → `useUndismissedChallenges`:**
- After fetching, drop any challenge where `end_date < today` (using the same end-of-day rule as `getEffectiveStatus` in `ChallengesTab.tsx` — past 23:59:59 of `end_date` counts as completed).
- Keep the existing status filter, invite-only logic, and 3-item cap.

Result: only truly active or upcoming challenges show in the banner.

## 2. View button opens the challenge directly

Today, `View` calls `navigate("/challenges")`, which lands on the default `leaderboard` tab. The user wants it to open the challenge's detail view.

**Change in `src/components/dashboard/ChallengeBanner.tsx`:**
- Replace `navigate("/challenges")` with `navigate("/challenges", { state: { focusChallengeId: c.id } })`.

**Change in `src/pages/Challenges.tsx`:**
- Read `location.state?.focusChallengeId` via `useLocation()`.
- On mount (and when state changes), if present: `setActiveTab("challenges")` and `setFocusChallengeId(...)`, then clear the history state (`window.history.replaceState({}, "")`) so a manual refresh doesn't re-trigger.

`ChallengesTab` already handles `focusChallengeId` by opening `ChallengeDetailView` automatically, so no changes are needed there.

## Out of scope
- No changes to challenge lifecycle, RLS, banner dismissal logic, or coach-side UI.
- No DB migrations.

## Files touched
- `src/hooks/useChallenges.ts` (filter)
- `src/components/dashboard/ChallengeBanner.tsx` (navigate with state)
- `src/pages/Challenges.tsx` (consume state, switch tab, focus challenge)
