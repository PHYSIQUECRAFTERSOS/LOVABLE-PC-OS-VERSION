

## Fix: Select dropdowns unclickable inside Dialogs

### Root Cause
Radix Dialog is `modal` by default. When modal, it sets `pointer-events: none` on `document.body` and only grants `pointer-events: auto` to the dialog content itself. The Select dropdown uses `SelectPrimitive.Portal`, which renders as a **sibling** of the Dialog portal on `<body>`. Since `<body>` has `pointer-events: none`, the Select dropdown inherits it — making it completely unclickable despite being visually visible (z-index is fine at `z-[80]`).

This likely broke when the Dialog overlay was elevated to `z-[70]` which may have triggered Radix to re-evaluate its modal behavior, or a Radix library update tightened the modal pointer-events logic.

### Fix
**File: `src/components/ui/select.tsx`** — Add `pointer-events-auto` to the `SelectPrimitive.Content` className so the dropdown always receives clicks, even when rendered as a portal sibling of a modal Dialog.

One-line change on line 69:
```
// Before
"relative z-[80] max-h-96 min-w-[8rem] overflow-hidden ..."

// After  
"relative z-[80] max-h-96 min-w-[8rem] overflow-hidden pointer-events-auto ..."
```

This is the standard fix for Radix Select-inside-Dialog. It only affects the dropdown popover layer — no side effects on other components.

### Files to modify
- `src/components/ui/select.tsx` — add `pointer-events-auto` to SelectContent className

No database changes. No edge function changes. No other files affected.

