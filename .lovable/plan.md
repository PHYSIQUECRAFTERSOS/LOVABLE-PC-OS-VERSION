

# Fix: Hamburger Menu Safe Area + Messages Auto-Scroll to Newest

## Problem 1: Dynamic Island blocking "Dashboard" text
The hamburger Sheet menu (`SheetContent`) starts its content at `py-6` (24px) which is not enough on iPhone 16 Pro where the Dynamic Island / selfie camera notch extends ~59px into the content area. The nav items need to be pushed below the safe area.

## Problem 2: Messages don't scroll to newest
The chat loads messages in ascending order and calls `scrollToBottom()` via `useEffect([messages])`, but this fires before the DOM has fully rendered the message elements. The `behavior: "smooth"` animation can also fail on initial load. Need an immediate scroll on first load and a small delay to ensure DOM paint.

---

## Changes

### 1. Add safe-area top padding to hamburger Sheet (`AppLayout.tsx`)

**Line 252-253**: Add `pt-[env(safe-area-inset-top)]` to the nav container inside the Sheet, pushing all menu items below the Dynamic Island. Change from `py-6` to `pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-6` so there's always 24px *below* the safe area.

Also move the Sheet close button down by the same amount -- update the `SheetContent` className to include safe-area-aware top padding, or override the close button position.

### 2. Fix auto-scroll to newest messages (`ThreadChatView.tsx`)

**Line 71-73** (`scrollToBottom`): Use `requestAnimationFrame` + a small `setTimeout` to ensure DOM has painted before scrolling. On initial load, use `behavior: "auto"` (instant) instead of `"smooth"` so the user immediately sees the newest messages without a visible scroll animation.

**Line 221-223**: Track whether this is the initial load. On first render, scroll instantly; on subsequent message additions, scroll smoothly.

### Technical Details

```
// AppLayout.tsx - Sheet nav container
<div className="flex-1 px-3 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] pb-6 space-y-1 overflow-y-auto">

// ThreadChatView.tsx - improved scroll
const initialLoadRef = useRef(true);

const scrollToBottom = (instant = false) => {
  requestAnimationFrame(() => {
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ 
        behavior: instant ? "auto" : "smooth" 
      });
    }, 50);
  });
};

// After fetchMessages resolves:
fetchMessages().then(() => {
  scrollToBottom(true);  // instant on first load
  initialLoadRef.current = false;
  fetchReactions();
});

// On subsequent message changes:
useEffect(() => {
  if (!initialLoadRef.current) scrollToBottom(false);
}, [messages]);
```

