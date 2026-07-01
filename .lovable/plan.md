## What's actually happening on Samsung phones

The app that's live on the Google Play Store is `com.physiquecrafters.app.twa` — a **Trusted Web Activity (TWA)**. A TWA is a thin Android wrapper that loads `app.physiquecrafters.com` inside Chrome under the hood. That's fine *only if* Android can verify the app owns the domain via a Digital Asset Links file. Right now:

1. `public/.well-known/assetlinks.json` does not exist in the codebase, so Android cannot verify the TWA ↔ domain link.
2. Because verification fails, Android opens the TWA in a Chrome Custom Tab with the URL bar visible ("physiquecrafters.com" + lock icon — exactly what's in the client's screenshot #3). It looks and behaves like the website.
3. Because it's essentially Chrome, Samsung Pass hooks the password field and prompts for a fingerprint — the loop the client is stuck in.
4. Because App Links aren't verified, tapping the invite email link on Samsung does NOT route to the installed TWA; it opens a normal browser tab. So even after installing, the invite link keeps landing them "on the website".
5. Separately, our `RequireNativeApp` gate only recognizes Capacitor (`Capacitor.isNativePlatform()`). A TWA is not Capacitor, so Android users who ARE inside the installed app still get told to "Finish setup in the app" — reinforcing the loop.

iOS is unaffected: iOS uses the real Capacitor native app (`com.physiquecrafters.app`), Universal Links work, and no Samsung Pass exists.

## The fix (Android-only, iOS untouched)

### 1. Ship `assetlinks.json` for the TWA

Create `public/.well-known/assetlinks.json` listing the Play Store TWA package. This single file:
- Removes the Chrome URL bar inside the TWA (true full-screen "native app" feel).
- Enables Android App Links so the invite email URL opens directly in the installed TWA instead of a browser tab.
- Stops Samsung Pass from treating the sign-in as a browser autofill (Samsung Pass hooks Chrome, not verified TWAs).

Package + SHA-256 fingerprints to include:
- `com.physiquecrafters.app.twa` — production TWA (Play Console → App integrity → App signing key certificate SHA-256).
- `com.physiquecrafters.app` — future Capacitor native Android build, listed proactively so we can swap seamlessly.

Because the exact SHA-256 fingerprint from Play Console is a value only the user has access to, the plan is to scaffold the file with a `__REPLACE_WITH_PLAY_APP_SIGNING_SHA256__` placeholder and clear inline instructions on where to paste it. Once dropped in, the file is served at `https://app.physiquecrafters.com/.well-known/assetlinks.json` (Lovable static hosting handles this automatically).

### 2. Recognize the TWA as "the native app" in the onboarding gate

Update `src/components/onboarding/RequireNativeApp.tsx` to also treat a verified TWA session as native. Detection signals (any one is enough, persisted to `sessionStorage` because `document.referrer` is only set on first load):
- `document.referrer.startsWith('android-app://com.physiquecrafters.app.twa')`
- URL parameter `?utm_source=trusted_web_activity` (the TWA passes this by default)
- `window.matchMedia('(display-mode: standalone)').matches` AND Android UA (fallback)

When any signal fires, treat as native and render children — no more "Finish setup in the app" wall for Samsung users who are already in the app.

### 3. Nothing else changes

- iOS Capacitor detection path is untouched — `Capacitor.isNativePlatform()` still short-circuits first.
- Desktop and mobile web browsers still see the download gate.
- Invite email URL construction (`setupUrl`), Play Store link, and App Store link stay the same.
- No auth, RLS, or edge function changes.

## Files touched

- **New:** `public/.well-known/assetlinks.json` (with placeholder SHA-256 + instructions).
- **Edit:** `src/components/onboarding/RequireNativeApp.tsx` (add TWA detection alongside existing Capacitor check).

## What the user needs to do after I ship this

1. Open Google Play Console → **Release → Setup → App integrity → App signing key certificate**, copy the **SHA-256** fingerprint.
2. Paste it into `public/.well-known/assetlinks.json` (replacing the placeholder — I'll leave a comment showing exactly where).
3. Publish. Within a few minutes Android will re-verify the domain, the URL bar disappears inside the TWA, Samsung Pass stops hijacking sign-in, and invite email links open straight into the installed app.

No republish of the Android TWA app itself is needed — only the website file must exist.

## Technical notes

- Lovable static hosting serves `public/.well-known/*` at the site root with the required `Content-Type: application/json` — no server config needed.
- Android caches asset link verification aggressively; after the file is live, clients may need to reinstall the app once, or wait ~24h for Play Services to re-verify. We'll include this in the message back to the user.
- The TWA UA string contains `; wv)` and `Chrome/`; combined with `android-app://` referrer, false positives are essentially zero.
