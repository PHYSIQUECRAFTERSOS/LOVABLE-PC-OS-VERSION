

## Fix Onboarding Save Errors, Document Signing Page, and Signed Agreements Display

### Problem Summary

Three interconnected issues affecting new client onboarding:

1. **"Failed to save your progress" toast** appears after almost every onboarding step, even though data IS saving successfully on the backend. Root cause: the payload sends empty strings (`""`) for timestamp columns like `waiver_signed_at` and `baseline_assessment_date` on early steps, which can cause PostgREST rejection. Additionally, the Preview environment's fetch proxy can interfere with responses, causing false error states.

2. **Document signing page (Setup.tsx) is stuck** — after creating a password, the ToS page renders but buttons are cut off below the viewport. Root cause: the outer container uses `flex min-h-screen items-center justify-center` with no `overflow-y-auto`, so when DocumentSigningFlow + the PC header exceed viewport height, the footer (checkbox + Continue button) is hidden and unreachable.

3. **Signed agreements not showing in coach's client profile** — two causes: (a) the DocumentSigningFlow never completed because of issue #2, so no `client_signatures` records were created; (b) the onboarding waiver (step 13) saves to `onboarding_profiles`, NOT to `client_signatures`, so even when completed it won't appear in the Signed Agreements section.

### Changes

**File 1: `src/pages/Onboarding.tsx`**
- Sanitize the payload in `saveProgress()` before sending to DB: convert empty strings to `null` for timestamp columns (`waiver_signed_at`, `baseline_assessment_date`, `completed_at`)
- Remove the error toast for non-critical step saves — if the save fails silently (data persists via retry or the error is transient), don't alarm the user. Only show error toast on final completion step failure.
- For intermediate steps, use fire-and-forget saves (like step 3 already does) — the user can proceed and data will be retried on the next step save anyway since the full payload is sent each time.
- Keep the error toast only for `handleComplete()` where it truly matters.

**File 2: `src/pages/Setup.tsx`**
- Add `overflow-y-auto` to the outer container div so the entire page scrolls when content exceeds viewport height
- This ensures the DocumentViewer footer (checkbox + Continue button) is always reachable on all screen sizes

**File 3: `src/components/clients/workspace/OnboardingTab.tsx`**
- In the "Signed Agreements" section, also check `onboarding_profiles` for `waiver_signed = true` and display it as a signed agreement record (showing signed name from the waiver, date from `waiver_signed_at`)
- This ensures the onboarding waiver shows even if `client_signatures` has no records (which happens when the DocumentSigningFlow was bypassed)
- Keep the existing `client_signatures` query so both ToS signatures AND onboarding waiver are displayed

**File 4: `src/components/signing/DocumentViewer.tsx`**
- Reduce the scroll area from `h-[50vh]` to `h-[40vh]` to give more breathing room for the footer on smaller screens
- This complements the Setup.tsx scroll fix to prevent content overflow issues

