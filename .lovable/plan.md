

# Fix Bulk Messaging, Add Trigger/Template Edit/Delete, Recipient Checkboxes

## Problems Identified

1. **Bulk message RLS crash**: `BulkMessageComposer` writes to `conversations`/`messages` tables, but the app's messaging system uses `message_threads`/`thread_messages`. Even if RLS were fixed, messages wouldn't appear in coach/client inboxes. Must rewrite to use `message_threads` + `thread_messages`.

2. **No edit/delete for triggers or templates**: AutoMessagingManager only supports creating triggers and templates — no way to edit or delete them.

3. **Bulk message UI lacks individual client names**: Shows "4 clients" badge but not who they are. Need checkboxes per recipient.

4. **Trigger timing for missed workout/checkin**: The edge function currently checks "no workout in 2 days" / "no checkin in 8 days". Should fire 24 hours after the scheduled date, at 5 AM client local time.

---

## Plan

### 1. Fix Bulk Messaging — Rewrite to use `message_threads` + `thread_messages`

**File: `src/components/clients/BulkMessageComposer.tsx`**

- Remove all `conversations`, `conversation_participants`, `messages` table usage
- For each recipient: find existing `message_threads` row where `coach_id = user.id` and `client_id = recipient.id`; if none, create one
- Insert into `thread_messages` with `thread_id`, `sender_id = user.id`, `content = message`
- Remove "announcement/broadcast" delivery type (not supported by thread model) — keep only "Direct Message"
- Add `excludedIds: Set<string>` state for client deselection
- Show each recipient by name with a checkbox to exclude them
- Compute effective recipients as `recipients.filter(r => !excludedIds.has(r.id))`

### 2. Add Edit & Delete for Triggers and Templates

**File: `src/components/messaging/AutoMessagingManager.tsx`**

**Triggers:**
- Add `editingTriggerId` state. When editing, pre-fill the trigger form fields from the selected trigger
- Save mutation: if `editingTriggerId` is set, `.update()` instead of `.insert()`
- Add Trash2 icon button on each trigger card with confirmation via AlertDialog
- Delete mutation: `.delete().eq("id", triggerId)`

**Templates:**
- Add `editingTemplateId` state. When editing, pre-fill `tplName`, `tplContent`, `tplCategory`
- Save mutation: if `editingTemplateId`, `.update()` instead of `.insert()`
- Add Pencil and Trash2 icon buttons on each template card
- Delete mutation with AlertDialog confirmation

### 3. Update Trigger Timing Logic

**File: `supabase/functions/evaluate-auto-messages/index.ts`**

- For `missed_workout`: check if the client had a workout scheduled (via `calendar_events` where `event_type = 'workout'`) for yesterday (relative to client's timezone from `profiles.timezone`), and no `workout_sessions` completed for that date. Only fire if current time is past 5 AM in client's local timezone.
- For `missed_checkin`: check if a checkin was due yesterday (based on `calendar_events` or `checkin_schedules`) and no `weekly_checkins` submitted for that week. Fire at 5 AM client local time the next day.
- Fetch client timezone from `profiles.timezone`, default to "America/Los_Angeles" if not set.

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/clients/BulkMessageComposer.tsx` | Rewrite to use `message_threads`/`thread_messages`, add per-client checkboxes |
| `src/components/messaging/AutoMessagingManager.tsx` | Add edit/delete for triggers and templates with confirmation dialogs |
| `supabase/functions/evaluate-auto-messages/index.ts` | Update missed_workout/missed_checkin to fire 24h after schedule at 5 AM client local time |

