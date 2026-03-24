

# Plan: Push Notification Fixes, In-App Message Badge, and XP Toast Cleanup

## Issue 1: Push Notifications Analysis and Fixes

**Current state:** The push notification pipeline is correctly wired for messaging (both client→coach and coach→client via `ThreadChatView.tsx` and `MessagingTab.tsx`). APNs secrets are configured. However, there are two issues:

**Fix A — Bundle ID mismatch:** The edge function `send-push-notification` uses `com.physiquecrafters.app` as the APNs topic (line 169), but the Capacitor config uses `app.lovable.418c5cb36f9242439691d28363e319a3`. If your Xcode project uses `com.physiquecrafters.app` as the bundle ID (which it likely does since you published to the App Store), then the edge function is correct. No change needed there — but I need to confirm: **is your App Store bundle ID `com.physiquecrafters.app`?** If so, this is fine.

**Fix B — Check-in reminder push notifications don't exist:** Currently, no code sends push notifications when a check-in is due. The `evaluate-auto-messages` edge function handles automated messaging but doesn't trigger APNs push. We need to add a check-in reminder push trigger.

**File: `supabase/functions/evaluate-auto-messages/index.ts`**
- After inserting an auto-message into `thread_messages` for a `missed_checkin` trigger, also call the `send-push-notification` function internally to push to the client's device with `notification_type: "checkin"`.

**File: `src/components/checkin/WeeklyCheckinForm.tsx`** (or calendar event creation)
- When a check-in calendar event exists for today and is not completed, the dashboard already shows it. For a push reminder, we'd add a scheduled function or trigger in `evaluate-auto-messages` that fires for clients with a `checkin` event on today's date that is not yet completed.

## Issue 2: In-App Gold Message Badge on Bottom Nav

Currently the Messages tab in the bottom nav has no unread indicator. We'll add a gold dot badge (matching the app's gold/primary color with black text) similar to Trainerize.

**File: `src/components/AppLayout.tsx`**
- Add a new hook/state to track unread message count via Supabase realtime
- Subscribe to `thread_messages` changes to detect new unread messages
- For clients: count messages in their thread where `sender_id != user.id` and `read_at IS NULL`
- For coaches: count threads where `coach_last_seen_at` is older than the latest message
- Render a gold circular badge (bg-primary, text-black, font-bold) on the Messages icon in the bottom nav, showing the count number (or just a dot if you prefer)
- Subscribe to realtime `postgres_changes` on `thread_messages` to update badge count live

**Visual:** Gold circle (bg-primary = gold) with black text number, positioned at top-right of the Messages icon, exactly like Trainerize's red badge but gold instead.

## Issue 3: XP "+4 XP" Badge Lingering After Cardio Completion

The "+4 XP" chip visible in the screenshot comes from `MyRankDashboardCard`'s `animatingXP` state. The animation sequence is: enter (200ms) → fly (500ms) → done → clear at 1200ms. This should auto-clear, but if the component re-renders (e.g., from a query refetch after cardio completion), the `dashboardXPGain` state can re-trigger the animation.

**Fix A — File: `src/hooks/useXPAward.tsx`**
- The issue is that `clearDashboardXP()` is called inside the `useEffect` in `MyRankDashboardCard`, but if the component unmounts and remounts (tab switch), `dashboardXPGain` might still be set. Add an auto-clear timeout in the provider itself:
  - After setting `dashboardXPGain`, set a 3-second timeout to auto-clear it as a safety net
  - This ensures even if the card doesn't consume it, it clears

**Fix B — File: `src/components/dashboard/MyRankDashboardCard.tsx`**
- Add a guard: if `animatingXP` is set but `chipPhase` becomes "done", ensure `animatingXP` is nullified
- The `t3` timeout at 1200ms should be working but add a useEffect cleanup that clears `animatingXP` on unmount

**Fix C — File: `src/components/ranked/XPToast.tsx`**
- The XPToast already auto-dismisses at 1500ms. Increase stability by using a `useRef` for the `onDone` callback to avoid stale closure issues that could prevent cleanup.

## Files to Modify
1. `src/components/AppLayout.tsx` — add unread message badge (gold) to Messages nav item
2. `src/hooks/useXPAward.tsx` — add safety-net auto-clear for `dashboardXPGain`
3. `src/components/dashboard/MyRankDashboardCard.tsx` — fix animation cleanup
4. `supabase/functions/evaluate-auto-messages/index.ts` — add push notification call for check-in triggers

## Improvements
- **Badge sound on foreground notification:** The current foreground handler shows a toast but doesn't play a sound. Consider adding a subtle notification sound for in-app alerts.
- **Badge count accuracy:** The edge function calculates badge count from `thread_messages.read_at IS NULL`, but the client app uses `coach_last_seen_at` for coaches. Unifying this would make badge counts more accurate.
- **Realtime badge updates:** When a user opens Messages and reads messages, the badge should clear immediately via the realtime subscription.

