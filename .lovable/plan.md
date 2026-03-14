

# Store OAuth Secrets and Deploy Edge Functions

## What needs to happen

You've provided all four credentials. I need to:

1. **Store 4 secrets** securely so your edge functions can access them:
   - `FITBIT_CLIENT_ID` → `23V6TZ`
   - `FITBIT_CLIENT_SECRET` → `1c2222ece8fcac053bb504d18b595b2f`
   - `GOOGLE_FIT_CLIENT_ID` → `992566955286-1h5v33ooa6c9p8gmo49abjrb3j3drqlg.apps.googleusercontent.com`
   - `GOOGLE_FIT_CLIENT_SECRET` → `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`

2. **Add edge function config** entries to `supabase/config.toml` for the 4 auth functions (fitbit-auth-start, fitbit-auth-callback, google-fit-auth-start, google-fit-auth-callback) with `verify_jwt = false`

3. **Deploy all edge functions** so they're live and ready

4. **Update the Fitbit redirect URI** — Your Fitbit app has `https://app.physiquecrafters.com` as the redirect URL, but the code sends `https://app.physiquecrafters.com/profile?oauth_provider=fitbit`. You need to update the Fitbit developer portal redirect URL to match: `https://app.physiquecrafters.com/profile?oauth_provider=fitbit`

## Google Cloud Console setup reminder

Make sure in Google Cloud Console → Credentials → your **Web application** OAuth client:
- **Authorized redirect URIs** includes:
  - `https://app.physiquecrafters.com/profile?oauth_provider=google_fit`
  - `https://physique-crafters-os.lovable.app/profile?oauth_provider=google_fit`

## Files to modify
- `supabase/config.toml` — Add 4 function entries

## No other code changes needed
The edge functions and frontend code are already built from the previous implementation. This is purely secrets + config + deployment.

