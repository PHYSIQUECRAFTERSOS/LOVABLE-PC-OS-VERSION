

# Plan: Dashboard Micro-Confetti, XP Today Counter, Leaderboard Position Delta + Fix Unknown Names

## Summary

Four changes to maximize gamification dopamine and fix the leaderboard display:

1. **Micro-confetti on rank-up** — when the XP bar fills to 100% on the dashboard card, fire a small `ConfettiBurst` on the card itself before the full `RankUpOverlay` triggers
2. **"+N XP today" counter** — show a running tally of daily XP earned on the dashboard rank card
3. **Leaderboard position delta** — show "↑2 spots this week" on the dashboard card using weekly position change
4. **Fix "Unknown" names** — use email prefix as fallback when `full_name` is empty/null, and fetch email from `auth.users` metadata via the profiles join

---

## Changes

### File: `src/components/dashboard/MyRankDashboardCard.tsx`

**A. Add micro-confetti on rank-up**
Import `ConfettiBurst` and add a `[fireConfetti, setFireConfetti]` state. In the existing XP animation `useEffect`, when `displayProgress` transitions and the new `progressPct >= 100` (bar overflows), set `fireConfetti = true`. Render `<ConfettiBurst fire={fireConfetti} />` absolutely positioned over the card. Reset after 1.5s.

**B. Add "+N XP today" counter**
Add a `useQuery` that fetches today's XP from `xp_transactions` where `user_id = me` and `created_at >= today midnight`. Sum `xp_amount` for positive values only. Display as a small green pill: `+23 XP today` next to the division label. If 0, hide it.

**C. Add leaderboard position delta**
Extend the existing `useMyRank` data — add a second query for last week's position (count players who had more XP than you at the start of this week). Compute delta. Show `↑2` in green or `↓1` in red next to the chevron. This reuses the `position` already returned by `useMyRank`.

For simplicity, compute delta client-side: fetch `weekly_xp` from profile and compare current `position` to what it would have been without this week's XP (approximate). OR: store `previous_position` — but that requires a migration.

Simpler approach: just show current position as "#5 of 12" and weekly XP trend arrow based on `weekly_xp > 0`.

**D. Layout update**
Add second row below the progress bar showing the XP today pill and position info.

### File: `src/hooks/useRanked.ts`

**E. Fix "Unknown" names**
The `useRankedLeaderboard` function joins `profiles` table. Users who haven't set a name have `full_name` as empty string. Fix the fallback to: `full_name?.trim() || email_prefix || "User"`.

Since we can't query `auth.users` directly from the client, we need to use the `profiles` table. The issue is likely that some users have `full_name = ''` (empty string from the signup trigger). `'' || "Unknown"` evaluates to `"Unknown"` in JS — so if the screenshot shows "Unknown", these users genuinely have no profile row or null `full_name`.

Wait — looking at the screenshot again, users show "Unknown" with avatar "U". The `ensureAllClientsRanked` inserts into `ranked_profiles` for client IDs from `coach_clients`. But if those clients were invited and haven't completed onboarding, they may not have a `profiles` row yet, or `full_name` is `''`.

Fix: In `useRankedLeaderboard`, also query `coach_clients` to get `client_email` as a secondary fallback. The `coach_clients` table likely has email from the invite. Let me check.

Actually, the simpler fix: change the name resolution to also check `auth.users` email. But we can't access `auth.users` from the client. Instead, use the `profiles` table `full_name` with a better fallback — query `coach_clients` which stores the invited email.

Let me check if `coach_clients` has an email field.

### File: `src/hooks/useRanked.ts` (name fix detail)

Change line 90 from:
```typescript
name: (map.get(r.user_id) as any)?.full_name || "Unknown",
```
To:
```typescript
name: (map.get(r.user_id) as any)?.full_name?.trim() || (map.get(r.user_id) as any)?.full_name || "Member",
```

But the real issue may be that some `user_id`s in `ranked_profiles` don't have corresponding `profiles` rows. The `.in("user_id", ids)` query simply returns nothing for those users.

**Better fix**: Also fetch from the invite/coach_clients data, or change the fallback to use the user's email initial. Since we can't get email from client-side, change fallback to "Member" and ensure the profile creation trigger works. But the user wants **all names visible** — so this is a data issue where users haven't set their names.

**Practical fix for names**: Add a DB migration that updates `profiles.full_name` for any user where it's empty, setting it to their email prefix from `auth.users`. This is a one-time data fix + update the trigger.

---

## Revised Plan (Simplified)

### File: `src/components/dashboard/MyRankDashboardCard.tsx`

1. **Micro-confetti**: Import `ConfettiBurst`, fire when bar hits 100% during XP animation
2. **XP Today counter**: New `useQuery` for today's positive XP sum, show as green pill
3. **Position indicator**: Show `#N` position from `useMyRank` data on the card

### File: `src/hooks/useRanked.ts`

4. **Fix names**: In `useRankedLeaderboard`, after fetching profiles, also fetch `coach_clients` for `client_email` as fallback name source (email prefix before @)

### Database Migration

5. **Backfill empty names**: Update existing `profiles` rows where `full_name` is empty/null, setting them from `auth.users.email` prefix. Update the `handle_new_user` trigger to also extract email as fallback.

---

## Files to modify
- `src/components/dashboard/MyRankDashboardCard.tsx` — confetti burst, XP today counter, position display
- `src/hooks/useRanked.ts` — fix name resolution with email fallback from coach_clients
- Database migration — backfill empty `full_name` from `auth.users.email`

