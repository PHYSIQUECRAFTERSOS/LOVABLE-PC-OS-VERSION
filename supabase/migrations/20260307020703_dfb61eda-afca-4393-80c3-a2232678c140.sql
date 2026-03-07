
-- Allow service role to insert any food (the edge function uses service role key)
-- The existing INSERT policy only allows is_custom=true for authenticated users
-- Service role bypasses RLS, so no changes needed for the edge function.
-- But we need a SELECT policy for food_search_log and food_selection_log
CREATE POLICY "Users can read their own search logs"
  ON food_search_log FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can read their own selection logs"
  ON food_selection_log FOR SELECT TO authenticated
  USING (user_id = auth.uid());
