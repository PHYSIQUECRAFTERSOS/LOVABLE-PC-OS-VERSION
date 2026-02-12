
-- Fix overly permissive RLS on personal_records
DROP POLICY "System can update PRs" ON public.personal_records;

-- Create a secure definer function to update PRs based on exercise logs
CREATE OR REPLACE FUNCTION public.update_personal_record(_client_id UUID, _exercise_id UUID, _weight DECIMAL, _reps INT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.personal_records (client_id, exercise_id, weight, reps)
  VALUES (_client_id, _exercise_id, _weight, _reps)
  ON CONFLICT (client_id, exercise_id)
  DO UPDATE SET 
    weight = GREATEST(personal_records.weight, _weight),
    reps = CASE WHEN personal_records.weight = _weight THEN GREATEST(personal_records.reps, _reps) ELSE personal_records.reps END,
    logged_at = now();
END;
$$;

-- Coaches can view and manage their clients' PRs
CREATE POLICY "Coaches can manage client PRs"
  ON public.personal_records FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.coach_clients
    WHERE coach_id = auth.uid() AND client_id = client_id
  ) OR public.has_role(auth.uid(), 'admin'::app_role));

-- Clients can only view their own PRs
CREATE POLICY "Clients can view own PRs"
  ON public.personal_records FOR SELECT
  USING (client_id = auth.uid());
