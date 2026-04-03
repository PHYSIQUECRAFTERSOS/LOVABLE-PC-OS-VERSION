

## Fix Onboarding Completion Flow, Health Sync Resilience, and Signature Color

### Bugs Found

**1. Signature draws in BLACK instead of WHITE (confirmed bug)**
The canvas setup `useEffect` runs with `[]` deps on component mount. But the `<canvas>` element is conditionally rendered — it only appears after the user scrolls to the bottom (`hasScrolledToBottom`). On mount, `canvasRef.current` is `null`, so the white stroke style (`#ffffff`) is never applied. When the canvas finally renders, it uses the browser default: black. This matches Calvin's report exactly.

**Fix**: Add `hasScrolledToBottom` to the useEffect dependency array so the canvas context gets initialized when it actually appears in the DOM.

**2. Post-onboarding "glitch" / spinner before dashboard (confirmed bug)**
After onboarding completes, the user navigates to `/dashboard`. Each route has its own `<ProtectedRoute>` wrapper, so a **new instance** mounts with `onboardingChecked = false`. This triggers a Supabase query to verify `onboarding_completed`, showing a loading spinner until the query resolves. If the query takes even 500ms, the user sees a flash of spinner after the success screen — feels like a "glitch" and prompts them to refresh.

**Fix**: Pass `{ state: { onboardingComplete: true } }` via `navigate()` from the onboarding success screen. In `ProtectedRoute`, check for this navigation state and skip the DB query when present — the completion was already verified by `saveProgress`.

**3. Health Sync step resilience (preventive fix)**
The `OnboardingHealthSyncFull` post-step works correctly for non-native (skips to settings). But `OnboardingHealthSync` (step 12 in-form) could hang if `DeviceMotionEvent.requestPermission()` never resolves on certain browsers. Add a timeout to the permission request so it can't block indefinitely. Also add a catch-all error handler so any failure during the health sync post-step always calls `onComplete()` with a toast, never leaving the user stuck.

---

### Files to Change

**`src/components/onboarding/OnboardingWaiver.tsx`**
- Change the canvas setup `useEffect` to depend on `hasScrolledToBottom`
- This ensures `ctx.strokeStyle = "#ffffff"` is applied when the canvas actually exists

**`src/components/ProtectedRoute.tsx`**
- Read `location.state?.onboardingComplete` from React Router
- If `true` and role is `client`, skip the Supabase onboarding check and set `onboardingChecked = true` / `needsOnboarding = false` immediately

**`src/pages/Onboarding.tsx`**
- Update `handleGoToDashboard` to pass `{ state: { onboardingComplete: true } }` in the navigate call

**`src/components/onboarding/OnboardingHealthSync.tsx`**
- Add a 5-second timeout around `DeviceMotionEvent.requestPermission()` so it can't hang forever
- On timeout, treat as "denied" and allow the user to proceed

**`src/components/onboarding/OnboardingHealthSyncFull.tsx`**
- Wrap the entire `handleConnect` in a try/catch that always calls `onComplete()` on unrecoverable error, so the user is never stuck on this screen

### Testing
- Verify signature draws in white on the waiver canvas
- Verify post-onboarding navigates to dashboard with no spinner flash
- Verify health sync skip/connect paths all reach the success screen
- Test Google Fit edge function responds correctly

