
-- =============================================================
-- Trigger 1: Sync calendar_events.title when workouts.name changes
-- =============================================================
-- Root cause context: calendar_events.title stores a cached label like
-- "Day 3: Push day". When a coach renames a workout, the cached title
-- becomes stale. This trigger recomputes it using the same logic as the
-- frontend: sequential position from program_workouts.sort_order.
-- =============================================================

CREATE OR REPLACE FUNCTION public.sync_workout_name_to_calendar()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    -- Recompute labels for all calendar events linked to this workout.
    -- The day number comes from the workout's sequential position among
    -- non-excluded siblings in its phase, ordered by sort_order.
    WITH phase_workouts AS (
      SELECT
        pw.workout_id,
        pw.phase_id,
        pw.exclude_from_numbering,
        pw.custom_tag,
        CASE
          WHEN pw.exclude_from_numbering THEN NULL
          ELSE ROW_NUMBER() OVER (
            PARTITION BY pw.phase_id
            ORDER BY COALESCE(pw.sort_order, 999), pw.created_at, pw.id
          )
        END AS display_position
      FROM program_workouts pw
      WHERE pw.phase_id IN (
        SELECT DISTINCT phase_id FROM program_workouts WHERE workout_id = NEW.id
      )
      AND pw.exclude_from_numbering IS NOT TRUE
    ),
    excluded_workouts AS (
      SELECT workout_id, custom_tag
      FROM program_workouts
      WHERE workout_id = NEW.id AND exclude_from_numbering = true
    ),
    clean_name AS (
      SELECT regexp_replace(trim(NEW.name), '^[Dd]ay\s*\d+\s*[:\-–]\s*', '', 'g') AS val
    ),
    computed_label AS (
      SELECT COALESCE(
        (SELECT 'Day ' || pw.display_position || ': ' || cn.val
         FROM phase_workouts pw, clean_name cn
         WHERE pw.workout_id = NEW.id
         LIMIT 1),
        (SELECT ew.custom_tag || ': ' || cn.val
         FROM excluded_workouts ew, clean_name cn
         WHERE ew.workout_id = NEW.id
         LIMIT 1),
        (SELECT cn.val FROM clean_name cn)
      ) AS label
    )
    UPDATE calendar_events
    SET title = cl.label,
        updated_at = now()
    FROM computed_label cl
    WHERE linked_workout_id = NEW.id
      AND event_type = 'workout'
      AND title IS DISTINCT FROM cl.label;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_workout_name ON workouts;
CREATE TRIGGER trg_sync_workout_name
  AFTER UPDATE OF name ON workouts
  FOR EACH ROW
  EXECUTE FUNCTION sync_workout_name_to_calendar();


-- =============================================================
-- Trigger 2: Recompute ALL labels in a phase when sort_order changes
-- =============================================================
-- When a coach drag-reorders workout days, sort_order values change,
-- which shifts Day N numbering for multiple workouts in that phase.

CREATE OR REPLACE FUNCTION public.sync_phase_labels_on_reorder()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sort_order IS DISTINCT FROM OLD.sort_order
     OR NEW.exclude_from_numbering IS DISTINCT FROM OLD.exclude_from_numbering
     OR NEW.custom_tag IS DISTINCT FROM OLD.custom_tag THEN

    WITH ranked AS (
      SELECT
        pw.workout_id,
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
      WHERE pw.phase_id = NEW.phase_id
      AND pw.exclude_from_numbering IS NOT TRUE
    ),
    excluded AS (
      SELECT pw.workout_id, pw.custom_tag, w.name AS workout_name
      FROM program_workouts pw
      JOIN workouts w ON w.id = pw.workout_id
      WHERE pw.phase_id = NEW.phase_id AND pw.exclude_from_numbering = true
    ),
    all_labels AS (
      SELECT workout_id,
             'Day ' || display_position || ': ' || regexp_replace(trim(workout_name), '^[Dd]ay\s*\d+\s*[:\-–]\s*', '', 'g') AS label
      FROM ranked
      WHERE display_position IS NOT NULL
      UNION ALL
      SELECT workout_id,
             COALESCE(custom_tag, 'Supplemental') || ': ' || regexp_replace(trim(workout_name), '^[Dd]ay\s*\d+\s*[:\-–]\s*', '', 'g') AS label
      FROM excluded
    )
    UPDATE calendar_events ce
    SET title = al.label,
        updated_at = now()
    FROM all_labels al
    WHERE ce.linked_workout_id = al.workout_id
      AND ce.event_type = 'workout'
      AND ce.title IS DISTINCT FROM al.label;

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_phase_labels ON program_workouts;
CREATE TRIGGER trg_sync_phase_labels
  AFTER UPDATE OF sort_order, exclude_from_numbering, custom_tag ON program_workouts
  FOR EACH ROW
  EXECUTE FUNCTION sync_phase_labels_on_reorder();


-- =============================================================
-- Trigger 3: Handle workout deletion — orphan calendar events
-- =============================================================

CREATE OR REPLACE FUNCTION public.handle_workout_deletion_calendar()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE calendar_events
  SET title = '[Removed Workout]',
      linked_workout_id = NULL,
      updated_at = now()
  WHERE linked_workout_id = OLD.id
    AND event_type = 'workout';
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

DROP TRIGGER IF EXISTS trg_handle_workout_deletion ON workouts;
CREATE TRIGGER trg_handle_workout_deletion
  BEFORE DELETE ON workouts
  FOR EACH ROW
  EXECUTE FUNCTION handle_workout_deletion_calendar();
