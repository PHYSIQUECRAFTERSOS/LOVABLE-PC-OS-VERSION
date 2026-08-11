# Fix "Auth session missing!" on password reset

## First: the Google email is unrelated

The Google Developers notice is about an unused OAuth client in an old Google Cloud project (`norse-case-490223-g8`) that has been inactive 5+ months. Your app's login is email/password on Lovable Cloud — it does not use that Google OAuth client. No action needed on the app; if you don't use that Cloud project for anything, you can let it be deleted.

## What is actually happening to Nick

The reset page shows the "Create New Password" form and only fails at submit with "Auth session missing!". That means the page decided it was ready without a valid recovery session:

- `ResetPassword` marks itself ready if `getSession()` returns anything at all — including a stale/expired token left in the browser from being logged out. Submitting then fails because that session can't be used.
- The page also never handles the newer recovery link formats (`?code=` or `?token_hash=&type=recovery`). If the link arrives in that shape, nothing establishes a session, and a leftover stale session makes it look ready anyway.
- Opening the emailed link in a different browser than the one that requested it (e.g. mail app in-app browser vs Safari) also breaks the exchange.

Diagnosis note: the exact link shape Nick received is not confirmed from here; the fix below handles all three shapes rather than guessing.

## The fix

1. Rewrite the readiness logic in the reset page:
   - Read `token_hash` + `type=recovery` from the query string and call `verifyOtp` to mint a real recovery session.
   - Read `code` from the query string and call `exchangeCodeForSession`.
   - Keep supporting hash-fragment tokens (`access_token`/`refresh_token`) via `setSession`.
   - Only after one of those succeeds (or a genuine `PASSWORD_RECOVERY` event fires) show the form.
2. Before attempting the exchange, clear any stale local auth state so an old expired token can never make the page look ready.
3. If no recovery credential is present or the exchange fails, show the "Reset Link Expired" state with a "Request New Link" button instead of a form that will fail on submit.
4. On submit, if `updateUser` still returns a session error, show an actionable message ("Open the reset link again from your email in the same browser") rather than the raw Supabase error.
5. Add a short note on the reset-request confirmation screen telling users to open the link in their normal browser and not to reuse an old email.

## Immediate unblock for Nick

While the fix ships, from the Users area of the backend you can send Nick a fresh recovery link, or set a temporary password for him directly and have him change it in Settings.

## Technical details

- Files touched: `src/pages/ResetPassword.tsx` (main change), `src/pages/ForgotPassword.tsx` (guidance copy only).
- Uses `supabase.auth.verifyOtp({ type: 'recovery', token_hash })`, `exchangeCodeForSession`, and `setSession`, with `clearLocalAuthState()` from `src/lib/authRecovery.ts` called first.
- No database, RLS, or edge function changes.
