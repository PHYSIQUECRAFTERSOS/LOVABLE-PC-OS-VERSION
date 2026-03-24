

# Plan: Message Edit/Copy/Delete + Push Notification Fix

## Issue 1: Message Edit, Copy, Delete (Trainerize-style long-press)

### Problem
No edit/copy/delete functionality exists on messages.

### Solution
Add a context menu on each message bubble in `ThreadChatView.tsx`, `MessagingTab.tsx`, and `QuickMessageDialog.tsx` that provides Edit, Copy Text, and Delete options. On mobile, this triggers via long-press; on desktop via right-click.

### Database Changes (Migration)
```sql
-- Add edited_at column to track edits
ALTER TABLE thread_messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- Allow users to update their OWN messages (content + edited_at)
CREATE POLICY "Users can edit own messages"
  ON thread_messages FOR UPDATE
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

-- Allow users to delete their OWN messages
CREATE POLICY "Users can delete own messages"
  ON thread_messages FOR DELETE
  USING (sender_id = auth.uid());
```

Note: The existing UPDATE policy only checks thread participation but not sender ownership. The new policy restricts edits to only the sender's own messages.

### File: `src/components/messaging/MessageContextMenu.tsx` (new)

A reusable component wrapping each message bubble with a context menu (long-press on mobile, right-click on desktop):
- **Edit** (only on own messages with text content): Opens an inline edit mode — replaces the message bubble with an Input pre-filled with the message text. On save, updates `thread_messages.content` and sets `edited_at = now()`. On cancel, restores original.
- **Copy Text**: Uses `navigator.clipboard.writeText(msg.content)` and shows a toast "Copied to clipboard".
- **Delete** (only on own messages): Shows an AlertDialog confirmation "Delete this message? This cannot be undone." On confirm, deletes from `thread_messages`.
- Uses Radix `ContextMenu` for desktop right-click and adds `onTouchStart`/`onTouchEnd` with a 500ms hold timer for mobile long-press, opening the same menu as a Sheet/Drawer from bottom.

### File: `src/components/messaging/ThreadChatView.tsx` (modify)

- Wrap each message bubble (lines 250-291) with `MessageContextMenu`, passing message data, `isOwn`, and callbacks for edit/delete.
- Add state for `editingMessageId` and `editText` to handle inline editing mode.
- When editing: replace the message bubble content with an Input + Save/Cancel buttons.
- On save: `supabase.from("thread_messages").update({ content: editText, edited_at: new Date().toISOString() }).eq("id", msgId)`.
- Show "(edited)" label next to timestamp when `edited_at` is set.
- On delete: `supabase.from("thread_messages").delete().eq("id", msgId)` then remove from local state.
- Subscribe to DELETE events on the realtime channel to remove messages when the other user deletes.

### File: `src/components/messaging/MessagingTab.tsx` (modify)

Same pattern — wrap message bubbles with `MessageContextMenu`, add edit/delete handlers.

### File: `src/components/dashboard/QuickMessageDialog.tsx` (modify)

Same pattern — wrap message bubbles with `MessageContextMenu`, add edit/delete handlers.

## Issue 2: Push Notifications Not Working

### Root Cause
The `push_tokens` table is **empty** — zero tokens saved. The app loads via `server.url: 'https://app.physiquecrafters.com'` (remote URL), which means `Capacitor.isNativePlatform()` returns `false` in the web context. Push registration code never executes.

Your Xcode configuration is correct (bundle ID `com.physiquecrafters.app`, Remote notifications enabled, APNs credentials configured). The issue is purely in the JavaScript detection.

### Fix: `src/hooks/usePushNotifications.ts`

Replace the `isNative` check. Since the app runs as a remote URL inside a Capacitor WKWebView, `Capacitor.isNativePlatform()` may return false. Instead, detect native by checking if the PushNotifications plugin is actually available:

```typescript
// Instead of: const isNative = Capacitor.isNativePlatform();