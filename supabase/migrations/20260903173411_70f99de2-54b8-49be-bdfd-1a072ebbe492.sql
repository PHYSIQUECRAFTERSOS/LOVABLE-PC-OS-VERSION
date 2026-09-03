CREATE OR REPLACE FUNCTION public.get_active_ranked_client_ids()
RETURNS TABLE(client_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT cc.client_id
  FROM public.coach_clients cc
  WHERE cc.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = cc.client_id
        AND ur.role IN ('admin','coach','manager')
    );
$$;

REVOKE ALL ON FUNCTION public.get_active_ranked_client_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_ranked_client_ids() TO authenticated;