DROP POLICY IF EXISTS "Clients can manage own saved meals" ON public.saved_meals;

CREATE POLICY "Clients can manage own saved meals"
  ON public.saved_meals
  FOR ALL
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());