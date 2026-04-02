

## Fix: Onboarding completion black screen + UX improvements

### Root cause of Zane's black screen
The `handleComplete` function in `Onboarding.tsx` calls `saveProgress(TOTAL_STEPS, true)` but **never checks if the save succeeded**. The `saveProgress` function itself ignores Supabase errors from both `update` and `insert`. If the DB write fails or times out:
1. `onboarding_completed` never gets set to `true` in the database
2. The flow proceeds to post-steps (photo → health), then navigates to `/dashboard`
3. `ProtectedRoute` queries `onboarding_profiles.onboarding_completed`, finds `false`, redirects back to `/onboarding`
4. `/onboarding` checks the same field, finds `false`, shows the form again — or if partially saved, enters a loop
5. Result: infinite loading spinner (the black screen Zane saw)

### Plan

**1. Make `saveProgress` return success/failure and handle errors**
- In `saveProgress`: check `{ error }` from the Supabase upsert. If error, show toast and return `false`.
- In `handleComplete`: if `saveProgress` returns `false`, show error toast and stop — don't proceed to post-steps.
- Add a retry mechanism: if the save fails, let the user tap "Complete Setup" again.

**2. Add a "You're All Set!" success confirmation screen**
- After the post-steps (photo/health) complete, instead of immediately navigating to `/dashboard`, show a brief success screen:
  - Checkmark animation
  - "Welcome, {first_name}! You're all set."
  - "Your coach has been notified."
  - Auto-navigates to dashboard after 3 seconds, or tap "Go to Dashboard" immediately.
- This replaces the current instant `navigate("/dashboard")` which races against ProtectedRoute's DB check.

**3. Make photo and health sync steps skippable**
- `OnboardingProfilePhoto`: Add a "Skip for now" button that calls `onComplete()` directly.
- `OnboardingHealthSyncFull`: Add a "Skip for now" button (it already has "Continue" after connecting, just add skip for the initial state too).

**4. Add a safety timeout on the completion flow**
- If the navigate-to-dashboard doesn't resolve within 5 seconds (ProtectedRoute still loading), show a fallback with "Go to Dashboard" button that force-navigates.

### Files to modify
- `src/pages/Onboarding.tsx` — error handling in saveProgress, success screen, skip buttons integration
- `src/components/onboarding/OnboardingProfilePhoto.tsx` — add "Skip for now" button
- `src/components/onboarding/OnboardingHealthSyncFull.tsx` — add "Skip for now" button

No database changes needed. No edge function changes needed.

