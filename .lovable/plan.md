

## What you reported
- Bug only on **mobile Chrome web** (phone browser), logged in as coach
- Native iOS app works fine
- Desktop coach + client (mobile + desktop) work fine
- Lands ~10 days back instead of newest message

## Root cause (mobile-Chrome-specific)

Mobile Chrome's URL bar auto-collapses on first interaction. When it collapses, the viewport grows by ~60-100px, and the inner scroll container fires a synthetic `scroll` event because `clientHeight` and `scrollTop` geometry shift.

In `ThreadChatView.tsx`, the `onScroll` listener (line 289) sees `distFromBottom > 80` (because the viewport just grew) and sets `userScrolledAwayRef.current = true`. From that moment on, the ResizeObserver re-pin is **permanently disabled**, so when images/videos load asynchronously (which can take several seconds on a coach thread with lots of attachments), the user stays stranded mid-thread — exactly where the document was at the moment the address bar collapsed.

Native iOS Capacitor uses WKWebView with no collapsing URL bar → the synthetic scroll never fires → it works. Desktop Chrome has no URL bar collapse → works. Client mobile threads tend to have fewer images so the post-pin growth is small enough not to be noticeable.

## Fix (narrow, mobile-only)

In `src/components/messaging/ThreadChatView.tsx`, make the "user scrolled away" detection robust against browser-chrome resizes:

1. **Suppress the `userScrolledAwayRef` flag during the 2s grace window** if a `ResizeObserver` event was the immediate cause of the geometry change. Practically: track `lastResizeAt` from the ResizeObserver callback, and ignore `onScroll` events that fire within ~150ms of a resize event during the grace window.
2. **Require an upward-scroll delta**, not just "distance from bottom > 80." Track previous `scrollTop`. Only flip `userScrolledAwayRef = true` if `scrollTop` actually decreased (user scrolled UP), not if it stayed the same while `clientHeight` grew.
3. **Remove the `console.log` instrumentation** added in the previous round — fix is targeted enough that logs are no longer needed.

## Files modified
- `src/components/messaging/ThreadChatView.tsx` — only the scroll-tracking logic in the `useEffect` at lines ~285-319. No changes to fetch, render, send, or any UI.

## Files NOT touched
- `Messages.tsx`, `CoachMessaging.tsx`, `MessagingTab.tsx` — wrappers untouched
- Composer, attachments, reactions, message rendering — untouched
- Database, RLS, schema — no changes
- Native iOS code — untouched (it already works)

## Test plan (after fix)
- Open mobile Chrome on phone → log in as coach → tap any thread → confirm lands on newest message
- Try thread with many image attachments (Scott Szeto) → confirm still lands at bottom after images load
- Verify desktop coach, client mobile, client desktop still work (no regression)
- Verify "scroll up to read history" still works (manual upward swipe should still pause auto-pin)
- Verify "auto-scroll on incoming message when at bottom" still works

## If this fix doesn't land
Per the failure-mode protocol from the previous round: revert, then capture remote inspector logs from mobile Chrome before any further attempt.

