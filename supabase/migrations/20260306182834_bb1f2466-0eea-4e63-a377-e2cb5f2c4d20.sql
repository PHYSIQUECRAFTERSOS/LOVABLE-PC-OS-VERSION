-- 1. Add timezone column to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/Vancouver';
UPDATE profiles SET timezone = 'America/Vancouver' WHERE timezone IS NULL;
COMMENT ON COLUMN profiles.timezone IS
  'IANA timezone string. Set from frontend on signup and refreshed on login.';

-- 2. Add session_date and tz_corrected to workout_sessions
ALTER TABLE workout_sessions
  ADD COLUMN IF NOT EXISTS session_date date;
ALTER TABLE workout_sessions
  ADD COLUMN IF NOT EXISTS tz_corrected boolean DEFAULT false;
UPDATE workout_sessions SET tz_corrected = false WHERE tz_corrected IS NULL;
-- Backfill session_date from created_at for existing rows
UPDATE workout_sessions SET session_date = created_at::date WHERE session_date IS NULL;
COMMENT ON COLUMN workout_sessions.session_date IS
  'Local date of the session. Must be set from frontend using getLocalDateString().';
COMMENT ON COLUMN workout_sessions.tz_corrected IS
  'True if session_date was set from frontend local timezone. False = legacy UTC.';
CREATE INDEX IF NOT EXISTS idx_workout_sessions_session_date ON workout_sessions(client_id, session_date);

-- 3. Add tz_corrected to nutrition_logs
ALTER TABLE nutrition_logs
  ADD COLUMN IF NOT EXISTS tz_corrected boolean DEFAULT false;
UPDATE nutrition_logs SET tz_corrected = false WHERE tz_corrected IS NULL;

-- 4. Workout streak function
CREATE OR REPLACE FUNCTION get_workout_streak(
  p_user_id uuid,
  p_today date,
  p_tz_only boolean DEFAULT false
)
RETURNS integer AS $$
DECLARE
  streak int := 0;
  check_date date := p_today;
  has_session bool;
BEGIN
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM workout_sessions
      WHERE client_id = p_user_id
        AND session_date = check_date
        AND status = 'completed'
        AND (p_tz_only = false OR tz_corrected = true)
    ) INTO has_session;

    IF has_session THEN
      streak := streak + 1;
      check_date := check_date - 1;
    ELSE
      IF check_date = p_today THEN
        check_date := check_date - 1;
        SELECT EXISTS (
          SELECT 1 FROM workout_sessions
          WHERE client_id = p_user_id
            AND session_date = check_date
            AND status = 'completed'
            AND (p_tz_only = false OR tz_corrected = true)
        ) INTO has_session;
        IF has_session THEN
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

GRANT EXECUTE ON FUNCTION get_workout_streak(uuid, date, boolean) TO authenticated;

-- 5. Update logging streak v2 to support p_tz_only
CREATE OR REPLACE FUNCTION get_logging_streak_v2(
  p_user_id uuid,
  p_today date,
  p_tz_only boolean DEFAULT false
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
        AND (p_tz_only = false OR tz_corrected = true)
    ) INTO has_log;

    IF has_log THEN
      streak := streak + 1;
      check_date := check_date - 1;
    ELSE
      IF check_date = p_today THEN
        check_date := check_date - 1;
        SELECT EXISTS (
          SELECT 1 FROM nutrition_logs
          WHERE client_id = p_user_id
            AND logged_at = check_date
            AND (p_tz_only = false OR tz_corrected = true)
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

GRANT EXECUTE ON FUNCTION get_logging_streak_v2(uuid, date, boolean) TO authenticated;

-- 6. Data quality view
CREATE OR REPLACE VIEW data_quality_tz_summary AS
SELECT
  'nutrition_logs' AS table_name,
  COUNT(*) FILTER (WHERE tz_corrected = true) AS corrected_rows,
  COUNT(*) FILTER (WHERE tz_corrected = false) AS legacy_rows,
  COUNT(*) AS total_rows,
  ROUND(COUNT(*) FILTER (WHERE tz_corrected = true)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS pct_corrected
FROM nutrition_logs
UNION ALL
SELECT
  'workout_sessions' AS table_name,
  COUNT(*) FILTER (WHERE tz_corrected = true) AS corrected_rows,
  COUNT(*) FILTER (WHERE tz_corrected = false) AS legacy_rows,
  COUNT(*) AS total_rows,
  ROUND(COUNT(*) FILTER (WHERE tz_corrected = true)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS pct_corrected
FROM workout_sessions;

GRANT SELECT ON data_quality_tz_summary TO authenticated;