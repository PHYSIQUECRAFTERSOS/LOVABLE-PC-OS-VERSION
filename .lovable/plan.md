

# Fix iOS Native Shell UI Issues

## Problem
The app is zoomed in on iOS native (Capacitor), content is cut off by the Dynamic Island, the hamburger menu is hard to find, and Apple reviewers can't locate Settings/Subscription.

## Changes

### 1. `index.html` — Fix viewport meta tag
Replace the current viewport meta with the exact tag requested:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
```

### 2. `src/components/AppLayout.tsx` — Bottom tab bar with Settings tab
The mobile bottom nav currently shows 5 tabs but does NOT include Settings for clients. Fix:

**Client bottom tabs** → change from `[Home, Calendar, Training, Nutrition, Messages]` to `[Home, Calendar, Training, Nutrition, Settings]`. This puts Settings (which contains Subscription) directly in the bottom tab bar — one tap away.

**Coach bottom tabs** → change from `[Overview, Clients, Messages, Community]` to `[Overview, Clients, Messages, Community, Settings]`. Same reasoning.

Also increase tap targets on the bottom nav icons (currently `pt-2 pb-1` is tight on iOS). Make icons `h-6 w-6` instead of `h-5 w-5` and increase vertical padding.

### 3. `src/components/AppLayout.tsx` — Safe area on root container
Add `safe-top safe-bottom safe-left safe-right` classes to the root container div so the entire app respects iOS safe areas. The mobile header already has `safe-top` and the bottom nav has `safe-bottom`, but the root wrapper should also enforce `safe-left` and `safe-right` for landscape/iPad.

### 4. `src/pages/Profile.tsx` — Subscription prominence
Already has `<SubscriptionCard />` at top and Legal section. No changes needed — it's correctly structured.

### 5. `src/pages/Subscribe.tsx` — Already has safe area classes
Already uses `safe-top safe-bottom` and `100dvh`. No changes needed.

### Summary of file changes
- **`index.html`** — viewport meta tag update (1 line)
- **`src/components/AppLayout.tsx`** — Add Settings to mobile bottom tabs for both client and coach, increase tap targets, add safe-area to root

