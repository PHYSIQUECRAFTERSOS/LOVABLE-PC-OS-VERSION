# Show reset links as app.physiquecrafters.com

Yes. The email should already be doing this — the link in your screenshot fell back to the raw backend `/auth/v1/verify?...` URL, which also points at the old `lovableproject.com` preview address instead of your app.

## Why it fell back

The email builds an app-hosted link only when the auth payload contains a `token_hash` field. In this send it didn't, so the template printed the raw verify URL as-is. That raw URL still carries the same token (in its `token=` parameter) plus a `redirect_to` that points at the preview domain, which is why the visible link looks nothing like your brand.

## The fix

1. When `token_hash` is absent, pull the token out of the raw verify URL's `token` (or `token_hash`) query parameter and use that.
2. Always build the final link on the app's own domain: `https://app.physiquecrafters.com/reset-password?token_hash=...&type=recovery`. Ignore `redirect_to` when it points at a preview/lovableproject address so old preview URLs can never leak into emails.
3. If no token can be recovered at all, still route through the app domain rather than exposing the backend URL.
4. Redeploy the auth email handler and send a test reset to confirm both the button and the copy-paste link read `app.physiquecrafters.com`.

The reset page itself already accepts `token_hash` + `type=recovery` and verifies only on submit, so no page changes are needed.

## Technical details

- File: `supabase/functions/auth-email-hook/index.ts`, function `buildRecoveryUrl`.
- Token resolution order: `data.token_hash` -> `token_hash` param of `data.url` -> `token` param of `data.url`.
- Base origin: `data.redirect_to` origin only when it is not a `lovableproject.com` / preview host; otherwise the existing `APP_URL` constant (`https://app.physiquecrafters.com`).
- Deploy `auth-email-hook` after the change. No database, RLS, or frontend changes.
