## Phase 1 Audit Findings

### Client profile page
- **File**: `src/pages/ClientDetail.tsx`
- **Tab bar**: shadcn `Tabs` / `TabsList` / `TabsTrigger` (Radix Tabs primitive) — these render as `<button>` elements, NOT `<a>` anchors. Native middle-click / Cmd-click does NOT work today.
- **Routing strategy**: query param `?tab=<value>` driven by `useSearchParams`. Tabs include: `dash`, `checkins`, `onboarding`, `calendar`, `training`, `nutrition`, `mealplan`, `supps`, `plan`, `progress`, `messaging`.
- **URL examples**:
  - `/clients/<clientId>?tab=training`
  - `/clients/<clientId>?tab=checkins`
  - `/clients/<clientId>?tab=mealplan`
- The `dash` default tab can be reached without the query param.
- `VALID_TABS` set already enforces server-side parsing of `?tab=` on load, so deep-linking already works — perfect for "Open in new tab".

### Inline Messages tab (the cramped one)
- **File**: `src/components/clients/workspace/MessagingTab.tsx`
- Wraps `ThreadChatView` in a fixed-height (`500px`) `Card`. This causes the cramped feel inside the tab content area.

### Standalone Messages screen (visual reference)
- **File**: `src/pages/Messages.tsx` → renders `CoachMessaging` (`src/components/messaging/CoachMessaging.tsx`) which mounts the same `ThreadChatView`. Mobile uses a full-screen overlay; desktop uses a split pane.
- The shared chat component is already `ThreadChatView` — we will reuse it directly inside the new modal so messaging metadata, real-time, edit, attachments, voice memo, push notifications all keep working.

### Modal primitive
- **`src/components/ui/dialog.tsx`** (Radix `@radix-ui/react-dialog`) is the standard modal in the codebase — used for matching the dark theme, Escape-to-close, backdrop click, animated portal.

### Context menu primitive
- **`src/components/ui/context-menu.tsx`** already exists (Radix `@radix-ui/react-context-menu`). Built-in support for: cursor-positioned trigger, viewport-clamped placement, outside-click / Escape dismiss, scroll dismiss, dark-theme styled. **No need to hand-roll positioning.**

### Sidebar (out of scope, will not be touched)
- `src/components/AppLayout.tsx` already uses real `<Link>` anchors for sidebar nav, so middle/Cmd-click already works there. Confirmed unchanged.

---

## Implementation Plan

### Feature 1 — Right-click "Open in new tab" on client profile tabs
**File edited**: `src/pages/ClientDetail.tsx`

1. Import `ContextMenu`, `ContextMenuTrigger`, `ContextMenuContent`, `ContextMenuItem` from `@/components/ui/context-menu`, plus `ExternalLink` icon.
2. Detect touch devices (`'ontouchstart' in window` + `navigator.maxTouchPoints > 0`) once via `useMemo` to skip the wrapper on mobile (long-press will fall through to native behavior).
3. Build a small helper `buildTabUrl(tabValue)`:
   - `dash` → `/clients/<clientId>` (no `?tab=`)
   - everything else → `/clients/<clientId>?tab=<value>`
4. Wrap each `TabsTrigger` in a `ContextMenu` whose `ContextMenuContent` has one item: "Open in new tab" → `window.open(buildTabUrl(tab.value), '_blank', 'noopener,noreferrer')`.
5. On touch devices: render the bare `TabsTrigger` (no wrapper) so default browser behavior is preserved.
6. Right-clicking outside the tab bar continues to show the native browser menu (the wrapper only attaches `onContextMenu` to the trigger element).

Acceptance: Right-click any of the 11 tabs → custom dark menu with single "Open in new tab" option → opens deep-linked URL in new tab → loads directly into the requested section.

---

### Feature 2 — Messages tab opens as a full-screen vertical popup
**Files edited**:
- `src/pages/ClientDetail.tsx` — intercept `messaging` tab selection, open dialog instead of switching tabs
- **New file**: `src/components/clients/workspace/MessagesPopup.tsx` — Dialog wrapper around `ThreadChatView`

