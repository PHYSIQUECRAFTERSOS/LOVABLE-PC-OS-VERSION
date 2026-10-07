# Plan: Rotating congrats messages + scroll-to-bottom fix

## Goal
1. The "Congrats" button on the coach dashboard (Coach Command Center, overview screen) should prefill one of five rotating message variations instead of the same static text every time, so clients feel the message is personal.
2. When the congrats dialog opens, the message history must scroll all the way to the newest message — currently it stops around mid-conversation, so the coach can miss a client's recent reply.

## Changes

### 1. Rotating congrats messages
File: `src/components/dashboard/CoachCommandCenter.tsx` (~line 750)

- Add a constant array with the five exact variations the user provided:
  1. `great work getting in your workout yesterday and pushing yourself by the way 💪 Keep it up!`
  2. `Great work hitting your workout yesterday here 👌 Keep it up`
  3. `saw you crushed your workout yesterday once again 💯 How did that go?`
  4. `I see you crushed your workout yesterday 🙏 keep it up! Love seeing that`
  5. `Great work with your workout yesterday 🔥 lets keep that momentum going !`
- Pick the variation by day of year: `messages[dayOfYear % 5]`, so it rotates to a new message each day and every coach sees the same one on a given day.
- The congrats button keeps its existing behavior otherwise (opens QuickMessageDialog with the prefill editable before sending).

### 2. Scroll to the newest message
File: `src/components/dashboard/QuickMessageDialog.tsx`

Root cause: the dialog scrolls with `behavior: "smooth"` immediately when messages load, but the scroll fires before the list finishes rendering/laying out, so it lands mid-conversation.

Fix:
- When the dialog opens and messages finish loading, scroll instantly (`behavior: "auto"`) to the bottom instead of smoothly.
- Re-scroll after a short delay (and on images/content settling) so late layout shifts can't leave the view stuck halfway.
- Keep smooth scrolling only for new messages arriving while the dialog is already open.

## Verification
- `npx tsgo --noEmit` passes.
- Open the coach dashboard, press Congrats on a client with a long history: dialog opens at the newest message, prefill shows today's variation; confirm the variation differs from the previous day's.

## Technical notes
- No database changes, no new dependencies.
- Messages stay editable in the input before sending — nothing is auto-sent.
