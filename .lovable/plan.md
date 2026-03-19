

# Apple App Store Compliance Fix Plan

Two rejection issues to resolve: **Guideline 3.1.1** (In-App Purchase) and **Guideline 2.1(a)** (iPad crash on "Take Photo" in Settings).

---

## Issue 1: Guideline 3.1.1 — Business Payments

**Problem**: Apple says the app accesses paid coaching content but doesn't offer a way to purchase it in-app.

**Solution**: Since your app is on the US storefront, Apple explicitly allows linking out to external payment. We will add a **"Programs & Pricing"** page accessible from both the public landing page and the in-app navigation (for both clients and coaches). This page will display your coaching tiers with descriptions and link each to your external Stripe payment page.

### What gets built:

- **New page: `src/pages/Pricing.tsx`** — A clean pricing/programs page showing your coaching