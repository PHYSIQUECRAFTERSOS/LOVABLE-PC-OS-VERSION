
-- Allow clients to read their assigned coach's profile
CREATE POLICY "Clients can read assigned coach profile"
ON profiles
FOR SELECT
TO authenticated
USING (
  user_id IN (
    SELECT coach_id FROM coach_clients
    WHERE client_id = auth.uid() AND status = 'active'
  )
);
