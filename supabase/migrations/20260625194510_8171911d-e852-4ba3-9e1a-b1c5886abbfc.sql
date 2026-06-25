DROP POLICY IF EXISTS "Coaches assigned to client can view supplement assignments" ON public.client_supplement_assignments;

CREATE POLICY "Coaches assigned to client can view supplement assignments"
ON public.client_supplement_assignments
FOR SELECT
USING (
  has_role(auth.uid(), 'coach'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.coach_clients cc
    WHERE cc.coach_id = auth.uid()
      AND cc.client_id = client_supplement_assignments.client_id
  )
);