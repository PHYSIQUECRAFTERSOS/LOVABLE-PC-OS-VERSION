

# Fix Google OAuth Domain + Upgrade Legal Pages for API Compliance

## Problem 1: Google OAuth "Authorized Domains"

The field requires a **top private domain only** — not a full URL. You entered `physique-crafters-os.lovable.app/profile?oauth_provider=google_fit` which is invalid.

**Fix:** Enter one of these depending on which domain you're using:
- `lovable.app` (if using the Lovable preview/published URL)
- `physiquecrafters.com` (if using your custom domain `app.physiquecrafters.com`)

You likely need **both** added. The redirect URL (full path with query params) goes in a different field — under **Authorized redirect URIs** in the OAuth Client settings (not the Branding/Consent Screen page).

**No code changes needed** — this is a Google Cloud Console configuration fix.

## Problem 2: Terms of Service & Privacy Policy URLs

You already have these pages live and publicly accessible:
- **Terms:** `https://app.physiquecrafters.com/terms-of-service`  
- **Privacy:** `https://app.physiquecrafters.com/privacy-policy`

Use these URLs in both the Fitbit and Google developer consoles.

However, the current content is **too thin** for Fitbit and Google API compliance. Both platforms require specific disclosures about:
- What health data scopes you access and why
- How health data is stored, retained, and deleted
- That health data is never sold or used for advertising
- User's right to revoke access at any time
- Google's Limited Use Requirements (for Google Fit)
- Fitbit's API Terms of Service compliance

### Changes to Privacy Policy (`src/pages/PrivacyPolicy.tsx`)

Add these sections:
- **Health Device Integrations** — Explicit list of providers (Fitbit, Google Fit), data types accessed (steps, heart rate, sleep, activity), purpose, and that access is revocable anytime
- **Google API Limited Use Disclosure** — Required by Google: state that data obtained via Google APIs adheres to Google API Services User Data Policy, including Limited Use requirements
- **Fitbit API Disclosure** — Data accessed via Fitbit API is used solely for coaching purposes, never sold or shared for advertising
- **Data from Third-Party Health Services** — How tokens are stored, encrypted, auto-refreshed, and deleted on disconnect
- Update "Last Updated" date

### Changes to Terms of Service (`src/pages/TermsOfService.tsx`)

Add these sections:
- **Third-Party Health Integrations** — User authorizes the app to access health data from connected services; user can revoke at any time via Settings
- **Health Data Use Limitations** — Data is used only for coaching analytics, never for advertising, insurance, or lending decisions
- Update "Last Updated" date

### Implementation
- Edit `src/pages/PrivacyPolicy.tsx` — add 4 new sections with compliant language
- Edit `src/pages/TermsOfService.tsx` — add 2 new sections
- No database or backend changes needed

