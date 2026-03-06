-- Fix security definer view by recreating with security_invoker
DROP VIEW IF EXISTS data_quality_tz_summary;
CREATE VIEW data_quality_tz_summary WITH (security_invoker = true) AS
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