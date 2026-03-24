-- Allow clients to see profiles of users who share the same coach
-- This enables leaderboard name resolution in Challenges and Ranked
CREATE POLICY "Clients can view teammates profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  user_id IN (
    SELECT cc2.client_id
    FROM coach_clients cc1
    JOIN coach_clients cc2 ON cc1.coach_id = cc2.coach_id
    WHERE cc1.client_id = auth.uid()
      AND cc1.status = 'active'
      AND cc2.status = 'active'
  )
);
