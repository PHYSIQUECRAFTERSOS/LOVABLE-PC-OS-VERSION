

# Plan: Push Notifications System (APNs) with Badge Counts

## Summary

Implement native iOS push notifications using Capacitor's Push Notifications plugin + a backend edge function that sends notifications via APNs. Clients and coaches receive real-time push alerts for new messages and check-in reminders, with app icon badge counts showing unread messages. Users can toggle notifications off in Settings to comply with Apple guidelines.

## Architecture

```text
Coach sends message → thread_messages INSERT
  → DB trigger enqueues notification
  → Edge function "send-push-notification" reads queue
  → Calls APNs with device token + payload (alert + badge count)
  → Client's iPhone shows banner + badge on app icon

Client opens app → badge resets via thread "seen" logic
```

## APNs Setup Guide (for you)

You'll need to do these steps in your Apple Developer account:

1. Go to **Certificates, Identifiers & Profiles** → **Keys**
2. Create a new key, enable **Apple Push Notifications service (APNs)**
3. Download the `.p8` file (save it — only downloadable once)
4. Note the **Key ID** (10-char alphanumeric)
5. Note your **Team ID** (top-right of developer console)
6. Your **Bundle ID** is `com.physiquecrafters.app`

Once you have those, I'll store the APNs auth key as a secret in your backend.

## Database Changes

### New table: `push_tokens`
```sql
CREATE TABLE push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  token text NOT NULL,
  platform text NOT NULL DEFAULT 'ios',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, token)
);
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
-- Users can manage their own tokens
CREATE POLICY "Users manage own tokens" ON push_tokens
  FOR ALL TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

### New table: `notification_preferences`
```sql
CREATE TABLE notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  messages_enabled boolean DEFAULT true,
  checkin_reminders_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own prefs" ON notification_preferences
  FOR ALL TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

## New Files

### `src/hooks/usePushNotifications.ts`
- On app mount (native only), register for push via `@capacitor/push-notifications`
- `PushNotifications.requestPermissions()` → `PushNotifications.register()`
- On `registration` event, upsert token to `push_tokens` table
- On `pushNotificationReceived` (foreground), show in-app toast
- On `pushNotificationActionPerformed` (tap), navigate to `/messages`
- Handle badge reset when opening messages

### `src/components/settings/NotificationSettings.tsx`
- Toggle switches: "Coach Messages", "Check-in Reminders"
- Reads/writes `notification_preferences` table
- "Disable All" option that also calls `PushNotifications.removeAllDeliveredNotifications()`
- Apple compliance: explain what notifications do, respect user choice

### `supabase/functions/send-push-notification/index.ts`
- Accepts `{ user_id, title, body, badge_count, data }` 
- Looks up user's `push_tokens` and `notification_preferences`
- If notifications disabled for that type, skip
- Constructs APNs JWT using stored `.p8` key
- Sends HTTP/2 request to `api.push.apple.com` with payload including `badge` count
- Badge count = count of unread `thread_messages` where `read_at IS NULL` and `sender_id != user_id`

### `ios-plugin/README.md` update
- Add instructions for enabling Push Notifications capability in Xcode

## Modified Files

### `capacitor.config.ts`
Add PushNotifications plugin config:
```typescript
plugins: {
  Camera: { permissions: ['camera', 'photos'] },
  PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
}
```

### `src/pages/Profile.tsx`
- Add `<NotificationSettings />` component below HealthIntegrations in the Settings page

### `src/components/messaging/ThreadChatView.tsx`
- After marking thread as seen, call `PushNotifications.removeAllDeliveredNotifications()` on native to clear badge

### `src/components/clients/workspace/MessagingTab.tsx`
- After inserting a new coach message, invoke `send-push-notification` edge function targeting the client

### `src/components/messaging/CoachMessaging.tsx` / `ClientMessaging.tsx`
- On message send, trigger push notification to the other party

### `src/App.tsx`
- Initialize `usePushNotifications()` hook at app root level (inside auth provider, only on native)

## Badge Count Logic

When sending a push, the edge function calculates the badge number:
```sql
SELECT COUNT(*) FROM thread_messages tm
JOIN message_threads mt ON mt.id = tm.thread_id
WHERE (mt.client_id = $user_id OR mt.coach_id = $user_id)
  AND tm.sender_id != $user_id
  AND tm.read_at IS NULL
```

This number goes in the APNs `badge` field, making the app icon show the exact unread count — just like iMessage.

## Xcode Setup Required (after implementation)

After I make the code changes, you'll need to:
1. `git pull` + `npx cap sync`
2. Open Xcode → your target → **Signing & Capabilities** → **+ Capability** → **Push Notifications**
3. Also add **Background Modes** → check **Remote notifications**
4. The `.p8` key details get stored as backend secrets

## Files to modify
- Database migration — create `push_tokens` and `notification_preferences` tables
- `capacitor.config.ts` — add PushNotifications plugin config
- `src/hooks/usePushNotifications.ts` — new file, registration + handling
- `src/components/settings/NotificationSettings.tsx` — new file, toggle UI
- `supabase/functions/send-push-notification/index.ts` — new edge function
- `src/pages/Profile.tsx` — add NotificationSettings
- `src/App.tsx` — initialize push hook
- `src/components/messaging/ThreadChatView.tsx` — clear badge on open
- `src/components/clients/workspace/MessagingTab.tsx` — trigger push on send

