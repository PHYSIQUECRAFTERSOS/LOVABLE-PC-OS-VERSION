-- Add is_accessory flag to workouts
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS is_accessory boolean NOT NULL DEFAULT false;

-- Update sync_workout_name_to_calendar: accessory workouts get raw names (no "Day N:" prefix)
CREATE OR REPLACE FUNCTION public.sync_workout_name_to_calendar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name OR NEW.is_accessory IS DISTINCT FROM OLD.is_accessory THEN
    -- Accessory: always raw clean name on calendar
    IF NEW.is_accessory THEN
      UPDATE calendar_events
      SET title = regexp_replace(trim(NEW.name), '^[Dd]ay\s*\d+\s*[:\-–]\s*', '', 'g'),
          updated_at = now()
      WHERE linked_workout_id = NEW.id
        AND event_type = 'workout';
      RETURN NEW;
    END IF;

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
         WHERE pw.workout_id = NEW.id LIMIT 1),
        (SELECT ew.custom_tag || ': ' || cn.val
         FROM excluded_workouts ew, clean_name cn
         WHERE ew.workout_id = NEW.id LIMIT 1),
        (SELECT cn.val FROM clean_name cn)
      ) AS label
    )
    UPDATE calendar_events
    SET title = cl.label, updated_at = now()
    FROM computed_label cl
    WHERE linked_workout_id = NEW.id
      AND event_type = 'workout'
      AND title IS DISTINCT FROM cl.label;
  END IF;
  RETURN NEW;
END;
$function$;

-- Update sync_phase_labels_on_reorder: skip accessory workouts from numbering
CREATE OR REPLACE FUNCTION public.sync_phase_labels_on_reorder()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        w.is_accessory,
        CASE
          WHEN pw.exclude_from_numbering OR w.is_accessory THEN NULL
          ELSE ROW_NUMBER() OVER (
            PARTITION BY pw.phase_id
            ORDER BY COALESCE(pw.sort_order, 999), pw.created_at, pw.id
          )
        END AS display_position
      FROM program_workouts pw
      JOIN workouts w ON w.id = pw.workout_id
      WHERE pw.phase_id = NEW.phase_id
        AND pw.exclude_from_numbering IS NOT TRUE
        AND w.is_accessory IS NOT TRUE
    ),
    excluded AS (
      SELECT pw.workout_id, pw.custom_tag, w.name AS workout_name, w.is_accessory
      FROM program_workouts pw
      JOIN workouts w ON w.id = pw.workout_id
      WHERE pw.phase_id = NEW.phase_id
        AND (pw.exclude_from_numbering = true OR w.is_accessory = true)
    ),
    all_labels AS (
      SELECT workout_id,
             'Day ' || display_position || ': ' || regexp_replace(trim(workout_name), '^[Dd]ay\s*\d+\s*[:\-–]\s*', '', 'g') AS label
      FROM ranked WHERE display_position IS NOT NULL
      UNION ALL
      SELECT workout_id,
             CASE
               WHEN is_accessory THEN regexp_replace(trim(workout_name), '^[Dd]ay\s*\d+\s*[:\-–]\s*', '', 'g')
               ELSE COALESCE(custom_tag, 'Supplemental') || ': ' || regexp_replace(trim(workout_name), '^[Dd]ay\s*\d+\s*[:\-–]\s*', '', 'g')
             END AS label
      FROM excluded
    )
    UPDATE calendar_events ce
    SET title = al.label, updated_at = now()
    FROM all_labels al
    WHERE ce.linked_workout_id = al.workout_id
      AND ce.event_type = 'workout'
      AND ce.title IS DISTINCT FROM al.label;
  END IF;
  RETURN NEW;
END;
$function$;

-- Update get_workout_streak: don't count accessory workouts
CREATE OR REPLACE FUNCTION public.get_workout_streak(p_user_id uuid, p_today date, p_tz_only boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  streak int := 0;
  check_date date := p_today;
  has_session bool;
BEGIN
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM workout_sessions ws
      LEFT JOIN workouts w ON w.id = ws.workout_id
      WHERE ws.client_id = p_user_id
        AND ws.session_date = check_date
        AND ws.status = 'completed'
        AND (p_tz_only = false OR ws.tz_corrected = true)
        AND COALESCE(w.is_accessory, false) = false
    ) INTO has_session;

    IF has_session THEN
      streak := streak + 1;
      check_date := check_date - 1;
    ELSE
      IF check_date = p_today THEN
        check_date := check_date - 1;
        SELECT EXISTS (
          SELECT 1 FROM workout_sessions ws
          LEFT JOIN workouts w ON w.id = ws.workout_id
          WHERE ws.client_id = p_user_id
            AND ws.session_date = check_date
            AND ws.status = 'completed'
            AND (p_tz_only = false OR ws.tz_corrected = true)
            AND COALESCE(w.is_accessory, false) = false
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
$function$;