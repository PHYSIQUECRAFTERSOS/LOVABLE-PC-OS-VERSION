# Apple App Store Compliance Fix Plan

## Three Issues from Apple Review

### Issue 1: App Crash — Profile > "Take Photo" (Guideline 2.1a)

**Root cause**: The `AvatarUpload` component uses `<input type="file">` which triggers the iOS system picker. On iPadOS inside a Capacitor WKWebView, tapping "Take Photo" in the picker invokes the device camera. If the native iOS project lacks `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription` in `Info.plist`, iOS **kills the app immediately** — no error, just a crash.

Since this is a Capacitor app served via a remote URL (`capacitor.config.ts` points to the Lovable project URL), the iOS native shell still needs these entitlements. However, Lovable cannot modify native iOS project files (`Info.plist`).

**Fix approach — defensive web-side guard**:

1. Wrap the file input click in `AvatarUpload.tsx` with a `try/catch` and a permissions check using `navigator.permissions.query({ name: 'camera' })` (where supported)
2. On iOS/iPadOS, remove the implicit camera option by changing `accept="image/*"` to `accept="image/jpeg,image/png,image/webp,image/heic"` — this prevents the "Take Photo" option from appearing in the picker on some iOS versions
3. Add a global `ErrorBoundary` wrapper specifically around file-input-triggering components to catch any unhandled crash and show a recovery UI instead of a white screen
4. Apply the same defensive pattern to ALL other `<input type="file">` components that use `capture="environment"` (ProgressPhotoUpload, MealScanCapture, SupplementScanFlow) — remove the `capture="environment"` attribute since it forces camera-only mode which will crash without native permissions
5. **Critical**: Update `capacitor.config.ts` to include iOS-specific plugin configuration that signals the needed permissions (these get picked up during `npx cap sync`):

```text
// capacitor.config.ts addition
plugins: {
  Camera: {
    permissions: ['camera', 'photos']
  }
}
```

**Files to modify**:

- `src/components/profile/AvatarUpload.tsx` — wrap click in try/catch, guard accept types
- `src/components/biofeedback/ProgressPhotoUpload.tsx` — remove `capture="environment"`
- `src/components/nutrition/MealScanCapture.tsx` — remove `capture="environment"`
- `src/components/nutrition/SupplementScanFlow.tsx` — remove `capture="environment"`
- `capacitor.config.ts` — add iOS plugin permissions config

### Issue 2: Support URL (Guideline 1.5)

**Problem**: The Support URL in App Store Connect is `https://app.physiquecrafters.com/dashboard` which requires login and shows no support info.

**Fix**: Create a public `/support` page with:

- Contact email ([kevinwu@physiquecrafter.com](mailto:support@physiquecrafters.com) 
- FAQ section covering common questions
- No login required

**Files to create/modify**:

- `src/pages/Support.tsx` — new public page
- `src/App.tsx` — add `/support` route (public, not behind ProtectedRoute)

Then update the Support URL in App Store Connect to `https://app.physiquecrafters.com/support`.

### Issue 3: Business Model Questions (Guideline 2.1b)

This requires a written response to Apple, not code changes. Here's the recommended response template based on your app's architecture:

```text
1. Users: Coaching clients who have been invited by their fitness coach.
2. Purchase location: All purchases are made outside the app through the 
   Physique Crafters website (physiquecrafters.com) via Stripe. No purchases 
   occur within the app.
3. Accessible content: Clients access their pre-purchased coaching program 
   which includes workout tracking, nutrition logging, progress photos, and 
   messaging with their coach.
4. No paid content is unlocked within the app. The app is a companion tool 
   for an existing coaching relationship. All payments are processed externally.
5. Accounts are created via coach invitation only. Clients do not pay a fee 
   to create an account — they pay for their coaching program externally, and 
   the coach invites them to the app.
```

This positions your app as a "reader app" / "client access app" for externally purchased services, which is compliant with Apple's guidelines (similar to how Netflix, Kindle, etc. work).

---

## Summary of Code Changes


| File                                                 | Change                                              |
| ---------------------------------------------------- | --------------------------------------------------- |
| `src/components/profile/AvatarUpload.tsx`            | Try/catch around file click, defensive accept types |
| `src/components/biofeedback/ProgressPhotoUpload.tsx` | Remove `capture="environment"`                      |
| `src/components/nutrition/MealScanCapture.tsx`       | Remove `capture="environment"`                      |
| `src/components/nutrition/SupplementScanFlow.tsx`    | Remove `capture="environment"`                      |
| `capacitor.config.ts`                                | Add iOS permissions config                          |
| `src/pages/Support.tsx`                              | New public support/contact page                     |
| `src/App.tsx`                                        | Add `/support` route                                |
