

# Plan: Add Push Notifications Section to Privacy Policy

## Summary
Insert a new section "15. Push Notifications" into the Privacy Policy page, between "14. Contact" (which becomes section 15) and the current section 13. The new section will be numbered 14, and "Contact" will be renumbered to 15.

## Changes

### File: `src/pages/PrivacyPolicy.tsx`

Insert a new `<section>` block after section 13 (Health Data Token Storage) and before the Contact section. Renumber Contact from 14 → 15.

New section content:
- **14. Push Notifications** — includes the exact text provided about push tokens, their storage, usage limitations, no third-party sharing, and how to disable.

## Files to modify
- `src/pages/PrivacyPolicy.tsx` — add push notifications section, renumber Contact

