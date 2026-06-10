CREATE OR REPLACE FUNCTION public.set_client_measurements_enabled(_client_id uuid, _enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _allowed boolean := false;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF public.has_role(_caller, 'admin') THEN
    _allowed := true;
  ELSIF public.has_role(_caller, 'coach') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.coach_clients
       WHERE coach_id = _caller AND client_id = _client_id
    ) INTO _allowed;
  END IF;

  IF NOT _allowed THEN
    RAISE EXCEPTION 'Not authorized to update this client';
  END IF;

  UPDATE public.profiles
     SET measurements_enabled = _enabled
   WHERE user_id = _client_id;

  RETURN _enabled;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_client_measurements_enabled(uuid, boolean) TO authenticated;