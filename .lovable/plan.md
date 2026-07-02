
# Why the app is slow

I ran a health check on the Lovable Cloud backend (the database and auth that power the app):

- **Memory: 82% used** — the backend instance is close to its ceiling.
- **Connections: 45 / 60 (high)** — nearly saturated. When it hits the cap, new queries wait in line, which is exactly what the "spinner that never resolves" in your screenshots looks like.
- Data disk is fine (30%), so this is a compute/RAM problem, not a storage problem.
- No single query is slow on its own — the slowest is ~325 ms total. That means the app code isn't broken; the box is just overloaded.

Slowness has grown over the last few days because we recently added a lot of new Row-Level Security policies (for the manager role, shared master libraries, AI import). Each extra policy adds a small subquery to every read. On an already-saturated instance that pushes latency over the edge.

## Fix — two parts

### 1. Upgrade the Lovable Cloud instance (biggest lever, do first)

Open the project → **Backend** → **Advanced settings** → **Upgrade instance** and move up one tier. This is the intended fix when memory and connections are saturated. It usually takes a few minutes and may affect Cloud billing — the product UI shows the pricing before you confirm. This alone should immediately fix the "loads forever" behavior in both screenshots (Import from Master Library, Day 1: UPPER workout dialog).

### 2. Consolidate the recent RLS policies (code-side cleanup)

The last two migrations added ~40 separate manager-only policies on top of existing coach/admin policies. Postgres evaluates every SELECT policy on every row. I'll:

- Merge the manager-only SELECT/INSERT/UPDATE/DELETE policies on `workouts`, `workout_exercises`, `exercises`, `programs`, `program_phases`, `program_workouts`, `meal_plans`, `meal_plan_days`, `meal_plan_items`, `master_supplements`, `supplement_plans`, `supplement_plan_items`, and `ai_import_jobs` into the existing coach/admin policies (single policy per action using `has_role(auth.uid(),'manager') OR has_role(auth.uid(),'coach') OR has_role(auth.uid(),'admin')`).
- Keep behavior identical — managers keep all the access they got in the previous fix.
- Add missing indexes on hot filter columns surfaced by the slow-query report: `calendar_events(event_date, event_type)`, `thread_messages(thread_id, sender_id, read_at)`, `nutrition_logs(client_id, logged_at)`, `meal_plan_items(meal_plan_id, meal_order, item_order)`. These are the queries the coach dashboard and Today's Actions hit constantly.

### What I will NOT touch

- No schema changes to any table, no data migrations, no destructive drops.
- No changes to app business logic, auth, or the AI import feature.
- Client integrations file, RLS behavior for clients, and existing coach/admin access remain the same.

## Verify after

- Re-check `db_health` — memory and connections should drop.
- Re-check `slow_queries` — the calendar / thread_messages entries should fall.
- Reload the two screens from the screenshots (Import from Master Library, Day 1 workout) and confirm they open in <1s.

## Order of operations

1. You upgrade the instance from the Backend settings (I can't do this for you — it's a billing action).
2. I ship the RLS consolidation + index migration.
3. We verify with health + slow-query snapshots.
