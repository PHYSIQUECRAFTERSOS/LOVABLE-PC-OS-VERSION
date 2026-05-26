## Workout Keypad v2 — Strong-style Side Layout

Three scoped changes to the mobile in-workout set-logger. No DB / no business logic outside the keypad + the `completeSet` carry-over rule.

### 1) Keypad layout & visuals (`src/components/workout/NumericKeypad.tsx`)

Rebuild the layout to mirror Strong exactly:

```text
┌─────────────────────────────────────┐
│ 1     2     3   │   RPE             │
│ 4     5     6   │   Next            │
│ 7     8     9   │   −     +         │
│ .     0     ⌫   │   ✓ Log Set       │
└─────────────────────────────────────┘
```

- 4-column grid: cols 1–3 = digits (bigger, ~h-14 tall, text-2xl), col 4 = side action stack.
- Side stack rows: `RPE` (opens existing inline RPE picker, unchanged behavior), `Next` (advance field/set), `−  +` split (context-aware adjuster, see below), `Log Set` (gold/primary, full-height).
- Remove: `Done` button, the `−2 / −1 / +1 / +2` adjuster row, the `Set 1 · Reps` header line, and the small "Prev: …" inline text (Prev already shows in the row above).
- Keep a single compact header line with the current value + unit (so the user sees what they're typing).
- Colors: white surface with black digits for max contrast — use semantic tokens (`bg-background` already dark; add a `bg-white text-black` keypad surface with `border-border`). Active/pressed state uses `bg-muted`. Primary `Log Set` keeps gold (`bg-primary text-primary-foreground`).
- Haptics retained.

### 2) `−` / `+` adjuster behavior (mode-aware)

- Weight mode: step = **5** (lb or kg per user's display unit — we just apply ±5 to the numeric value).
- Reps mode: step = **1**.
- Tapping the adjuster operates on the current buffer value and clears the "fresh" flag so further digit taps append.

### 3) Tap reps while keypad open → keypad re-targets instantly (bug fix)

Root cause: `NumericKeypad` renders a full-screen invisible overlay (`fixed inset-0 z-[85]`) that catches the tap on the reps cell, calls `onClose`, and consumes the click — so the reps button needs a second tap to register.

Fix: remove the click-blocking overlay entirely. The keypad stays open until the user taps `Log Set`, `Next`, the row's existing `Log` button, the `×` on a set, or switches exercise/closes the session. Tapping any other weight/reps cell already calls `openKeypad(...)` which atomically re-targets the keypad — no close-then-reopen.

No `Done` button is needed (per spec); the keypad auto-closes when the active set is logged or when the user taps a non-input area that doesn't capture clicks. If the user wants a manual dismiss we keep a small chevron-down handle on the header bar.

### 4) Fresh-overwrite typing on every open (already partially in place)

`freshRef` is already reset to `true` whenever `open` flips or `label` changes. We will additionally reset it when the **field target** changes (setIdx or field) so that after auto-advancing to the next set, the very first digit press wipes the carried-over value — matching Strong.

### 5) Auto-carry weight & reps to next set on Log (`src/components/WorkoutLogger.tsx`)

This reverses a prior decision (memory currently says "unlogged sets stay null"). Per the user's new explicit spec:

In `completeSet`, after marking the current set complete, copy the just-logged `weight` and `reps` into the next **unlogged** set in the same exercise (only if that set is currently empty — never overwrite a value the user already typed). Coach-set targets are not touched (we only fill the live log buffer, not program prescriptions).

Memory rule "Placeholder-only (Strong-style), unlogged sets stay null" will be replaced with a new memory: *"After Log, auto-carry weight + reps to the next empty set; fresh keypad open overwrites on first digit."*

### 6) Out of scope (NOT touched)

- DB schema, RLS, edge functions, persistence path (`persistSet`).
- RPE selector internals — keypad just opens the existing popover via `onSelectRPE`.
- Rest timer, PR detection, swipe-to-delete, set add/remove.
- Desktop set rows (native inputs untouched).
- Any non-workout screens.

### Acceptance

1. Mobile keypad matches the right-side-stack layout in the Strong screenshot.
2. Digits are visibly larger and on a white surface with black text.
3. `−` / `+` apply ±5 in weight mode and ±1 in reps mode.
4. No `Done`, no `−2/−1/+1/+2` row, no `Set 1 · Reps` header bar.
5. RPE button opens the existing RPE picker and writes back to the active set.
6. With keypad open on Weight, tapping the Reps cell switches the keypad to Reps in one tap (no double-tap).
7. After tapping `Log` on Set N, Set N+1's weight and reps are pre-filled from Set N, the keypad auto-opens on Set N+1 weight, and typing any digit replaces the pre-filled value entirely.
8. Typecheck passes; no other screens regress.
