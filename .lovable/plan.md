## Root cause

The coach's "Enable Body Measurements" toggle is **silently failing** because of Row-Level Security:

- `src/components/clients/workspace/ProgressTab.tsx` (line 121-130) does `UPDATE profiles SET measurements_enabled=true WHERE user_id = clientId`.
- The only UPDATE policy on `public.profiles` is `Users can update own profile` with `auth.uid() = user_id`.
- Result: the coach is updating *another user's* row, RLS blocks it, **PostgREST returns no error and zero rows affected**, the toast says "Measurements enabled", but `profiles.measurements_enabled` stays `false`.

Verified directly: both Kevin profiles in the DB still show `measurements_enabled = false` even after the coach toggled it on.

So when the client opens Body Stats, `src/pages/BodyStats.tsx` reads `measurements_enabled = false` and hides the measurement section — exactly what the screenshot shows.

## Fix

### 1. Server: add a `SECURITY DEFINER` RPC + permissive policy combo

Create a SECURITY DEFINER function `public.set_client_measurements_enabled(_client_id uuid, _enabled boolean)` that:
- Verifies the caller has `admin` or `coach` role (via existing `has_role()`).
- For coaches (non-admin), verifies an active `coach_clients` link exists between caller and `_client_id`.
- Updates `profiles.measurements_enabled` for that client.
- Raises an exception on access denial so the UI sees a real error.

Grant `EXECUTE` to `authenticated`. No new tables, no schema changes beyond this function.

### 2. Client: call the RPC instead of direct UPDATE

In `ProgressTab.tsx`, replace the `supabase.from("profiles").update(...)` block with `supabase.rpc("set_client_measurements_enabled", { _client_id: clientId, _enabled: checked })`. Keep the optimistic UI + revert-on-error pattern.

### 3. Client read path: defensive defaults

In `src/pages/BodyStats.tsx`, no functional change needed — once the DB value is actually `true`, the measurements section will render. (Optional polish: replace `.single()` with `.maybeSingle()` so a missing profile row doesn't throw.)

## Files touched

- New migration: `set_client_measurements_enabled` SECURITY DEFINER function.
- `src/components/clients/workspace/ProgressTab.tsx` — switch toggle to RPC, surface real errors.
- (optional) `src/pages/BodyStats.tsx` — `.maybeSingle()` hardening.

## Out of scope
- No new measurement fields, no UI redesign of the client Body Stats page.
- No change to `body_stats` table or save logic.
- No change to other `profiles` UPDATE permissions — coaches still cannot directly UPDATE profiles, only this one column via the RPC.
