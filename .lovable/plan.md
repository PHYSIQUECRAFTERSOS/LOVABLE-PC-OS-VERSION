# Legal Compliance Audit — Report and Fix Plan

No code changed yet. Findings from scanning the whole project:

| # | Item | Result | Where | One-line fix |
|---|---|---|---|---|
| 1 | Google Fonts | FOUND | `src/index.css` line 1 (Inter + Space Grotesk via fonts.googleapis.com) | Host the font files inside the app and remove the Google link |
| 2 | Tracking / session replay | NOT FOUND | No Hotjar, Clarity, GA, PostHog, etc. Only built-in performance timing, which records no typing | Nothing needed |
| 3 | Consent banner | NOT NEEDED | No third-party trackers to gate | Revisit only if a tracker is added |
| 4 | Age / birth date | FOUND (partial) | Birthday asked in onboarding (`OnboardingMetrics.tsx`); age calculated but no minimum enforced | Block under-18 (app is adults-only) with a polite message |
| 5 | Email | MOSTLY OK | Unsubscribe page + one-click List-Unsubscribe handler exist; emails are account/coaching emails, no newsletters found | Confirm a postal address appears in the email footer |
| 6 | Subscriptions | MOSTLY OK | Pricing/Subscribe show price, monthly, auto-renew, cancel terms. Pricing page still has a placeholder Stripe link and cancellation is "contact us" | Add clear "how to cancel" steps; remove placeholder link |
| 7 | User uploads | PARTIAL | Community posts have a Report button; terms page exists; no copyright takedown page | Add a short copyright takedown section to Terms |
| 8 | Legal pages | PARTIAL | Privacy + Terms pages exist, but not linked from the sign-in screen | Add Privacy/Terms links under sign-in and in onboarding waiver |

## Ranked by risk (highest first)
1. Google Fonts (Germany GDPR demand letters) — easy fix
2. Legal links missing from sign-in/sign-up
3. No minimum age block
4. Cancellation steps / placeholder payment link
5. Copyright takedown section
6. Email postal address check

## What I'll do if approved
- Self-host the two fonts (only the weights used), swap the import for local font rules, confirm zero Google font references remain.
- Add Privacy Policy and Terms links on the sign-in screen and next to the onboarding waiver.
- In onboarding, if the birthday shows under 18, stop with "Physique Crafters is for adults 18+" and don't save it.
- Pricing: replace the placeholder link and add a plain "How to cancel" line (App Store settings on iPhone, or message your coach / support email).
- Add a "Copyright & content reports" section to the Terms page with a contact email.
- Check the email template footer for a postal address; I'll need your business mailing address (a PO box is fine).

## Questions before building
- Minimum age: 18 (matches your audience) — correct?
- Business postal address for email footers?
