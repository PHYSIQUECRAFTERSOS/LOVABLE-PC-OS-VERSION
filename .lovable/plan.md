

# Plan: Add Profile Photo + Health Sync Steps to Post-Onboarding Flow

## Approach

Instead of adding 2 more steps to the already 14-step onboarding wizard (which would make it feel longer), these will appear as **full-screen overlay pages after the user clicks "Complete Setup"** on step 14. This mirrors the Trainerize pattern shown in your screenshots — clean, focused, single-purpose screens that appear after the main questionnaire is done.

The flow becomes:
```text
Step 14 (Summary) → "Complete Setup" →
  Screen A: Profile Photo (full-screen, skip option) →
  Screen B: Health Sync (full-screen, skip option) →
  → Navigate to /dashboard
```

## Changes

### 1. New component: `OnboardingProfilePhoto`
**File: `src/components/onboarding/OnboardingProfilePhoto.tsx`** (new)

Full-screen centered layout matching the Trainerize style:
- Large circular avatar area with dashed gold border
- Camera icon below it
- "Personalize your account with a profile photo so your coach can recognize you"
- "TAKE PROFILE PIC" gold button — opens file picker (camera + photo library via `accept="image/*"` + `capture="user"`)
- Uses the existing `compressImage` function from `AvatarUpload.tsx` to compress to 512x512 JPEG
- Uploads to `avatars` bucket as `{userId}/avatar.jpg`, updates `profiles.avatar_url`
- Shows optimistic preview after selection
- "Skip" link below the button
- Calls `onComplete()` callback when done or skipped

### 2. New component: `OnboardingHealthSyncFull`
**File: `src/components/onboarding/OnboardingHealthSyncFull.tsx`** (new)

Full-screen centered layout:
- Illustrated health icon (heart + sync arrows) in dashed gold border
- "Sync Your Health Data"
- "Track your steps, calories burned, and activity automatically. Connect your health app so your coach can monitor your progress."
- On native iOS: "CONNECT APPLE HEALTH" button — uses the existing `useHealthSync()` hook's `connect()` + `syncNow()` methods
- On non-native / Android: "CONNECT GOOGLE FIT" button — uses the existing Google Fit OAuth flow from `HealthIntegrations`
- Shows success state with checkmark when connected
- "Skip" link below
- Calls `onComplete()` when done or skipped

### 3. Update `Onboarding.tsx` — post-completion overlay flow
**File: `src/pages/Onboarding.tsx`**

- Add state: `postStep: "none" | "photo" | "health" | "done"`
- Modify `handleComplete`: instead of navigating to `/dashboard` immediately, set `postStep = "photo"`
- When `postStep === "photo"`: render `OnboardingProfilePhoto` full-screen, on complete set `postStep = "health"`
- When `postStep === "health"`: render `OnboardingHealthSyncFull` full-screen, on complete navigate to `/dashboard`
- The existing step 12 (Health Sync for motion permission) stays as-is — the new screen handles the actual Apple Health / Google Fit connection which is a separate, richer integration

## Improvements I recommend

1. **Camera-first on mobile**: The file input will use `capture="user"` attribute so on mobile it opens the front camera by default, matching the selfie UX from Trainerize
2. **Instant preview**: Show the compressed photo in the circle immediately after selection, before upload completes — feels snappy
3. **Reuse existing upload infra**: Uses the same `avatars` bucket + `profiles.avatar_url` update as the profile page, so the photo is immediately visible everywhere
4. **Platform-aware health sync**: Auto-detects iOS native vs web and shows the right provider (Apple Health vs Google Fit) rather than showing both
5. **No additional onboarding steps**: These screens appear after completion, so the progress bar still says 14/14 and the user feels "done" — these are bonus personalization screens, not more required questions

## Files to create/modify
- `src/components/onboarding/OnboardingProfilePhoto.tsx` — new
- `src/components/onboarding/OnboardingHealthSyncFull.tsx` — new
- `src/pages/Onboarding.tsx` — add post-completion overlay flow

