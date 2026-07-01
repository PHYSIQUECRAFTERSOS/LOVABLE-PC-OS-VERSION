
CREATE OR REPLACE FUNCTION public.get_challenge_leaderboard(_challenge_id uuid)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  avatar_url text,
  best_value numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id,
    COALESCE(pr.full_name, 'Unknown') AS full_name,
    pr.avatar_url,
    COALESCE(p.best_value, 0) AS best_value
  FROM public.challenge_participants p
  LEFT JOIN public.profiles pr ON pr.user_id = p.user_id
  WHERE p.challenge_id = _challenge_id
    AND p.status = 'active'
    -- Must be an active client
    AND EXISTS (
      SELECT 1 FROM public.coach_clients cc
      WHERE cc.client_id = p.user_id AND cc.status = 'active'
    )
    -- Exclude staff (admin/coach/manager)
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p.user_id
        AND ur.role IN ('admin','coach','manager')
    )
  ORDER BY COALESCE(p.best_value, 0) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_challenge_leaderboard(uuid) TO authenticated;
