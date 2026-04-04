

## Supplement Library: Shared/Personal, Duplicate, Delete, Inline Edit

### Problem
The supplement section in Master Libraries is currently single-coach only — no Shared/Personal sections, no duplicate, no delete on plans from the sidebar, and no inline editing of plan items. You want feature parity with the Programs tab.

### Database Changes

**Migration: Add `is_master` column to `supplement_plans` and `master_supplements`**

```sql
ALTER TABLE supplement_plans ADD COLUMN IF NOT EXISTS is_master boolean NOT NULL DEFAULT false;
ALTER TABLE master_supplements ADD COLUMN IF NOT EXISTS is_master boolean NOT NULL DEFAULT false;
```

**Migration: Add RLS policies for cross-coach visibility on shared supplements/plans**

```sql
-- Coaches can SELECT shared supplement plans (is_master = true)
CREATE POLICY "Coaches can view shared supplement plans"
ON supplement_plans FOR SELECT TO authenticated
USING (
  is_master = true
  AND (has_role(auth.uid(), 'coach') OR has_role(auth.uid(), 'admin'))
);

-- Coaches can SELECT shared master supplements
CREATE POLICY "Coaches can view shared master supplements"
ON master_supplements FOR SELECT TO authenticated
USING (
  is_master = true
  AND (has_role(auth.uid(), 'coach') OR has_role(auth.uid(), 'admin'))
);

-- Coaches can view items of shared plans
CREATE POLICY "Coaches can view shared plan items"
ON supplement_plan_items FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM supplement_plans sp
    WHERE sp.id = supplement_plan_items.plan_id
    AND sp.is_master = true
    AND (has_role(auth.uid(), 'coach') OR has_role(auth.uid(), 'admin'))
  )
);
```

### Code Changes

**File: `src/components/libraries/SupplementLibrary.tsx`**

This is the main file getting reworked. Changes:

1. **Shared/Personal sections for Plans sidebar** — Mirror the Programs tab pattern with collapsible "Shared" and "Personal" sections using `is_master` flag. Fetch own plans + shared plans from other coaches (same two-query merge pattern as programs).

2. **Shared/Personal for Catalog** — Same pattern: fetch own supplements + shared supplements. Show in two collapsible sections.

3. **3-dot menu on plan sidebar items** — Replace the current `opacity-0 group-hover:opacity-100` with `opacity-60 hover:opacity-100` (touch fix). Add menu items:
   - "Assign to Client" (existing)
   - "Share with Team" / "Make Private" (toggle `is_master`)
   - "Duplicate" (clone plan + all items)
   - "Delete" (existing, gated to creator/admin)

4. **3-dot menu on catalog items** — Add "Share with Team" / "Make Private" toggle.

5. **Duplicate plan** — Clone `supplement_plans` row with "(Copy)" suffix + clone all `supplement_plan_items` rows with new `plan_id`.

6. **Inline editing of plan items** — When a plan is selected and items are displayed, each item row becomes editable: click to edit dosage, timing, and coach note fields inline (same pattern as `ClientSupplementPlan` edit mode). Save on blur/change with debounce.

7. **Permission gating** — `canEdit(plan)` = `plan.coach_id === userId || isAdmin`. Only creator/admin can edit, delete, or toggle sharing. All coaches can view and assign shared plans.

8. **Creator names** — Fetch profile names for other coaches' shared plans/supplements, display "by CoachName" label.

### Summary of New Capabilities
- Plans sidebar: Shared / Personal collapsible sections with count badges
- Catalog view: Shared / Personal collapsible sections
- 3-dot menu on plans: Share with Team, Duplicate, Delete (always visible on touch)
- 3-dot menu on catalog: Share with Team
- Inline edit plan items (dosage, timing, note)
- Permission model mirrors Programs tab exactly

