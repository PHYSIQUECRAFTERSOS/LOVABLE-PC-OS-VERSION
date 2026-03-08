-- Fix coach SELECT policy to check both user_id and target_client_id
DROP POLICY IF EXISTS "Coaches can view client events" ON calendar_events;
CREATE POLICY "Coaches can view client events" ON calendar_events
  FOR SELECT
  USING (
    has_role(auth.uid(), 'coach'::app_role) AND (
      EXISTS (
        SELECT 1 FROM coach_clients
        WHERE coach_clients.coach_id = auth.uid()
        AND coach_clients.client_id = calendar_events.target_client_id
      )
      OR EXISTS (
        SELECT 1 FROM coach_clients
        WHERE coach_clients.coach_id = auth.uid()
        AND coach_clients.client_id = calendar_events.user_id
      )
    )
  );

-- Fix client SELECT policy to check both user_id and target_client_id
DROP POLICY IF EXISTS "Clients can view scheduled events" ON calendar_events;
CREATE POLICY "Clients can view scheduled events" ON calendar_events
  FOR SELECT
  USING (
    user_id = auth.uid() OR target_client_id = auth.uid()
  );

-- Fix client UPDATE policy to check both user_id and target_client_id  
DROP POLICY IF EXISTS "Clients can complete scheduled events" ON calendar_events;
CREATE POLICY "Clients can complete scheduled events" ON calendar_events
  FOR UPDATE
  USING (
    user_id = auth.uid() OR target_client_id = auth.uid()
  )
  WITH CHECK (
    user_id = auth.uid() OR target_client_id = auth.uid()
  );