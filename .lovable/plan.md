

# Implement Daily XP Evaluation Edge Function

## What This Solves

Currently, XP is only awarded in real-time when a client actively logs something (workout, cardio, check-in). The system is missing **end-of-day server-side evaluation** for:

1. **Nutrition macro compliance XP** (+7 calories ±100, +1 each for protein/carbs/fats ±5g)
2. **Missed workout penalty** (-4 XP, 24h after scheduled workout with no log)
3. **Missed cardio penalty** (-2 XP, 24h after scheduled cardio with no log)
4. **No nutrition logged penalty** (-5 XP, if zero food entries for the day)
5. **Calories off by 300+** (-5 XP, if logged but off target by 300+, mutually exclusive with #4)
6. **Missed check-in penalty** (-15 XP, 24h after scheduled check-in with no log)
7. **7+ day inactivity decay** (-30 XP/day for each day beyond 7 consecutive inactive days)
8. **Streak tracking** (update `current_streak`, `longest_streak`, `inactive_days` on `ranked_profiles`)

## Architecture

### New Edge Function: `supabase/functions/daily-xp-evaluation/index.ts`

A single edge function that processes **all clients** in one invocation. Designed to run on a cron schedule (once daily, or every few hours for safety).

**Logic flow per client:**
1. Determine "yesterday" (the day being evaluated — always processes the previous day to allow the full 24h grace period)
2. Check `xp_transactions` for existing entries on that date to prevent duplicate processing
3. **Nutrition compliance**: Sum `nutrition_logs` for yesterday by `client_id` where `logged_at = yesterday`. Compare totals against latest `nutrition_targets`. Award/penalize accordingly.
4. **Missed workouts**: Query `calendar_events` where `event_type = 'workout'`, `event_date = yesterday`, `is_completed = false`, `user_id = client_id`. Apply -4 XP per missed event.
5. **Missed cardio**: Same pattern for `event_type = 'cardio'`. Apply -2 XP per missed event.
6. **Missed check-in**: Same for `event_type = 'checkin'`. Apply -15 XP.
7. **Inactivity decay**: If `ranked_profiles.inactive_days >= 7`, apply -30 XP.
8. **Streak update**: If all scheduled events were completed AND nutrition was logged, increment streak. Otherwise reset to 0.
9. Update `ranked_profiles` with new `total_xp`, tier/division recalculation, `current_streak`, `inactive_days`, `last_active_date`.

### Duplicate Prevention
Each XP transaction includes a `description` field with the date stamp (e.g., `"Nutrition compliance: 2026-03-16"`). Before processing, the function checks if any `xp_transactions` with matching `transaction_type` and date already exist for that user. Skips if found.

### Cron Schedule
Set up via `pg_cron` + `pg_net` to invoke the function daily at 6:00 AM UTC (covers midnight for North American timezones). Uses the SQL insert tool (not migration) since it contains project-specific URLs/keys.

## Config Update

Add to `supabase/config.toml`:
```toml
[functions.daily-xp-evaluation]
verify_jwt = false
```

## Files

| File | Action |
|------|--------|
| `supabase/functions/daily-xp-evaluation/index.ts` | **Create** — full edge function |
| `supabase/config.toml` | **Edit** — add function config |

After deploying, a `pg_cron` job will be inserted via the SQL insert tool to schedule daily execution.

## XP Award/Penalty Logic (Server-Side)

The edge function replicates the `awardXP` logic from `rankedXP.ts` server-side (tier calculation, demotion shield, multiplier application) since it uses `SUPABASE_SERVICE_ROLE_KEY` and runs outside the browser. It processes all clients in a batch loop, same pattern as `calculate-risk-scores`.

## Key Rules Enforced
- No penalty on rest days (nothing scheduled = no penalty)
- Calories off 300+ and no-nutrition are mutually exclusive
- Streak multipliers apply to gains only, never losses
- Demotion shield: can't drop tier unless `inactive_days >= 7`
- XP floor at 0

