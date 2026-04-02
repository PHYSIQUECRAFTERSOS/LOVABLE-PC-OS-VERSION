

## Fix: Desktop Three-Dot Message Actions Not Visible

### Root Cause
The three-dot hover button exists in the DOM but is invisible. Two issues:

1. **Overflow clipping**: The button is positioned at `-left-8` / `-right-8` (outside the container bounds). The parent scroll container (`overflow-y-auto`) also clips horizontal overflow, making the button unreachable and invisible.

2. **Layout approach**: Absolute positioning outside the container doesn't work within a scrollable area.

### Solution

**File: `src/components/messaging/MessageContextMenu.tsx`**

Change the three-dot button from absolute-positioned-outside to **inline within the message row**. Instead of placing it at `-left-8` outside the container, render it as a flex sibling that appears on hover:

1. **Remove the absolute-positioned three-dot div** (lines 211-244)
2. **Restructure the wrapper**: Change from `group relative` wrapping just `{children}` to a flex row that includes the three-dot button inline:
   - For own messages: `[three-dot] [children]` (button on left of bubble)
   - For other's messages: `[children] [three-dot]` (button on right of bubble)
3. **Show/hide via opacity on hover**: The button takes up a small fixed space (w-7) but is `opacity-0` until `group-hover:opacity-100`, so it fades in without shifting layout
4. **Keep `hidden md:flex`**: Only show on desktop; mobile keeps the long-press Sheet

The button will be inside the scroll container's flow, so no clipping occurs.

### Technical Detail

```text
Before (broken):
  <div class="group relative">
    {children}                          ← message bubble
    <div class="absolute -left-8">      ← CLIPPED by overflow-y-auto
      <DropdownMenu>...</DropdownMenu>
    </div>
  </div>

After (fixed):
  <div class="group flex items-center gap-1">
    <div class="hidden md:flex opacity-0 group-hover:opacity-100 shrink-0">
      <DropdownMenu>...</DropdownMenu>  ← inline, not clipped
    </div>
    {children}                          ← message bubble
  </div>
  (order reversed for isOwn vs not-own)
```

### Files Modified
- `src/components/messaging/MessageContextMenu.tsx` — restructure three-dot from absolute to inline flex

