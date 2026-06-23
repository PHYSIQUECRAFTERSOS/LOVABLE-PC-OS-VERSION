## Goal
Make the client onboarding flow fully resumable. Every keystroke autosaves, the app survives being backgrounded or closed mid-step, and on return the client sees a clear "Resume where you left off" modal before being dropped back into their exact step (including a half-drawn signature).

## Current state (already in place — do not rebuild)
- `onboarding_profiles` table exists with every field, including `current_step`, `onboarding_completed`, and `waiver_signature` (text column).
- `ProtectedRoute` already hard-redirects clients to `/onboarding` until `onboarding_completed = true`. They cannot reach the app otherwise.
- `Onboarding.tsx` saves progress when the user clicks Next/Back and restores `current_step` + field values on mount.

## Gaps to fix
1. Saves only fire on Next/Back. If a client fills 3 fields on step 5 and closes the app, those 3 fields are lost.
2. `waiver_signature` is explicitly stripped from the save payload (`delete payload.waiver_signature` on line 239), so the drawn signature never persists.
3. No visible resume prompt — the client just silently lands back on their step with no acknowledgment that progress was restored.
4. No save on tab close / app background, so the last ~1.5s of typing can be lost.

## Plan

### 1. Field-level debounced autosave
In `src/pages/Onboarding.tsx`:
- Add a `useEffect` watching `data` + `step` that debounces ~1500ms and calls a new lightweight `autoSave()` (same upsert as `saveProgress` but never toasts, never blocks navigation, never sets the `saving` spinner).
- Skip the autosave during `initialLoading` to avoid overwriting freshly-loaded data with defaults.
- Keep the existing `saveProgress` call on Next/Back as a guaranteed checkpoint.

### 2. Save on background / close
- Add `visibilitychange` and `pagehide` listeners that call `autoSave()` synchronously-ish (fire-and-forget upsert). This covers: app backgrounded on iOS, tab closed, PWA swiped away.
- Already-pattern in the project per the "Data Loss Prevention" memory — reuse the same approach.

### 3. Persist the waiver signature
- Remove the `delete payload.waiver_signature` line so the drawn PNG data URL is saved like every other field.
- On resume, `OnboardingWaiver.tsx` already accepts `data.waiver_signature` via props; add a `useEffect` that, when a saved signature exists, redraws it onto the canvas so the client sees their prior signature and can keep or clear it.
- The Accept checkbox (`waiver_signed` + `waiver_signed_at`) already persists — no change needed.

### 4. Resume modal on app open
- On mount, after loading `onboarding_profiles`, if `current_step > 1` AND `onboarding_completed = false`, show a modal:
  - Title: "Welcome back, {firstName}"
  - Body: "You're on step {current_step} of 14 — {stepLabels[current_step]}. Your answers are saved. Pick up where you left off."
  - Primary button: "Resume" (closes modal, leaves them on their saved step)
  - Secondary button: "Start over" (resets to step 1 but keeps saved field data — does NOT delete the row; just `setStep(1)`)
- Show the modal once per session (track with `sessionStorage` key `onboarding_resume_shown_{userId}`) so it doesn't reappear on every internal route change.

### 5. No popup outside /onboarding needed
`ProtectedRoute` already force-redirects incomplete clients to `/onboarding`, so a global "finish onboarding" nag elsewhere in the app would never fire. The resume modal on the onboarding page itself satisfies the "make them realize they need to finish" requirement.

## Files touched
- `src/pages/Onboarding.tsx` — debounced autosave effect, visibility/pagehide listeners, resume modal, stop stripping `waiver_signature`.
- `src/components/onboarding/OnboardingWaiver.tsx` — restore saved signature onto canvas on mount.

## Out of scope
- No schema migration (all columns already exist).
- No changes to `ProtectedRoute` gating.
- No changes to step order, validation rules, or any other onboarding step content.
- No changes to coach/admin flows.
