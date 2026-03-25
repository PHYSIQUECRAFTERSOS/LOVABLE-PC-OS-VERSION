

# Fix: Daily XP Evaluation Shows 0 XP + Popup Improvements

## Root Cause

The `DailyRewardsPopup` queries `xp_transactions` filtered by `transaction_type = "daily_eval"`. But in the edge function, individual nutrition rewards use distinct types (`calories_on_target`, `protein_on_target`, etc.). The `daily_eval` type is only assigned to the **0 XP marker** transaction inserted for dedup purposes. So the popup always finds exactly one row with 0 XP.

## Edge Function Logic Audit

The edge function logic itself is **correct** -- it properly checks nutrition targets, applies ±100 cal / ±5g thresholds, and inserts individual XP transactions. The problem is purely in the client-side popup query.

## Changes

### 1. Fix DailyRewardsPopup query (`src/components/ranked/DailyRewardsPopup.tsx`)

Instead of filtering by `transaction_type = "daily_eval"`, query ALL transactions that were inserted during the daily evaluation. Use the `daily_eval` marker to find the timestamp, then fetch sibling transactions within the same minute window. Alternatively (simpler and more reliable): query by the specific transaction types the eval creates:

- Remove `.eq("transaction_type", "daily_eval")`
- Add `.in("transaction_type", ["daily_eval", "calories_on_target", "protein_on_target", "carbs_on_target", "fats_on_target", "no_nutrition", "calories_off_300", "missed_workout", "missed_cardio", "missed_checkin", "decay_per_day"])`
- Filter OUT the 0 XP `daily_eval` marker from the breakdown display (keep it only as a signal that eval ran)
- Fix the date range: the daily eval runs at 6 AM UTC evaluating **yesterday**, so its `created_at` is **today** (the day it ran), not yesterday. Currently querying yesterday's `created_at` range which may miss results depending on timezone. Fix to query by `description ILIKE '%{yesterday}%'` to match the eval date embedded in descriptions.

### 2. Show popup only once per day on first login (`src/components/ranked/DailyRewardsPopup.tsx`)

- Change `storageKey` logic: use today's date (not yesterday) as the "seen" marker since we're showing yesterday's results on today's login
- Keep existing `localStorage` guard so it only shows once per day

### 3. Improve breakdown labels

Add emoji prefixes to match the user's documented XP table:
- "🎯 Calories on target" 
- "🥩 Protein on target"
- "🍚 Carbs on target"  
- "🥑 Fats on target"
- "🚫 No nutrition logged"
- "⚠️ Calories off by 300+"
- "❌ Missed workout"
- "❌ Missed cardio"

### 4. Popup UX improvements

- Change overlay title from "Daily Nutrition Rewards" to "Daily XP Summary" since it includes workout/cardio penalties too
- Show net XP with color: green for positive, red for negative, neutral for zero
- Add a subtitle showing which date was evaluated (e.g., "Results for Mar 24")

## Technical Details

```typescript
// DailyRewardsPopup.tsx - Fixed query
const EVAL_TX_TYPES = [
  "calories_on_target", "protein_on_target", "carbs_on_target", 
  "fats_on_target", "no_nutrition", "calories_off_300",
  "missed_workout", "missed_cardio", "missed_checkin", "decay_per_day",
  "daily_eval" // marker - used to confirm eval ran
];

// Query by description containing the eval date (reliable regardless of timezone)
const { data } = await db
  .from("xp_transactions")
  .select("transaction_type, xp_amount, description")
  .eq("user_id", user.id)
  .in("transaction_type", EVAL_TX_TYPES)
  .ilike("description", `%${yesterday}%`);

// Filter out the 0 XP marker from display
const displayItems = (data || []).filter(
  (tx) => tx.transaction_type !== "daily_eval"
);
```

### Files to edit
- `src/components/ranked/DailyRewardsPopup.tsx` -- fix query + labels + once-per-day logic
- `src/components/ranked/XPCelebrationOverlay.tsx` -- update title to "Daily XP Summary", add eval date subtitle

