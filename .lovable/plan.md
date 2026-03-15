

# Add Edit, Duplicate, Assign, Delete Actions to Meal Plan Templates

## Problem
When a template is selected in the right preview panel, there are no visible action buttons. The dropdown menu on the sidebar cards only appears on hover (opacity-0) making it hard to discover, and it's missing an Edit option. Delete has no confirmation dialog.

## Changes — Single File: `MealPlanTemplateLibrary.tsx`

### 1. Right Panel Action Bar
Add a row of icon buttons next to the template name in the right preview panel:
- **Edit** (Pencil icon) — opens the MealPlanBuilder with `editingTemplateId` set to the selected template
- **Duplicate** (Copy icon) — calls existing `duplicateTemplate`
- **Assign to Client** (UserPlus icon) — calls existing `openCopyToClient`
- **Delete** (Trash2 icon, red) — opens confirmation dialog

### 2. Delete Confirmation Dialog
Add an `AlertDialog` with:
- Title: "Delete Template?"
- Description: "This will permanently delete this meal plan template and all its days/items. This cannot be undone."
- Cancel + Delete buttons

### 3. Sidebar Dropdown Improvements
- Remove `opacity-0 group-hover:opacity-100` so the three-dot menu is always visible
- Add an "Edit" menu item that opens the builder with the template loaded

### 4. Edit Flow
When Edit is clicked, set `editingTemplateId` to the template's ID and `showBuilder = true`. The existing `MealPlanBuilder` already accepts an edit mode — need to pass the `editingTemplateId` prop to it.

### Files Changed

| File | Change |
|------|--------|
| `src/components/nutrition/MealPlanTemplateLibrary.tsx` | Add right-panel action buttons, delete confirmation AlertDialog, edit option, always-visible dropdown |