**Behavior**:
1. Track `previousTab` ref so closing the modal restores the user's previous tab (or `dash` if Messages was the entry point via URL).
2. `handleTabChange` change: if `val === "messaging"` → open popup, set query param `?messages=open` (preserve any existing `tab`), do NOT switch the active `Tabs` value. Otherwise normal behavior.
3. URL deep-link: on mount, if `?messages=open` present → open popup automatically. This makes "right-click Messages → Open in new tab" land on a new browser tab with the popup already open.
4. On close: remove `?messages=open`, restore previous tab (no-op since we never switched), do not leave Messages visually selected.

**`MessagesPopup.tsx`** structure:
- `Dialog` + `DialogContent` with custom classes:
  - Mobile (`<480px`): `inset-0 w-screen h-[100dvh] max-w-none rounded-none p-0` — full-screen takeover
  - Desktop: `max-w-[640px] h-[85vh] p-0` — centered vertical modal
- Header: avatar (UserAvatar) + client name + Radix close `X` button (already provided by `DialogContent`)
- Body: existing `ThreadChatView` (full real-time, edit, attachments, voice memo, push, read receipts — all preserved)
- Initializes/creates `message_threads` row using the same logic as `MessagingTab` so metadata behavior is identical
- Dark theme: matches existing dark Dialog (background `hsl(var(--background))`, border `hsl(var(--border))`, gold accent on send button via `bg-primary`)

**Inline `MessagingTab` content** is no longer rendered (the `messaging` `TabsContent` becomes empty / removed) — the modal fully replaces it.

Acceptance: Click Messages tab → vertical popup opens immediately with full conversation, scroll-to-bottom on open, send/edit/attach work, real-time updates flow, coach name/avatar correct, Escape/×/backdrop closes, mobile full-screen, desktop centered.

---

### Phase 4 Regression checks (manual verification after build)
- All 10 other tabs load identically
- Sidebar navigation unchanged (`AppLayout` not touched)
- Standalone `/messages` route unchanged (`Messages.tsx` and `CoachMessaging.tsx` not touched)
- Coach name/avatar in messages preserved (uses same `ThreadChatView`)
- No "Track Water" anywhere
- Mobile horizontal tab scroll preserved (`overflow-x-auto flex-nowrap` on `TabsList` untouched)
- Bookmarks to `/clients/<id>?tab=training` etc. still resolve correctly (no URL pattern change)

---

## Phase 5 Consultant Recommendations (flagged only — NOT implemented)
1. **Cmd/Ctrl+click & middle-click on tabs** — would require swapping `TabsTrigger` for an `<a>` anchor wrapper. Right-click already covers the primary workflow, so flagged as future enhancement.
2. **Keyboard shortcut `M`** to open Messages popup from anywhere on the client profile page.
3. **Unread message badge** on the Messages tab label (data exists in `message_threads.coach_last_seen_at` vs latest `thread_messages.created_at`).
4. **"Open all tabs for this client"** right-click on the client name header.
5. **Persist last-viewed tab per client** across sessions (localStorage keyed by `clientId`).

---

## Files touched (summary)
- `src/pages/ClientDetail.tsx` — wrap tabs in `ContextMenu`, intercept Messages tab to open popup, deep-link `?messages=open` support
- `src/components/clients/workspace/MessagesPopup.tsx` — **NEW** — Dialog-based vertical popup wrapping `ThreadChatView`
- `src/components/clients/workspace/MessagingTab.tsx` — left in place but no longer mounted (kept to avoid breaking any other importer; can be deleted in a follow-up if confirmed unused)

## Files explicitly NOT touched
- `src/components/AppLayout.tsx` (sidebar)
- `src/pages/Messages.tsx`, `src/components/messaging/CoachMessaging.tsx`, `src/components/messaging/ThreadChatView.tsx` (standalone Messages + shared chat component)
- Any RLS policy, Edge Function, or Supabase schema