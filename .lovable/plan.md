

# Subscription Tier Update + Legal Pages Scroll Fix

## Changes Required

### 1. Update Subscription Tiers (3 → 2)

Remove Bi-Weekly and Training Only tiers. Add new "Inner Circle" tier at $997/month. Update "Weekly Updates" price from $399.99 to $499.99.

**New tiers:**
- **Inner Circle**: `com.physiquecrafters.app.innercircle` — $997 USD/month, 1 month auto-renewable. Features: Weekly 1-on-1 Zoom calls, everything in Weekly Updates, limited spots available.
- **Weekly Updates**: `com.physiquecrafters.app.monthly` (same product ID) — $499.99 USD/month, 1 month auto-renewable. Badge: MOST POPULAR. Features: Weekly progress updates, custom training program, custom meal plan, custom supplement plan.

**Files to modify:**

- **`src/pages/Subscribe.tsx`**: Replace `DEFAULT_PLANS` array with 2 new plans. Update disclaimer text at bottom to reflect new pricing. Default selected plan = `"innercircle"`.
- **`src/hooks/useSubscription.tsx`**: Update `TIER_MAP` — remove `biweekly` and `training` entries, add `innercircle` entry, update `monthly` label/price.
- **`src/components/subscription/SubscriptionCard.tsx`**: No structural changes needed — it reads from `TIER_MAP` dynamically.
- **`src/pages/Pricing.tsx`**: Replace 4 tiers with 2 matching tiers (Inner Circle + Weekly Updates).
- **`src/pages/TermsOfService.tsx`**: Update Section 7 payment terms to list only the 2 new tiers with correct prices.
- **`src/pages/PrivacyPolicy.tsx`**: No pricing references — no changes needed here for tiers.

**Native iOS (App Store Connect + Xcode):**
You will need to manually create the new product `com.physiquecrafters.app.innercircle` in App Store Connect (Subscriptions section) with price $997/month. Update the price of `com.physiquecrafters.app.monthly` to $499.99. Remove or deprecate `com.physiquecrafters.app.biweekly` and `com.physiquecrafters.app.training` from the subscription group.

The Swift `StoreKitPlugin.swift` does NOT hardcode product IDs — it receives them from JavaScript, so no Swift changes are needed.

### 2. Fix Terms of Service & Privacy Policy Scroll

**Root cause**: `index.css` applies `overflow: hidden; position: fixed;` to `html`, `body`, and `#root`. This locks the viewport. Pages like AppLayout have their own internal scroll containers (`overflow-y-auto`), but TermsOfService and PrivacyPolicy render as plain `min-h-screen` divs with no scroll container — so they cannot scroll.

**Fix in `src/pages/TermsOfService.tsx` and `src/pages/PrivacyPolicy.tsx`**:
- Change the outer `div` from `min-h-screen` to `h-full overflow-y-auto` so it becomes a scroll container within the fixed viewport.
- This matches how AppLayout handles scrolling and requires no global CSS changes.

### Summary of files to modify:
1. `src/pages/Subscribe.tsx` — new 2-tier plan data + updated disclaimer
2. `src/hooks/useSubscription.tsx` — updated TIER_MAP
3. `src/pages/Pricing.tsx` — new 2-tier layout
4. `src/pages/TermsOfService.tsx` — updated pricing in Section 7 + scroll fix
5. `src/pages/PrivacyPolicy.tsx` — scroll fix only

