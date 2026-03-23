

# Plan: Add "USD" Currency Designation to Subscription Page

## Problem
Canadian clients see prices like "$399.99" and assume CAD. When the Apple payment sheet appears with the converted (higher) CAD amount, it causes confusion and potential abandonment. Apple also expects pricing clarity.

## Recommended Approach
From an ASO/compliance perspective, the best placement is:

1. **Append "USD" to each plan's price display** — e.g., `$399.99 USD/month` instead of `$399.99/month`. This is the most impactful spot since it's the first thing users read per card.

2. **Add a small "All prices in USD" note** under the "Choose Your Plan" subtitle — a single line of muted text acting as a blanket disclosure before users even read the cards.

3. **Update the bottom disclaimer** to include "All prices are listed in USD" at the start.

This three-layer approach (global note, per-card price, disclaimer) is standard for Apple-compliant apps serving multi-currency markets. It won't conflict with the live StoreKit pricing fetch — when StoreKit returns localized prices, those will override the defaults and show the user's local currency automatically.

## Changes

### File: `src/pages/Subscribe.tsx`

**1. Update `DEFAULT_PLANS` prices to include "USD":**
- `"$399.99 USD/month"`, `"$299.99 USD/month"`, `"$174.99 USD/2 months"`

**2. Add subtitle note after "Choose Your Plan":**
- New `<p>` element: `"All prices in USD. Final price in your local currency will be shown at checkout."`

**3. Update bottom disclaimer** to start with:
- `"All prices are listed in USD."`

No logic, backend, or StoreKit changes needed — text-only updates to one file.

