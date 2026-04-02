

## Fix: Desktop Message Actions + Remove Duplicate Mobile Popup

### Problem
1. **Desktop**: Right-click context menu exists but users don't discover it. Need a visible three-dot icon on hover (like Trainerize) for Edit/Copy/Delete.
2. **Mobile**: Long-pressing a message shows TWO popups — both the bottom Sheet AND the ContextMenu. Only the bottom Sheet should appear.

### Solution

**Single file: `src/components/messaging/MessageContextMenu.tsx`**

**1. Add hover three-dot button for desktop**
- Add a `hovered` state to the component
- Wrap the message children in a `group` container with `onMouseEnter`/`onMouseLeave`
- On hover, show a small `MoreVertical` (three-dot) icon button positioned next to the message bubble
- Clicking the three-dot opens a `DropdownMenu` with Edit, Copy Text, Delete options (same actions as the existing context menu)
- The right-click context menu stays as a secondary option for power users

**2. Fix duplicate mobile popup**
- The ContextMenu (right-click) fires on mobile alongside the long-press Sheet
- Add `e.preventDefault()` in the touch handlers OR disable the `ContextMenu` on touch devices
- Use a simple approach: on touch start, set a flag; if the flag is set when context menu would open, prevent it
- Alternatively, conditionally render the `ContextMenu` wrapper only on non-touch or use `pointer-events` logic to suppress one

**Implementation detail:**
- Add `MoreVertical` import from lucide-react
- Add `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger` imports
- The three-dot icon appears on hover, positioned to the side of the bubble (left side for own messages, right side for others' — matching Trainerize pattern)
- On mobile (touch devices), the three-dot icon is hidden and only the bottom Sheet long-press works
- The `ContextMenuTrigger` wrapper stays but we prevent the native context menu from also triggering the Sheet

### Files Modified
- `src/components/messaging/MessageContextMenu.tsx`

