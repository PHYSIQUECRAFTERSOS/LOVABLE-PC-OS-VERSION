## Goal
Make a manager able to use AI Import in the same master-library flows a coach can use:
- Training master library
- Supplement plan master library
- Meal plan master library

Scan Label is intentionally out of scope and will not be changed.

## What I found
- The AI model itself is probably not the failing point: recent AI Gateway logs show no failed model requests, which means the request is likely being rejected before it reaches AI.
- The AI import function currently hard-blocks anyone who is not `coach` or `admin`, so a manager-only account gets a non-2xx response.
- The database role enum already includes `manager`, but several master-library access rules still only mention `coach` and `admin`.
- The frontend auth hook already collapses manager into coach-side UI access, so the main issue is backend/function permissions rather than button visibility.

## Implementation plan
1. **Fix AI import function authorization**
   - Update `ai-import-processor` so users with `manager`, `coach`, or `admin` roles can run AI imports.
   - Keep clients blocked.
   - Preserve the current PDF/image extraction logic and model prompts.

2. **Add manager-safe database access rules for AI import jobs**
   - Allow managers to create their own AI import jobs.
   - Keep existing own-job read/update behavior intact.
   - Do not weaken access for clients or anonymous users.

3. **Add manager visibility for shared master-library source data**
   - Training: shared master programs, phases, program workouts, workouts, and workout exercises.
   - Meal plans: shared/template meal plans, days, and items.
   - Supplements: shared master supplements, supplement plans, and supplement plan items.

4. **Add manager write parity where AI import save needs it**
   - Training import can create new exercises when the importer cannot match an exercise, so managers need the same exercise create/update/delete capability coaches have.
   - Other save paths mostly use ownership checks (`coach_id = current user`) and should already work for manager-created records, but I’ll verify each insert path after the migration.

5. **Verify after changes**
   - Deploy the updated AI import function.
   - Confirm backend policies now include manager paths for every table touched by the three imports.
   - Call the AI import function and verify it no longer rejects at the role gate.
   - Re-check function logs and AI Gateway logs to confirm failures are no longer permission-based.
   - Confirm Scan Label code remains untouched.

## Technical details
- Frontend files likely touched:
  - `src/components/import/AIImportModal.tsx` only if better error handling is needed.
- Backend files likely touched:
  - `supabase/functions/ai-import-processor/index.ts`
  - New database migration for manager-specific RLS policies.
- No destructive database changes.
- No table drops, no policy removals unless absolutely required; prefer additive manager policies.