

## Diagnosis

The "Unable to complete purchase" error is being thrown by the `handleSubscribe` catch block in `Subscribe.tsx` (line 135). The error from StoreKit native side reaches JS but doesn't match any of the specific error patterns (cancel, invalid, network, etc.), so it falls through to the generic "Please try again" message.

The root problem: **we have no visibility into what the actual StoreKit error is.** The `console.error` on line 122 logs it, but the native iOS app's WebView console isn't easily accessible. The toast only shows the generic message.

Additionally, there's a potential timing issue: the `getProducts` call uses a 5-second race timeout. If it times out but the screen still shows hardcoded prices, the user can tap "Subscribe Now" — and StoreKit may fail because the product wasn't properly fetched in the current session.

## Plan

### 1. Add diagnostic logging and show the actual StoreKit error to the user

**File: `src/pages/Subscribe.tsx`**
- In the catch block, include the actual native error message in the toast `description` so you can see exactly what StoreKit is reporting (e.g., "Purchase failed: No In-App Purchase product IDs were found", "StoreKit error domain=...", sandbox issues, etc.)
- Add `console.warn` with the full error object serialized (code, message, errorMessage) so it appears in future console log captures
- This alone will tell us if it's a product ID mismatch, a sandbox account issue, a missing agreement, or something else

### 2. Add a product availability gate before purchase

**File: `src/pages/Subscribe.tsx`**
- Track whether live products were successfully fetched from StoreKit (`productsLoaded` state)
- Before calling `StoreKit.purchase()`, if products were NOT loaded, attempt a fresh `getProducts` call first
- If that also fails, show a specific error: "Unable to connect to App Store. Please check your connection and try again."
- This prevents the case where `getProducts` timed out silently but the user can still tap Subscribe

### 3. Surface the native error code in the toast for immediate debugging

**File: `src/pages/Subscribe.tsx`**
- Change the default `description` from "Please try again." to include the actual error code/message from StoreKit, e.g.: `"Error: ${err?.message || err?.code || 'Unknown'}. Please try again or contact support."`
- This is critical for debugging since you can't access the native console — the toast IS your debugger right now

### 4. Bump service worker cache

**File: `public/sw.js`**
- Bump `CACHE_NAME` from `v6` to `v7` so the iPhone picks up these diagnostic changes immediately

### Technical detail

The Swift plugin code itself looks correct. The three most likely causes for the native StoreKit failure are:
1. **Sandbox account expired or needs re-authentication** — Apple sandbox accounts need periodic re-sign-in via Settings → App Store → Sandbox Account
2. **Missing "Paid Applications" agreement** in App Store Connect (must be active and not expired)
3. **Product ID state** — if the product was recently modified in App Store Connect, it may be in "Developer Action Needed" state

By surfacing the actual error message in the toast, you'll know immediately which of these is the cause and can fix it on the App Store Connect side if needed. No code-side fix will resolve an App Store Connect configuration issue, but the diagnostic visibility will.

