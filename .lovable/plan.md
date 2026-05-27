## Add Emoji Picker to Messaging (Desktop Only)

Add an emoji picker button to the message composer in `ThreadChatView.tsx`, shown only on desktop (`sm:` and up) so mobile users continue using the native iOS/Android keyboard emoji picker.

### Changes

**1. Install `emoji-picker-react`**
Lightweight, themable, has search + categories + recently used — matches the Trainerize-style picker in your screenshot.

**2. `src/components/messaging/ThreadChatView.tsx`**
- Add a Smile-icon button between the Textarea and the Send/Voice button, wrapped in `hidden sm:flex` so it only appears on desktop.
- Wrap it in a Radix `Popover`; click opens the emoji picker anchored above the input.
- On emoji select: insert the emoji at the current cursor position in `newMessage` (preserve text on both sides), close the popover, refocus the textarea.
- Use dark theme to match the app (`Theme.DARK`), with `lazyLoadEmojis` for performance.

### Out of scope
- No changes to mobile composer.
- No changes to message send logic, attachments, voice recording, or any DB/RLS.
- No emoji reactions changes (separate feature already in `EmojiReactions.tsx`).
