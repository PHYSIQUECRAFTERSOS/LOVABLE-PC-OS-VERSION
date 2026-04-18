
The user is reporting that despite multiple fix attempts (Round 1, 2, 3), the messages thread still does NOT open scrolled to the bottom. Both client and coach sides are still broken, with coach being significantly worse (opens 3 days behind on Apr 15 when today is Apr 18).

Per the failure-mode instructions in Round 3, since the Option A fix (gating mount on metadata + useLayoutEffect) did NOT resolve the bug, I should:
1. Acknowledge the hypothesis was wrong/incomplete
2. NOT apply another guessed fix
3. Revert to instrumentation approach OR find the real root cause through deeper investigation

Let me look at the current state of the code to understand what's actually happening before proposing anything.

Key suspects to investigate:
- ThreadChatView.tsx — current scroll logic
- The container that scrolls — is the `useLayoutEffect` running against the right ref?
- Are images/attachments loading async and shifting layout AFTER the layoutEffect fires?
- Is the parent container (`CoachMessaging` / `ClientMessaging` / `Messages` page) using flex layouts that resize after mount?
- Mobile-specific: keyboard avoidance, safe-area, dynamic viewport

Looking at screenshot 1 (client view, Kevin Wu thread): opens scrolled with newest message ("yoo Kevin (Client) check in's are overdue...") partially cut off at bottom — close to bottom but not pinned.

Screenshot 2 (coach view, Scott Szeto): opens on Apr 15 with empty/loading image attachment visible — this is a HUGE clue. The empty gray box at the bottom is an IMAGE that hasn't loaded yet. When it loads, it pushes content DOWN, but scroll has already been set, so user appears WAY above the new bottom.

This is almost certainly an **image-loading layout shift** issue, not a metadata issue. The Round 3 hypothesis (CoachMessaging metadata) was wrong — or at least incomplete. The real culprit appears to be:

1. `useLayoutEffect` fires BEFORE images load → scrollTop = scrollHeight (correct AT THAT MOMENT)
2. Images then load asynchronously (especially the most recent attachment) → scrollHeight grows
3. `scrollTop` stays where it was, so user is now ABOVE the real bottom
4. Coach side has MORE/larger image attachments in recent messages → bug appears worse

The fact that coach screenshot shows a half-loaded gray placeholder at the bottom is the smoking gun.

Let me verify by reading the current ThreadChatView code and MessageAttachment component before presenting plan.

I need to investigate before planning. Let me look.
