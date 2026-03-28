-- Allow clients to read supplement_plan_items for their assigned plans
CREATE POLICY "Clients can view their assigned plan items"
ON public.supplement_plan_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM client_supplement_assignments csa
    WHERE csa.plan_id = supplement_plan_items.plan_id
      AND csa.client_id = auth.uid()
      AND csa.is_active = true
  )
);

-- Allow clients to read master_supplements referenced in their assigned plans
CREATE POLICY "Clients can view supplements in their assigned plans"
ON public.master_supplements
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM supplement_plan_items spi
    JOIN client_supplement_assignments csa ON csa.plan_id = spi.plan_id
    WHERE spi.master_supplement_id = master_supplements.id
      AND csa.client_id = auth.uid()
      AND csa.is_active = true
  )
);