

# Health Integrations Overhaul + Remove Cardio Tab

## Honest Assessment

Before diving in, here's the reality of each integration:

**1. Remove Cardio tab from Training** — Simple UI change. Done in one edit.

**2. Apple Health** — **Cannot work from a PWA.** Apple Health (HealthKit) is only accessible to native iOS apps compiled with Xcode. No browser, PWA, or web view can access it. The current code checks `Capacitor.isNativePlatform()` which is always `false` for your PWA. The `DeviceMotionEvent` permission (used in onboarding) grants access to the accelerometer — NOT to Apple Health data. These are completely different things. To properly sync Apple Health, you would need to build and distribute a native iOS app via Xcode using Capacitor with a HealthKit plugin.

**3. Fitbit** — **Achievable with OAuth.** Fitbit has a well-documented Web API. The flow: user clicks Connect → redirected to Fitbit OAuth → returns with auth code → edge function exchanges code for tokens → tokens stored → sync function fetches step data. This requires a Fitbit Developer App (client ID + secret).

**4. Google Fit** — **Achievable with OAuth**, same pattern as Fitbit. Requires Google Cloud OAuth credentials with Fitness API scope.

**5. Whoop** — **Achievable with OAuth**, but Whoop's API does not expose step counts (their API focuses on recovery, strain, sleep). Limited usefulness for step tracking.

## What I'll Implement

### Phase 1: Remove Cardio Tab (Training page)
- Remove the `<TabsTrigger value="cardio">` and `<TabsContent value="cardio">` from `Training.tsx`
- Remove the `CardioManager` import

### Phase 2: Fix Health Integrations UI to be honest
- **Apple Health**: Change the "Connect" button to clearly state it requires the native app (not PWA). Show "Available in native app only" instead of the misleading modal about adding to Home Screen.
- **Google Fit**: Same — mark as requiring OAuth setup.
- Remove the fake "connected" state for Fitbit/Whoop that currently just inserts a DB row with no real tokens.

### Phase 3: Implement Real Fitbit OAuth Flow
This is the most impactful integration since you already clicked "Connect" on Fitbit. Full OAuth implementation:

1. **Edge function: `fitbit-auth-callback`** — Handles OAuth code exchange, stores tokens in `wearable_connections`
2. **Edge function: `fitbit-auth-start`** — Returns the Fitbit OAuth authorization URL
3. **Update `HealthIntegrations.tsx`** — "Connect Fitbit" opens real OAuth flow
4. **Update `sync-wearable-steps`** — Already handles Fitbit API calls, just needs real tokens
5. **Token refresh** — Already scaffolded in `sync-wearable-steps-batch`

**Requires**: Fitbit Developer App credentials (client ID + client secret). I'll need to ask you to provide these.

### Phase 4: Google Fit OAuth (same pattern)
Same architecture as Fitbit but with Google Fitness API endpoints.

**Requires**: Google Cloud OAuth credentials with Fitness API scope.

## Technical Details

### Fitbit OAuth Flow
```text
User clicks "Connect Fitbit"
  → Frontend calls edge fn `fitbit-auth-start`
  → Returns Fitbit OAuth URL
  → User redirects to fitbit.com, grants permission
  → Fitbit redirects back to callback URL
  → Edge fn `fitbit-auth-callback` exchanges code for tokens
  → Stores access_token, refresh_token, expires_at in wearable_connections
  → Redirects user back to /profile with success param
  → "Sync Now" calls sync-wearable-steps with real token
```

### Files to modify
- `src/pages/Training.tsx` — Remove cardio tab
- `src/components/settings/HealthIntegrations.tsx` — Honest provider states, real OAuth flows
- `supabase/functions/fitbit-auth-start/index.ts` — New: generates OAuth URL
- `supabase/functions/fitbit-auth-callback/index.ts` — New: exchanges code, stores tokens
- `supabase/functions/google-fit-auth-start/index.ts` — New
- `supabase/functions/google-fit-auth-callback/index.ts` — New

### Prerequisite
Before implementing Fitbit/Google Fit OAuth, you'll need to create developer apps on those platforms and provide the client ID + secret. I'll walk you through that step by step.

### What stays as-is
- Manual step entry (always works, no API needed)
- The `daily_health_metrics` table and step tracking UI
- Whoop (marked as "coming soon" — their API doesn't expose steps)

