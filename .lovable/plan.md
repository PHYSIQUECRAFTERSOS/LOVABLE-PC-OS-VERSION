## Problem

`src/components/messaging/MessageContextMenu.tsx` (lines 170–194) renders the edit UI **inline where the message bubble sits**, wrapped in `max-w-[85%]` with a `min-h-[40px]` textarea and tiny ghost icon buttons. That's why editing feels cramped on desktop and mobile — the editor lives inside the message row instead of taking over the composer.

Trainerize (screenshot 3) does the opposite: as soon as you tap Edit, the bottom composer is replaced by a full-width "Editing message" strip with a tall multi-line textarea, a Cancel action, and a large primary Send button.

## Plan

### 1. Lift edit state out of `MessageContextMenu.tsx` into `ThreadChatView.tsx`

Currently each `MessageContextMenu` owns its own `editing` / `editText` / `saving` state. Move that up so the parent thread knows which message is being edited and can render the editor at the bottom.

- Add `editingMessageId: string | null` + `editingText: string` state in `ThreadChatView.tsx`.
- Change `MessageContextMenu`'s "Edit" action from `setEditing(true)` to `onStartEdit(messageId, content)` (new prop).
- Remove the inline `if (editing)` render block from `MessageContextMenu.tsx` entirely — the menu goes back to just being a menu.

### 2. Build a bottom "Editing message" composer strip

In `ThreadChatView.tsx`, when `editingMessageId` is set, replace the normal send composer (the block around line 700 with the `<Textarea ref={textareaRef}>`) with an edit composer that matches Trainerize:

```
┌─────────────────────────────────────────────┐
│ ✎ Editing message              Cancel       │  ← header row, subtle border-bottom
├─────────────────────────────────────────────┤
│                                             │
│  [large multi-line textarea, auto-grow,     │
│   min-h ~96px, max-h ~40vh]                 │
│                                             │
│                                    [ ➤ ]    │  ← gold primary Send, bottom-right
└─────────────────────────────────────────────┘
```

Behavior:
- Autofocus the textarea and place caret at end of text on open.
- `Enter` = save, `Shift+Enter` = newline, `Esc` = cancel (matches Trainerize desktop; keeps current thread composer convention which is also Enter-to-send).
- Cancel restores original message unchanged and clears `editingMessageId`.
- Save calls the existing `handleEditMessage(messageId, newContent)` path (already wired), then clears edit state.
- If the new text equals the original, treat Save as Cancel (no-op, no `edited` label).
- Empty text after trim → Save is disabled (existing behavior in the current handler).
- While the strip is open, hide/disable the normal send composer entirely so there's no ambiguity about which box is active.

### 3. Highlight the message being edited

To match Trainerize's yellow outline (screenshot 2): when `msg.id === editingMessageId`, add a `ring-2 ring-primary/70` (gold) around that message bubble in `ThreadChatView.tsx`. Clears automatically when edit state clears.

### 4. Mobile ergonomics

- The edit strip is the same component on desktop and mobile — sits above the keyboard just like the normal composer, so keyboard behavior needs no special work.
- Add `inputMode="text"` and `enterKeyHint="send"` to the edit textarea on mobile.
- Ensure the strip respects existing safe-area padding used by the normal composer (reuse the same wrapper classes).

## Files touched
- `src/components/messaging/MessageContextMenu.tsx` — remove inline edit UI + `editing`/`editText`/`saving` state, add `onStartEdit` prop, wire Edit action to it.
- `src/components/messaging/ThreadChatView.tsx` — add `editingMessageId`/`editingText` state, render bottom edit strip, highlight edited bubble, pass `onStartEdit` to `MessageContextMenu`.

## Out of scope
- Message reactions, delete flow, attachments, or send-composer redesign.
- No DB/RLS changes — `handleEditMessage` already writes to `thread_messages`.
- No new dependencies.

## Clarifying question
Trainerize's edit composer uses **Enter = save, Shift+Enter = newline**. Your current send composer likely uses the same convention. Confirm — or would you prefer **Cmd/Ctrl+Enter = save** for edits so a stray Enter doesn't accidentally commit a bad edit? I'll go with **Enter = save** unless you say otherwise.
