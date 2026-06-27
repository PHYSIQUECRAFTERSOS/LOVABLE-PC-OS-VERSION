## Problem
On the website (non-Capacitor) version, new clients hit the Terms of Service step during onboarding, scroll to the bottom, and the "I Accept" button doesn't reliably appear/work — they can't move forward. The same flow works fine inside the native iOS/Android app.

Rather than chase the web-only scroll/acceptance bug, we'll require clients to use the native app to complete onboarding (which is your intended experience anyway).

## Solution: App Download Gate

Add a hard gate **right after the client accepts the invite / signs in** but **before** they reach the Terms of Service / onboarding flow. If they're on the browser (not inside Capacitor), they see a full-screen "Download the app to continue" wall with both store buttons. If they're already on the native app, nothing changes.

### Where the gate lives
A new component `RequireNativeApp.tsx` wrapped around the onboarding route in `src/App.tsx` (and `AcceptInvite` post-signup redirect). Detection uses `window.Capacitor?.isNativePlatform?.()` — same check already used in `PWAInstallPrompt.tsx`.

Gate triggers only for **clients who haven't completed onboarding**. Coaches/admins and already-onboarded clients are unaffected, so existing clients logging in on desktop to check messages aren't blocked.

### What the gate screen shows
Full-screen matte-black + gold panel (matches Physique Crafters aesthetic):
- PHYSIQUE CRAFTERS logo/wordmark
- Headline: "Finish setup in the app"
- Sub: "To complete your onboarding and sign your agreement, please download the Physique Crafters app."
- Two large buttons:
  - **App Store** → https://apps.apple.com/ca/app/physique-crafters/id6760598660
  - **Google Play** → https://play.google.com/store/apps/details?id=com.physiquecrafters.app.twa
- Smart device detection: iOS UA shows App Store first; Android UA shows Play first; desktop shows both side-by-side with a "Open on your phone" hint.
- Small "Sign out" link at the bottom so they can switch accounts if needed.
- No bypass / "continue on web" option — this is a hard gate, per your request.

### Files touched
1. **New:** `src/components/onboarding/RequireNativeApp.tsx` — the gate component (Capacitor check + UA detection + store buttons).
2. **Edit:** `src/App.tsx` — wrap the `/onboarding` route with `<RequireNativeApp>`.
3. **Edit:** `src/pages/AcceptInvite.tsx` — after successful invite acceptance on the web, route to onboarding (which the gate will then block with the download screen) instead of trying to run the web onboarding.
4. **Optional small touch:** add the two store badges as imported SVG/PNG assets in `src/assets/` for crisp rendering.

### Out of scope (intentionally)
- Not fixing the underlying web ToS scroll bug — the gate makes it unreachable on web.
- Not touching coach/admin login.
- Not touching the in-app onboarding flow itself (already works).

## Visual summary
```
Web user accepts invite → signs in → tries to load /onboarding
        ↓
RequireNativeApp checks Capacitor.isNativePlatform()
        ↓                                ↓
   native (app)                    browser (web)
        ↓                                ↓
   onboarding runs           ┌──────────────────────┐
                             │  Download the app    │
                             │  [ App Store ]       │
                             │  [ Google Play ]     │
                             │   Sign out           │
                             └──────────────────────┘
```

Confirm and I'll implement.