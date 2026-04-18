
The user wants the client-profile Messages tab (inside Clients → [client] → Messages) to scroll-to-bottom on open, exactly like the main Messages tab does. The main Messages tab uses `ThreadChatView.tsx`, which already has the working scroll-to-bottom logic (useLayoutEffect + ResizeObserver grace window from the previous fix).

The client-profile Messages tab is `src/components/clients/workspace/MessagingTab.tsx` — it has its own custom render of messages and its own scroll logic, which is missing the fixes that landed in `ThreadChatView`. That's why it opens scrolled up.

The cleanest fix per project rules ("Do not recreate existing components. Reuse the thread rendering component that both tabs already use if one exists.") is to make the client-profile tab render via `ThreadChatView` — the same component the main Messages tab uses. This guarantees identical behavior: scroll, real-time, attachments, reactions, edit/delete, read receipts, link previews — all unified.

Let me confirm by reading both files.
<lov-tool-use id="toolu_vrtx_012B7CicWhyMCwPFoDPAHsx1" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/clients/workspace/MessagingTab.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01Ws1Y1rKUEEdaSySC89g6z6" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/clients/workspace/MessagingTab.tsx\"}">
</lov-tool-use>
Now I have a clear picture. The client-profile MessagingTab is a parallel re-implementation of ThreadChatView, and it has bad scroll logic (`scrollIntoView({ behavior: "smooth" })` with a 100ms timeout — same broken pattern that was fixed in the main ThreadChatView). The fix is to replace the body of this tab with the actual `ThreadChatView` (the source of truth) so it inherits all the fixed scroll, pagination, attachments, reactions, and read-receipt behavior.

<lov-plan>

## Problem

The client-profile Messages tab (`src/components/clients/workspace/MessagingTab.tsx`) is a parallel re-implementation of the chat UI. It has its own scroll logic — `setTimeout(scrollIntoView({ behavior: "smooth" }), 100)` — which is the broken pattern we already fixed weeks ago in `ThreadChatView.tsx` (the source of truth used by the main Messages tab on left sidebar / bottom nav).

Because it's a duplicate implementation, it does NOT benefit from any of the prior fixes:
- The `useLayoutEffect` synchronous initial scroll
- The `ResizeObserver` grace window that re-pins to bottom when async images load
- The user-scroll detection that preserves history reading

Result: when a coach opens a client profile → Messages tab, the thread loads scrolled up, exactly as shown in the screenshots.

## Root cause

Two separate components rendering the same thread, with divergent (and inferior) scroll logic in the workspace tab. The earlier `.limit(50)` fix removed the missing-messages bug, but the duplicated scroll logic remains broken.

## Fix (single source of truth)

Replace the body of `MessagingTab.tsx` so it delegates to `ThreadChatView` — the same component the main Messages tab uses. The tab still owns:
- Resolving `clientId` → `threadId` (creating the thread row if none exists)
- Fetching the client's display name + avatar for the header
- Showing a skeleton while resolving

Once `threadId` is ready, render `<ThreadChatView threadId={...} otherUserName={clientName} otherUserAvatar={clientAvatar} />` inside the existing Card shell (height 500px).

This automatically gives the workspace tab:
- The correct initial scroll-to-bottom (useLayoutEffect + ResizeObserver grace window)
- Identical message rendering, reactions, attachments, voice messages, link previews
- Identical read-receipt + unread-badge behavior
- Identical realtime sync (already works through the shared `thread_messages` table)
- Bidirectional sync with the main Messages tab (same source, same channel pattern)

## Files modified

- `src/components/clients/workspace/MessagingTab.tsx` — strip the duplicate UI (~240 lines of message rendering, scroll, send, realtime, reactions) and replace with `ThreadChatView`. Keep the thread-resolution + skeleton logic.

## Files NOT touched

- `src/components/messaging/ThreadChatView.tsx` — source of truth, untouched
- Main Messages tab (`CoachMessaging`, `CoachThreadList`) — untouched
- Composer, attachments, reactions, scroll logic — all inherited from `ThreadChatView`
- Database, RLS, schema — no changes

## Acceptance

- Open Clients → any client → Messages tab: thread opens with newest message pinned at bottom (matches main Messages tab behavior).
- Send from workspace tab → appears in main Messages tab in real time, and vice versa.
- Image-heavy threads (e.g. Scott Szeto) re-pin to bottom after attachments load.
- Mobile (375px) and desktop (839px viewport) both work.
- Unread badge + scroll fixes from prior rounds remain intact.

