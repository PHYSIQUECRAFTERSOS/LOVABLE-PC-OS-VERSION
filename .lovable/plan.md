

## Plan: Ranked Placement Series System (IMPLEMENTED)

### What Was Built
A 7-day placement series for new clients entering the ranked system. During placement, clients see a "?" badge and progress tracker instead of a rank. After 7 days, their compliance is evaluated and they receive a starting rank (capped at Gold III / 1,650 XP). Coaches can also manually place clients via the XP Manager.

### Database Changes
- Added `placement_status` (pending/in_progress/completed/coach_override), `placement_start_date`, `placement_days_completed`, `placement_score` columns to `ranked_profiles`
- Existing profiles default to `completed` (unaffected)
- New profiles created with `placement_status = 'pending'`

### Scoring Formula
- Workouts (40%): Completed vs scheduled calendar events
- Nutrition (40%): Days within ±150 cal of target
- Cardio (20%): Completed vs scheduled cardio events
- Missing pillars redistribute weight

### Score → XP Mapping
| Score | Starting Rank | XP |
|-------|--------------|-----|
| 95-100% | Gold III | 1,650 |
| 90-94% | Gold V | 1,250 |
| 80-89% | Silver I | 1,100 |
| 65-79% | Silver III | 800 |
| 50-64% | Silver V | 500 |
| 30-49% | Bronze III | 200 |
| 0-29% | Bronze V | 0 |

### Files Changed
| File | Change |
|------|--------|
| `supabase/migrations/` | Added placement columns |
| `supabase/functions/daily-xp-evaluation/index.ts` | Placement day tracking + finalization logic |
| `src/utils/rankedXP.ts` | PLACEMENT_XP_MAP, calculatePlacementScore, getPlacementXP helpers |
| `src/hooks/useRanked.ts` | New profiles get placement_status='pending' |
| `src/components/ranked/PlacementTracker.tsx` | NEW — 7-dot progress tracker + "?" badge |
| `src/components/ranked/MyRankCard.tsx` | Shows PlacementTracker during placement |
| `src/components/dashboard/MyRankDashboardCard.tsx` | Compact placement tracker in dashboard |
| `src/components/ranked/RankUpOverlay.tsx` | Added placement_reveal celebration variant |
| `src/components/ranked/PendingRankUpPopup.tsx` | Handles placement_reveal events |
| `src/components/ranked/XPManager.tsx` | Added "Place Client" coach override section |
| `src/components/ranked/RankedLeaderboard.tsx` | Shows "Placement in Progress" for in-placement clients |
