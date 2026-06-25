## Problem

Aaron's only role is `manager`. The UI in `useAuth.tsx` treats `manager` as an elevated coach, but **none of the database RLS policies do** — every policy uses `has_role(uid, 'coach')` or `has_role(uid, 'admin')`. So when Aaron's browser queries `calendar_events`, `master_supplements`, `supplements`, `coach_clients`, etc., Postgres returns 0 rows. That's why his calendar is empty and supplement names fall back to "Unknown" (the lookup against `master_supplements` returns nothing, so the UI shows the placeholder).

This affects every team member with a `manager` role — not just Aaron.

## Fix

One-line change to the `has_role` security-definer function so that any check for `'coach'` also returns true for users with the `'manager'` role. Because every RLS policy in the project routes through `has_role`, this single change unlocks calendar events, supplement names, client lists, programs, meal plans, etc. for managers — without rewriting ~80 individual policies.

```sql
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = _role
        OR (_role = 'coach' AND role = 'manager')  -- managers inherit coach access
      )
  )
$$;
```

Notes:
- Admin checks remain strict (manager does NOT get admin).
- Client-only checks (`has_role(uid, 'client')`) are unaffected.
- Aaron keeps his `manager` role and his existing invite/team capabilities (Team.tsx already gates on `hasRole('manager')` directly).
- The frontend `useAuth` already treats manager as coach for UI gating, so this aligns DB behavior with UI behavior.

## Verification after migration

1. Have Aaron hard-refresh and open a client's Calendar tab — events should now appear.
2. Open a client's Supps tab — supplement names should resolve instead of showing "Unknown".
3. Confirm Aaron still cannot access admin-only screens.

No schema changes, no policy rewrites, no frontend changes required.