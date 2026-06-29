# Manager = Coach + More (Permissions Audit)

## What's already correct
- `public.has_role(uid, 'coach')` returns `true` when the user has role `coach` OR `manager`. Every policy written as `has_role(auth.uid(), 'coach')` already grants managers full coach-equivalent access.
- Tables already covered by shared-master visibility for any coach/manager: `programs`, `program_phases`, `program_weeks`, `program_workouts`, `master_workouts`, `master_workout_exercises`, `master_supplements`, `supplement_plans`, `supplement_plan_items`, `exercises` (public).

## The actual gap
Several "shared" coach-side libraries gate access on the literal `coach_id = auth.uid()` of the owning coach with no fallback for other coaches/managers. A manager who isn't the original author can't see them — that's why Aaron sees empty lists.

The affected tables (all have an owner-only policy today, with no shared/team fallback):
- `meal_plans` (has `is_template`, no policy reads it)
- `meal_plan_days`, `meal_plan_items`, `meal_plan_meal_notes` (children of meal_plans)
- `nutrition_guide_sections` (coach-owned guides shown in Master Libraries → Guides)
- `checkin_templates` (already broadly readable via "Authenticated read active templates", but manage is owner-only — read is fine)

`saved_meals` already has "Coaches can view client saved meals" using `has_role('coach')`, which covers managers.

## Changes to make

### 1. Meal-plan templates visible to all coaches/managers
Add SELECT policies so any coach/admin/manager can read template meal plans (`meal_plans.is_template = true`) and their day/item/note children. Edits remain owner-only (so managers won't accidentally mutate Kevin's templates unless they own/copy them).

- `meal_plans`: new policy "Coaches view template meal plans" → `is_template = true AND has_role(auth.uid(),'coach' or 'admin')`.
- `meal_plan_days`, `meal_plan_items`, `meal_plan_meal_notes`: matching SELECT policies via the parent `meal_plans.is_template = true` check.

### 2. Nutrition guide sections visible to all coaches/managers
- `nutrition_guide_sections`: new SELECT policy → any coach/admin can read every coach's guide sections. (Already public-ish since clients of any coach read them via `coach_clients`; broadening to staff is consistent.)

### 3. Optional sanity sweep — no changes, just verification
Confirm with a follow-up `pg_policy` query that no other coach-side library table is still gated purely on `coach_id = auth.uid()` without a shared fallback. If anything else surfaces (e.g. `coach_meal_plan_uploads` for client-specific uploads), call it out — those are intentionally client-scoped, not "shared library" content, so we leave them owner-only.

## Out of scope (intentionally unchanged)
- Write access (INSERT/UPDATE/DELETE) on other coaches' templates. Managers can still only edit/delete content they own or have admin role for, matching the current coach behavior. If you want managers to also be able to edit any coach's templates, say the word and I'll widen those policies too.
- Client-private data (`saved_meals.client_id`, `meal_plans.client_id` assignments, etc.) — already correctly scoped.

## Technical notes
- All new policies follow the existing pattern: `has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role)`, which automatically includes managers via `has_role`.
- Single migration. Idempotent `DROP POLICY IF EXISTS` + `CREATE POLICY` so re-runs are safe.
- No data is changed; only visibility policies are added.
