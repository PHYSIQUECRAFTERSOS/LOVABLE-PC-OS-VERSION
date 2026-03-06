ALTER TABLE food_items ADD COLUMN IF NOT EXISTS serving_label text;

CREATE OR REPLACE FUNCTION public.get_logging_streak(p_user_id uuid)
RETURNS integer AS $$
DECLARE
  streak int := 0;
  check_date date := current_date;
  has_log bool;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM nutrition_logs
    WHERE client_id = p_user_id AND logged_at::date = check_date
  ) INTO has_log;

  IF NOT has_log THEN
    check_date := check_date - 1;
  END IF;

  LOOP
    SELECT EXISTS (
      SELECT 1 FROM nutrition_logs
      WHERE client_id = p_user_id AND logged_at::date = check_date
    ) INTO has_log;

    IF has_log THEN
      streak := streak + 1;
      check_date := check_date - 1;
    ELSE
      EXIT;
    END IF;
  END LOOP;

  RETURN streak;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_logging_streak(uuid) TO authenticated;