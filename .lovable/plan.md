

# Subscription Flow for Physique Crafters iOS App

## Overview

Create a full Apple-compliant subscription flow: a premium Paywall page, a success overlay, subscription status management in Settings, and a global subscription context — all communicating with the native StoreKit plugin via Capacitor's bridge.

## New Files

### 1. `src/pages/Subscribe.tsx` — Paywall Page
- Full-screen page (no AppLayout wrapper) with dark background
- Header: "PHYSIQUE" white + "CRAFTERS" gold, subtitle "Choose Your Plan"
- Three selectable plan cards with gold borders, checkmarks, and pricing
  - Weekly Updates ($399.99/mo) — default selected, "MOST POPULAR" badge
  - Bi-Weekly Updates ($299.99/mo)
  - Training Only ($174.99/2mo)
- "Subscribe Now" button calls `window.Capacitor.Plugins.StoreKit.showPaywall()` on iOS, shows web fallback message otherwise
- "Restore Purchases" link calls `StoreKit.restorePurchases()`
- Apple-required legal text + links to existing Terms/Privacy pages
- On success: shows the SuccessOverlay component

### 2. `src/components/subscription/SuccessOverlay.tsx`
- Full-screen semi-transparent overlay with centered card
- Animated gold checkmark (CSS scale-in with bounce)
- Staggered fade-in: checkmark → title/subtitle → feature list → button
- "Welcome to Physique Crafters!" title, plan name in subtitle
- Feature bullets: training, meal plans, messaging, progress tracking
- Gold "Get Started" button → navigates to `/dashboard`

### 3. `src/components/subscription/SubscriptionCard.tsx`
- Used on the Settings/Profile page
- Checks subscription status via StoreKit on mount (falls back to localStorage)
- **Active state**: shows plan name + green "Active" badge, renewal info, "Manage Subscription" button (opens Apple subscription management URL)
- **Inactive state**: "Subscribe to unlock all features" + gold "Subscribe" button → navigates to `/subscribe`
- "Restore Purchases" text link in both states

### 4. `src/hooks/useSubscription.ts` — Global Subscription Context
- Provides `{ isSubscribed, tier, loading, checkSubscription, restorePurchases }` via React context
- On mount: checks `window.Capacitor.Plugins.StoreKit.checkSubscription()`, falls back to localStorage
- Listens for `subscriptionUpdate` custom events from native side
- Tier map: `com.physiquecrafters.app.monthly` → "Weekly Updates", etc.
- Persists to localStorage as cache; native StoreKit is source of truth

## Modified Files

### 5. `src/App.tsx`
- Import `Subscribe` page and `SubscriptionProvider`
- Add route: `<Route path="/subscribe" element={<ProtectedRoute><Subscribe /></ProtectedRoute>} />`
- Wrap app in `<SubscriptionProvider>`

### 6. `src/pages/Profile.tsx`
- Import and render `<SubscriptionCard />` at the top of the "profile" tab content, above "Your Information"

### 7. `src/components/AppLayout.tsx`
- Add global `subscriptionUpdate` event listener setup (in useEffect)
- No visual changes needed; the listener updates the context

## Technical Notes

- StoreKit detection: `const isCapacitor = !!(window.Capacitor?.Plugins?.StoreKit)`
- TypeScript: add `Capacitor` to `Window` interface in a `.d.ts` or inline declaration
- No database tables needed — subscription state is managed by Apple/StoreKit, cached in localStorage
- The paywall page is NOT gated behind subscription (obviously) — it's the entry point
- Features are NOT hard-gated behind subscription (per Apple review guidelines) — the card in Settings is informational, and coaches can still manage clients freely

## User Flow
```text
Settings → Subscription Card → "Subscribe" button
  → /subscribe (Paywall page)
  → Tap plan card to select
  → "Subscribe Now" → Native StoreKit sheet
  → Payment completes → Success Overlay
  → "Get Started" → /dashboard
  
Settings shows "Active" badge + "Manage Subscription"
```

