

## Plan: Faster Health Sync Intervals

### Current State
- **Scheduled sync**: every 2 hours (`AUTO_SYNC_INTERVAL_MS = 2 * 60 * 60 * 1000`)
- **Foreground resume throttle**: 30 minutes (`FOREGROUND_SYNC_THROTTLE_MS = 30 * 60 * 1000`)
- **Initial sync delay**: 5 seconds after mount

### Recommendation
Reduce to **30-minute scheduled sync** and **5-minute foreground throttle**. This is completely safe — the HealthKit query is a lightweight local-device read (no network call, no API rate limit). It queries aggregated daily stats from the on-device HealthKit store, which Apple designed for frequent access. The Supabase upsert is a single row per day, trivial load.

Going lower than 30 minutes for the background interval wastes battery for minimal benefit. The real win is the **foreground throttle drop to 5 minutes** — every time a client comes back from a walk and opens the app, if 5+ minutes have passed, steps update immediately.

### Changes

**File: `src/hooks/useHealthSync.ts`** (3 constant changes, lines 41-43)

```text
Before:
  AUTO_SYNC_INTERVAL_MS = 2 * 60 * 60 * 1000   // 2 hours
  FOREGROUND_SYNC_THROTTLE_MS = 30 * 60 * 1000  // 30 minutes
  INITIAL_SYNC_DELAY_MS = 5000                   // 5 seconds

After:
  AUTO_SYNC_INTERVAL_MS = 30 * 60 * 1000        // 30 minutes
  FOREGROUND_SYNC_THROTTLE_MS = 5 * 60 * 1000   // 5 minutes
  INITIAL_SYNC_DELAY_MS = 3000                   // 3 seconds
```

Update the two log messages referencing "2-hour" to say "30-min" (lines 372, 385).

### Why this is safe
- HealthKit reads are local on-device — zero network cost, zero rate limits
- The upsert is a single `daily_health_metrics` row (conflict on `user_id,metric_date`) — negligible DB load
- No new tables, no new queries, no new components — just 3 constants changed
- Battery impact is minimal: the sync only runs when the app is in the foreground (Capacitor `appStateChange`) or during the setInterval which only fires while the JS context is alive

### What the client experiences after this change
- Opens app after a walk → steps update within seconds (foreground trigger, 5-min throttle)
- Keeps app open during a walk → steps refresh every 30 minutes automatically
- Pulls to refresh on StepsCard → instant sync (manual `syncNow()` has no throttle)

