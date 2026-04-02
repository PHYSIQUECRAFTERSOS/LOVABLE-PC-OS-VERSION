

## Fix: Show Placement Status on Client Profile (Coach + Client Views)

### Problem
The coach's client workspace (SummaryTab) always shows the tier badge (e.g., "Bronze V") even when the client is in the placement series. This is because:
1. The `RankedProfile` interface doesn't include `placement_status` or `placement_days_completed`
2. The query to `ranked_profiles` doesn't fetch these fields
3. The rank card rendering doesn't check for placement state

The client-side Dashboard already handles this correctly via `MyRankDashboardCard` — no changes needed there.

### Fix (single file)

**`src/components/clients/workspace/SummaryTab.tsx`**

1. **Extend the `RankedProfile` interface** — add `placement_status` and `placement_days_completed` fields

2. **Update the Supabase query** — add `placement_status, placement_days_completed` to the `.select()` call on line ~613

3. **Import `PlacementTracker`** from `@/components/ranked/PlacementTracker`

4. **Update the rank card render block** (line ~729) — before rendering the tier badge, check `rankedProfile.placement_status`. If `"pending"` or `"in_progress"`, render the compact `PlacementTracker` instead of the tier badge + progress bar. This mirrors the exact same pattern used in `MyRankDashboardCard` (lines 106-122).

### Improvements
- The placement card in the coach view will show "Day X of 7" progress, matching the Ranked leaderboard
- Prevents coaches from seeing a misleading "Bronze V" for new clients
- Consistent experience: coach sees the same placement state the client sees on their own dashboard

### Files Modified
- `src/components/clients/workspace/SummaryTab.tsx` (interface, query, conditional render)

