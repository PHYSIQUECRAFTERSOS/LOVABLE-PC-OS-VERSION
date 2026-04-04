

## Move 3-Dot Action Menus to Left Side in Master Libraries

### Problem
In Master Libraries, the 3-dot action menus (⋯) for Programs, Supplement Plans, and Meal Plan Templates are positioned on the far right of each sidebar item. When the detail panel opens on the right, it overlaps or clips these buttons, making them inaccessible. Users cannot duplicate, share, assign, or delete items.

### Solution
Move the `DropdownMenu` trigger from the right side to the left side of each sidebar item in all three components. The layout changes from `[text ... ⋯]` to `[⋯ text ...]`.

### Changes

**File 1: `src/pages/MasterLibraries.tsx`** — `renderProgramItem` function (~line 391-465)
- Swap the flex order: move `DropdownMenu` before the text `div`
- Change `DropdownMenuContent` alignment from `align="end"` to `align="start"`
- Keep the menu always visible (remove opacity-60, use opacity-100 or just standard visibility)

**File 2: `src/components/libraries/SupplementLibrary.tsx`** — `renderPlanSidebarItem` function (~line 401-456)
- Same swap: move `DropdownMenu` before text, align="start"
- Keep always visible

**File 3: `src/components/nutrition/MealPlanTemplateLibrary.tsx`** — template list item (~line 412-470)
- Same swap: move `DropdownMenu` before text, align="start"  
- Keep always visible

### What stays the same
- All dropdown menu items (Assign, Duplicate, Share, Delete, etc.) — unchanged
- Catalog card layout in SupplementLibrary — unchanged (cards use a different layout)
- No functional or data changes — purely layout repositioning

### Improvements included
- Increase touch target to `h-7 w-7` minimum for better mobile tappability
- Remove the `opacity-60` fade that hides the button — always show at full opacity so users know it's interactive
