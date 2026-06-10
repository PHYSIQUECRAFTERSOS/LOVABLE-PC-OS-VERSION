# Meal Plan & Supplement Stack — Archive & Swap System

## Why
- Subscribing a meal plan from the master library currently fails: `duplicate key value violates unique constraint` (unique index on `meal_plans (client_id, day_type)` for non-templates). Coaches cannot override an existing client plan.
- No history is kept of previous plans/stacks, so reverting a client to an earlier setup means rebuilding it by hand.

## What you'll get
- Subscribing/copying a meal plan or supplement stack from the master library **always succeeds**. Any existing active plan(s) for that client are archived (not deleted).
- A **Previous Plans** collapsible in the Meal Plan tab + **Previous Stacks** collapsible in the Supplements tab — each row shows the name, archived date, day type/macros (meals) or item count (supps), and a one-click **Restore** action.
- Restore is a **swap**: the currently active plan/stack is archived; the chosen archived one becomes active. Fully reversible.
- All historical nutrition_logs / supplement_logs stay untouched.

## Behavior rules (per your choices)
1. **Meals — archive scope:** When a new meal plan is subscribed to a client, **both** of the client's currently active plans (Training Day + Rest Day) are archived together as a single snapshot, so restoring brings the full pair back.
2. **Supps — archive scope:** When a new stack is subscribed, the single currently active assignment is archived.
3. **Restore = swap.** Current → archived. Archived → active.
4. **Logs:** Untouched. Archived rows keep their IDs; `nutrition_logs.meal_plan_id` (if/when set) still resolves.
5. Coach can also **delete an archived snapshot** permanently (trash icon w/ confirm).

## Technical Plan

### Database

Migration 1 — add archived state (additive only, no drops):
```sql
ALTER TABLE public.meal_plans
  ADD COLUMN IF NOT EXISTS archived_at        timestamptz,
  ADD COLUMN IF NOT EXISTS archive_group_id   uuid;  -- pairs Training+Rest in one snapshot

ALTER TABLE public.client_supplement_assignments
  ADD COLUMN IF NOT EXISTS archived_at        timestamptz;

-- Fix the duplicate-key error: unique index must ignore archived plans.
DROP INDEX IF EXISTS public.idx_meal_plans_unique_client_day_type;
CREATE UNIQUE INDEX idx_meal_plans_unique_client_day_type
  ON public.meal_plans (client_id, day_type)
  WHERE client_id IS NOT NULL
    AND is_template = false
    AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_meal_plans_client_archived
  ON public.meal_plans (client_id, archived_at DESC)
  WHERE client_id IS NOT NULL AND archived_at IS NOT NULL;
```

No RLS change needed — existing coach/client policies still apply (archived rows have the same coach/client ids).

### New helper `src/lib/clientPlanArchive.ts`
- `archiveActiveMealPlans(clientId)` → stamps both active client meal_plans with the same `archive_group_id` + `archived_at = now()`. Returns the group id.
- `restoreMealPlanGroup(clientId, archiveGroupId)` → in a single transactional sequence: archives any currently active plans (new group id), then unsets `archived_at`/`archive_group_id` on the chosen group's rows.
- `archiveActiveSupplementAssignment(clientId)` → sets `is_active = false`, `archived_at = now()` on the active row.
- `restoreSupplementAssignment(clientId, assignmentId)` → archives current active assignment, then sets the chosen one to `is_active = true, archived_at = null`.
- `deleteArchivedMealPlanGroup(archiveGroupId)` / `deleteArchivedSupplementAssignment(id)` — hard delete (cascades via existing FKs).

### Code changes
- `src/components/nutrition/MealPlanTemplateLibrary.tsx` — in `handleCopyToClient`, call `archiveActiveMealPlans(selectedClientId)` before inserting the new client plan. Surface a toast "Previous plan archived". Removes the duplicate-key error.
- `src/components/clients/workspace/MealPlanTab.tsx` — add **Previous Plans** collapsible below the existing pill row. Lists archived snapshots grouped by `archive_group_id`, newest first; each shows name(s), day-type badges, kcal/macros, archived date, **Restore** + **Delete** actions. Restore confirms via existing `AlertDialog`.
- `src/components/libraries/SupplementLibrary.tsx` (assign-to-client flow) — call `archiveActiveSupplementAssignment(clientId)` before inserting the new `client_supplement_assignments` row.
- `src/components/nutrition/ClientSupplementPlan.tsx` (coach view) — add **Previous Stacks** collapsible mirroring the meal pattern: stack name, item count, archived date, Restore + Delete.
- Read paths already filter to active rows via `is_active = true` (supps) and the meal-plan tab's existing query. We'll add `.is("archived_at", null)` defensively where the meal plan tab queries `meal_plans`.

### UI (matches existing matte-black + gold aesthetic)
```text
Meal Plan tab
─────────────────────────────────────
[ Training Day ] [ Rest Day ]   ⓘ pill row
[ Active plan card …                ]
[ Grocery list …                    ]
▾ Previous Plans (3)              ← new collapsible
   • Cutting 1900 — Training+Rest   archived Jun 8     [Restore] [🗑]
   • Maintenance 2400 — Training    archived May 12    [Restore] [🗑]
```

## Non-goals
- No change to template-side meal plans or master stacks.
- No edits to nutrition_logs / supplement_logs.
- No new permission model — uses existing RLS.

## Risk / safety
- All schema changes are additive (`IF NOT EXISTS`). Dropping the unique index is replaced atomically in the same migration with a stricter partial version that excludes archived rows — no row data lost.
- Helpers wrap multi-step operations and check `{ error }` after every Supabase call (per project rules).
- Restore is reversible, so a mis-click is recoverable in two clicks.
