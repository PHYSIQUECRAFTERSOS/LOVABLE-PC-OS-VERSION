CREATE OR REPLACE FUNCTION public.apply_coach_step_goal_to_health_metrics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _goal integer;
BEGIN
  SELECT nt.daily_step_goal
  INTO _goal
  FROM public.nutrition_targets nt
  WHERE nt.client_id = NEW.user_id
    AND nt.daily_step_goal IS NOT NULL
    AND nt.daily_step_goal > 0
    AND nt.effective_date <= NEW.metric_date
  ORDER BY nt.effective_date DESC, nt.created_at DESC
  LIMIT 1;

  IF _goal IS NOT NULL THEN
    NEW.step_goal := _goal;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_coach_step_goal_to_health_metrics ON public.daily_health_metrics;

CREATE TRIGGER trg_apply_coach_step_goal_to_health_metrics
BEFORE INSERT OR UPDATE ON public.daily_health_metrics
FOR EACH ROW
EXECUTE FUNCTION public.apply_coach_step_goal_to_health_metrics();

WITH resolved_goals AS (
  SELECT dhm.id, latest_target.daily_step_goal
  FROM public.daily_health_metrics dhm
  CROSS JOIN LATERAL (
    SELECT nt.daily_step_goal
    FROM public.nutrition_targets nt
    WHERE nt.client_id = dhm.user_id
      AND nt.daily_step_goal IS NOT NULL
      AND nt.daily_step_goal > 0
      AND nt.effective_date <= dhm.metric_date
    ORDER BY nt.effective_date DESC, nt.created_at DESC
    LIMIT 1
  ) latest_target
)
UPDATE public.daily_health_metrics dhm
SET step_goal = rg.daily_step_goal,
    updated_at = now()
FROM resolved_goals rg
WHERE dhm.id = rg.id
  AND dhm.step_goal IS DISTINCT FROM rg.daily_step_goal;