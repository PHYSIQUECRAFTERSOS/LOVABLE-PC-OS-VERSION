

# Plan: Branded Invite Emails with App Store Download Prompts

## Summary

Replace the generic Supabase auth invite email with a custom branded HTML email sent via the Lovable Email API. The email includes the coach's name, a "Get Started" setup link, and prominent App Store + Google Play download buttons. After account setup on the `/setup` page, add a new "Download the App" step before redirecting to onboarding.

## Current Problem

The `send-client-invite` edge function uses `supabase.auth.admin.inviteUserByEmail()` which sends a plain, unbranded Supabase default email. No mention of the app, no download links, no branding. The `resend-client-invite` does the same. Clients have no idea they should download the native app.

## Architecture

```text
Coach sends invite
  → send-client-invite creates invite record
  → Sends branded HTML email via sendLovableEmail()
  → Email contains: setup link + App Store button + Google Play button
  → Client clicks setup link → /setup page
  → Creates password → Signs documents → NEW: "Download the App" screen
  → Then redirects to onboarding
```

## Changes

### 1. Edge Function: `supabase/functions/send-client-invite/index.ts`

- Import `sendLovableEmail` from `npm:@lovable.dev/email-js`
- Replace `supabase.auth.admin.inviteUserByEmail()` with:
  1. `supabase.auth.admin.createUser()` with `email_confirm: true` to pre-create the auth user (or handle "already registered")
  2. `sendLovableEmail()` with branded HTML
- The HTML email template includes:
  - Physique Crafters branding (dark background, gold accents)
  - Coach name: "{Coach Name} has invited you to join Physique Crafters"
  - "Get Started" button linking to `/setup?token=...`
  - App download section: "Download the App" with two buttons:
    - Apple App Store: `https://apps.apple.com/ca/app/physique-crafters/id6760598660`
    - Google Play: `https://play.google.com/store/apps/details?id=com.physiquecrafters.app.twa`
  - Footer with "If you didn't expect this, ignore this email"

### 2. Edge Function: `supabase/functions/resend-client-invite/index.ts`

- Same change: replace `inviteUserByEmail` with `sendLovableEmail()` using the same branded template
- Import `sendLovableEmail`
- Remove the "delete auth user and re-invite" workaround (no longer needed since we're not using the auth invite system)

### 3. Frontend: `src/pages/Setup.tsx`

- Add a new step `"download_app"` between `"signing"` and `"complete"`
- After signing is complete, show a branded screen:
  - "You're all set! Download the app to get started"
  - Large App Store and Google Play buttons (with official badge styling)
  - Device detection: if iOS show App Store prominently first, if Android show Google Play first
  - "Continue to Setup" button below to proceed to onboarding (for users already in the app or PWA)
- Uses `navigator.userAgent` to detect platform and highlight the relevant store

### 4. Frontend: `src/pages/AcceptInvite.tsx` (staff invite)

- Add the same download app prompt after account creation (optional — staff may not need the native app as urgently, but consistency is good)

## Email Template Design

```text
┌─────────────────────────────────────────┐
│  (dark bg #0a0a0a)                      │
│                                         │
│  PHYSIQUE CRAFTERS (gold accent)        │
│  THE TRIPLE O METHOD                    │
│                                         │
│  Hi {first_name},                       │
│                                         │
│  {coach_name} has invited you to join   │
│  Physique Crafters. Set up your         │
│  account to start your training.        │
│                                         │
│  ┌─────────────────────────────┐        │
│  │     Get Started             │ (gold) │
│  └─────────────────────────────┘        │
│                                         │
│  ─────────────────────────────          │
│                                         │
│  Download the App                       │
│                                         │
│  [App Store]  [Google Play]             │
│                                         │
│  This link expires in 7 days.           │
│  If you didn't expect this, ignore it.  │
└─────────────────────────────────────────┘
```

## Files to modify
- `supabase/functions/send-client-invite/index.ts` — replace auth invite with branded email via sendLovableEmail
- `supabase/functions/resend-client-invite/index.ts` — same branded email change
- `src/pages/Setup.tsx` — add "Download the App" step after signing

