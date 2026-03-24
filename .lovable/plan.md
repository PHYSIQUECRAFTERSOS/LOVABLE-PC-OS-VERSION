

# Plan: New Clients Readiness Tracker for Coach Command Center

## Summary

Add a "New Clients (Last 7 Days)" section above the Compliance Snapshot in the Coach Command Center. It shows each recently assigned client with clear status indicators for onboarding form completion and progress photo submission, plus quick actions to message or view the client.

## What it shows

For each client assigned in the last 7 days (via `coach_clients.assigned_at`):
- Client name and avatar
- "Joined X days ago" timestamp
- Onboarding form status: green checkmark if `onboarding_profiles.onboarding_completed = true`, amber warning if incomplete/missing
- Photos status: green checkmark if `progress_photos` count >= 3 (front/side/back), amber warning if fewer
- Quick "Message" button to nudge clients missing items
- Click row to navigate to `/clients/:id`

## Visual design

```text
┌─────────────────────────────────────────────────┐
│ 👋 New Clients (Last 7 Days)              3 new │
├─────────────────────────────────────────────────┤
│ [Avatar] Jane Doe          2 days ago           │
│          ✅ Onboarding  ⚠️ Photos    [Message]  │
│                                                 │
│ [Avatar] Mike Smith        5 days ago           │
│          ⚠️ Onboarding  ⚠️ Photos    [Message]  │
│                                                 │
│ [Avatar] Sarah Lee         6 days ago           │
│          ✅ Onboarding  ✅ Photos     [View]     │
└─────────────────────────────────────────────────┘
```

Clients with ALL items complete show a "View" button (go to workspace).