
-- admin_tool_runs log table
CREATE TABLE IF NOT EXISTS admin_tool_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name TEXT NOT NULL,
  repaired_count INTEGER DEFAULT 0,
  already_correct_count INTEGER DEFAULT 0,
  ran_by UUID,
  ran_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_tool_runs_tool
  ON admin_tool_runs(tool_name, ran_at DESC);

ALTER TABLE admin_tool_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_tool_runs_read"
  ON admin_tool_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin_tool_runs_write"
  ON admin_tool_runs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RPC: admin_repair_workout_labels
-- Uses the actual schema: program_workouts.sort_order for position,
-- workouts.name for the name, calendar_events.linked_workout_id for the join.
CREATE OR REPLACE FUNCTION public.admin_repair_workout_labels()
RETURNS JSON AS $$
DECLARE
  repaired_count INTEGER := 0;
  already_correct INTEGER := 0;
  result JSON;
BEGIN
  -- Role check using the has_role function
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  -- Compute correct labels from program_workouts position + workouts.name
  WITH ranked AS (
    SELECT
      pw.workout_id,
      pw.phase_id,
      pw.exclude_from_numbering,
      pw.custom_tag,
      w.name AS workout_name,
      CASE
        WHEN pw.exclude_from_numbering THEN NULL
        ELSE ROW_NUMBER() OVER (
          PARTITION BY pw.phase_id
          ORDER BY COALESCE(pw.sort_order, 999), pw.created_at, pw.id
        )
      END AS display_position
    FROM program_workouts pw
    JOIN workouts w ON w.id = pw.workout_id
    WHERE pw.exclude_from_numbering IS NOT TRUE
  ),
  excluded AS (
    SELECT pw.workout_id, pw.custom_tag, w.name AS workout_name
    FROM program_workouts pw
    JOIN workouts w ON w.id = pw.workout_id
    WHERE pw.exclude_from_numbering = true
  ),
  all_labels AS (
    SELECT workout_id,
           'Day ' || display_position || ': ' || regexp_replace(trim(workout_name), '^[Dd]ay\s*\d+\s*[:\-–]\s*', '', 'g') AS correct_label
    FROM ranked
    WHERE display_position IS NOT NULL
    UNION ALL
    SELECT workout_id,
           COALESCE(custom_tag, 'Supplemental') || ': ' || regexp_replace(trim(workout_name), '^[Dd]ay\s*\d+\s*[:\-–]\s*', '', 'g') AS correct_label
    FROM excluded
  )
  -- Count already correct
  SELECT COUNT(*) INTO already_correct
  FROM calendar_events ce
  JOIN all_labels al ON al.workout_id = ce.linked_workout_id
  WHERE ce.event_type = 'workout'
    AND ce.title = al.correct_label;

  -- Now repair
  WITH ranked AS (
    SELECT pw.workout_id, pw.phase_id, pw.exclude_from_numbering, pw.custom_tag, w.name AS workout_name,
           CASE WHEN pw.exclude_from_numbering THEN NULL
                ELSE ROW_NUMBER() OVER (PARTITION BY pw.phase_id ORDER BY COALESCE(pw.sort_order, 999), pw.created_at, pw.id)
           END AS display_position
    FROM program_workouts pw
    JOIN workouts w ON w.id = pw.workout_id
    WHERE pw.exclude_from_numbering IS NOT TRUE
  ),
  excluded AS (
    SELECT pw.workout_id, pw.custom_tag, w.name AS workout_name
    FROM program_workouts pw
    JOIN workouts w ON w.id = pw.workout_id
    WHERE pw.exclude_from_numbering = true
  ),
  all_labels AS (
    SELECT workout_id,
           'Day ' || display_position || ': ' || regexp_replace(trim(workout_name), '^[Dd]ay\s*\d+\s*[:\-–]\s*', '', 'g') AS correct_label
    FROM ranked WHERE display_position IS NOT NULL
    UNION ALL
    SELECT workout_id,
           COALESCE(custom_tag, 'Supplemental') || ': ' || regexp_replace(trim(workout_name), '^[Dd]ay\s*\d+\s*[:\-–]\s*', '', 'g') AS correct_label
    FROM excluded
  )
  UPDATE calendar_events ce
  SET title = al.correct_label, updated_at = now()
  FROM all_labels al
  WHERE ce.linked_workout_id = al.workout_id
    AND ce.event_type = 'workout'
    AND ce.title IS DISTINCT FROM al.correct_label;

  GET DIAGNOSTICS repaired_count = ROW_COUNT;

  -- Log the run
  INSERT INTO admin_tool_runs (tool_name, repaired_count, already_correct_count, ran_by, ran_at)
  VALUES ('repair_workout_labels', repaired_count, already_correct, auth.uid(), now());

  result := json_build_object(
    'repaired', repaired_count,
    'already_correct', already_correct,
    'ran_at', now()
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

REVOKE ALL ON FUNCTION public.admin_repair_workout_labels() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_repair_workout_labels() TO authenticated;
