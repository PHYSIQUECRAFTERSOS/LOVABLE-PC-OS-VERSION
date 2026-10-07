# Fix Congrats / Check In dialog showing old messages

## What I found
The pop-up conversation that opens from Congrats and Check In asks for the first 30 messages ever sent in the thread, not the 30 newest. For long-running clients like Zane, you only see messages from months ago. The Messages tab loads the newest ones, so it looks right there.

## Fix
- Load the 30 newest messages in the pop-up, then show them oldest to newest so the latest message is at the bottom.
- Keep the existing scroll-to-bottom behavior so it opens on the newest message.
- Check that new messages coming in live still show up at the bottom.

## Verify
- Open Congrats for Zane and confirm the last message matches what the Messages tab shows.
- Do the same with Check In for a client under Missed Yesterday.

## Technical details
In `QuickMessageDialog.tsx` `loadThread`: change to `.order("created_at", { ascending: false }).limit(30)` and reverse the result before `setMessages`. Add error checking on both queries.
