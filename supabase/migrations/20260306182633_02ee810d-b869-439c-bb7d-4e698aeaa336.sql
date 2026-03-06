-- Create timezone-aware streak function that accepts local date from frontend
CREATE OR REPLACE FUNCTION get_logging_streak_v2(
  p_user_id uuid,
  p_today date
)
RETURNS integer AS $$
DECLARE
  streak int := 0;
  check_date date := p_today;
  has_log bool;
BEGIN
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM nutrition_logs
      WHERE client_id = p_user_id
        AND logged_at = check_date
    ) INTO has_log;

    IF has_log THEN
      streak := streak + 1;
      check_date := check_date - 1;
    ELSE
      -- Allow one-day grace: if today has no logs yet, check yesterday
      IF check_date = p_today THEN
        check_date := check_date - 1;
        SELECT EXISTS (
          SELECT 1 FROM nutrition_logs
          WHERE client_id = p_user_id
            AND logged_at = check_date
        ) INTO has_log;
        IF has_log THEN
          streak := streak + 1;
          check_date := check_date - 1;
          CONTINUE;
        END IF;
      END IF;
      EXIT;
    END IF;
  END LOOP;

  RETURN streak;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_logging_streak_v2(uuid, date) TO authenticated;