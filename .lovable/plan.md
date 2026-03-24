

# Plan: Full-Screen Messaging with Transition Animation

## What We're Fixing

1. **Messages page is compressed** — wrapped inside AppLayout with header, bottom nav, and padding eating into chat space. Message bubbles capped at `max-w-[70%]` making them narrow and vertically stacked.
2. **No visual transition** when navigating to Messages tab.

## Design Direction (Trainerize Reference)

The Trainerize screenshot shows: full-screen chat, no bottom nav visible, back arrow top-left, wide message bubbles that use most of the screen width. Messages flow naturally without feeling cramped.

## Changes

### 1. Messages page goes full-screen (no AppLayout wrapper)

**File: `src/pages/Messages.tsx`**

Remove the `<AppLayout>` wrapper entirely. Instead render a full-screen container with:
- A header bar: back arrow (top-left, navigates to `/dashboard`), centered title "Messages", settings gear (top-right)
- Safe area insets for iOS (`safe-top`, `safe-bottom`)
- The chat content fills the remaining viewport height
- For coaches: keep the Conversations/Automations tabs but in the full-screen layout
- Apply a `animate-fade-in` entrance animation on mount

### 2. Widen message bubbles in ThreadChatView

**File: `src/components/messaging/ThreadChatView.tsx`**

- Change `max-w-[70%]` to `max-w-[85%]` on message bubbles — gives more horizontal room, fewer line breaks, matches Trainerize's wider bubbles
- Make the back arrow always visible (remove `md:hidden` class) since Messages is now full-screen on all viewports
- Ensure the input area respects `safe-bottom` for iOS home indicator

### 3. Client messaging — remove border/rounded wrapper

**File: `src/components/messaging/ClientMessaging.tsx`**

Remove the `rounded-lg border border-border bg