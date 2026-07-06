# Messaging: Inactive Client Handling & Thread Archive Management

Match Trainerize behavior: no new messages fire to inactive clients, their threads are muted, and coaches can delete a thread archive with a double confirmation — but the underlying message history is preserved so re-opening a conversation with the same client restores everything.

## Definitions

An **inactive client** is any client where `coach_clients.status != 'active'` (i.e. `deactivated` or `pending`) OR who has been fully deleted from the app (no active `coach_clients` row and no profile / auth user).

## 1. Block outgoing messages to inactive clients

- In `ThreadChatView`, after loading the thread, look up the client's `coach_clients` row (or profile existence).
- If inactive/deleted:
  - Show a muted banner at the bottom of the chat: *"This client is inactive — messaging is disabled. Reactivate them from Clients to resume."*
  - Disable the composer (textarea, attachment button, voice recorder, send button).
  - Guard `handleSend` with an early-return + toast so send is impossible even if the UI is bypassed.
- Auto-messaging (`AutoMessagingManager`, broadcasts, triggers, tag automations) already filters `coach_clients.status = 'active'`. Add the same guard inside the message-send edge functions as a belt-and-suspenders check, so no automation can ever deliver to an inactive client.

## 2. Mute inactive threads in the coach thread list

- `CoachThreadList` fetches `coach_clients` for the coach and computes an `inactive` flag per thread.
- Inactive threads are moved to a collapsible **"Inactive"** section at the bottom of the list (collapsed by default, count badge shown).
- Inactive threads render greyed out, are excluded from unread-count badges, and do not surface push notifications or the app-badge count (client-side filter in the notification handler).
- Search still finds inactive threads.

## 3. Delete conversation thread archive (double confirm)

- Add a small **⋯** menu on each row in `CoachThreadList` and inside `ThreadChatView`'s header with a **Delete conversation** option.
- Tapping opens **AlertDialog #1**: *"Delete this conversation? It will be removed from your inbox."* → Continue / Cancel.
- Continue opens **AlertDialog #2** (typed confirmation): coach must type the client's first name to unlock the destructive red **Delete permanently** button.
- Delete behavior is a **soft-hide, not a hard delete**: sets a new `coach_hidden_at` timestamp on `message_threads` so the thread disappears from the coach's inbox but every `thread_messages` row is preserved. This satisfies the "messages save through when a new conversation is started with the same client" requirement.
- Client-side view (`ClientMessaging`) is unaffected — the client still sees the thread and their history.

## 4. Re-opening = restore, not recreate

- `message_threads` has a `UNIQUE(coach_id, client_id)` constraint, so a coach cannot create a duplicate thread with the same client.
- The **New Conversation** flow (`NewConversationDialog`) is updated: when the coach picks a client, we look up any existing thread (hidden or not). If found, we clear `coach_hidden_at`, mark it unread for the coach's view, and open it — all previous messages appear immediately.
- Only active clients are pickable in the new-conversation dialog (already the case; verified against `status = 'active'`).

## 5. Data & security

Additive migration on `message_threads`:
- New column `coach_hidden_at timestamptz null` (default null).
- New index on `(coach_id, coach_hidden_at)` for fast inbox filters.
- RLS unchanged — the column is coach-controlled and clients don't read it.
- No changes to `thread_messages` — history is preserved by design.

## 6. Files touched

- Migration: add `coach_hidden_at` on `message_threads` (+ index).
- `src/components/messaging/CoachThreadList.tsx` — active/inactive split, ⋯ menu, hidden filter.
- `src/components/messaging/ThreadChatView.tsx` — inactive banner, disabled composer, send guard, header menu with Delete flow.
- `src/components/messaging/NewConversationDialog.tsx` — reopen-existing-thread logic that unhides.
- `src/components/messaging/AutoMessagingManager.tsx` and any broadcast/trigger edge functions — enforce `status = 'active'` recipient filter.
- New small component `DeleteThreadDialog.tsx` — two-step AlertDialog with typed confirmation.

## Out of scope

- No hard delete of message rows (would break the "prior messages persist" requirement).
- No changes to the client-side messaging UI.
- No changes to the account-deletion flow itself; we just react to it correctly.
