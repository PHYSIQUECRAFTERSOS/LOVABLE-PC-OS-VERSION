-- Allow any authenticated user to view staff role rows (admin/manager/coach).
-- Fixes the Add Client > Assign To dropdown for coaches/managers, where the
-- previous policy only let users see their own role row.
CREATE POLICY "Authenticated can view staff roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (role IN ('admin','manager','coach'));

-- Allow managers (in addition to admins) to manage user_roles so they can
-- promote/demote other staff via the Team page.
CREATE POLICY "Managers can manage staff roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'manager')
  AND role IN ('coach','manager')
)
WITH CHECK (
  public.has_role(auth.uid(), 'manager')
  AND role IN ('coach','manager')
);