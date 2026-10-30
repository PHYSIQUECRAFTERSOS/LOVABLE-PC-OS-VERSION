CREATE OR REPLACE FUNCTION public.sync_workout_name_to_calendar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name OR NEW.is_accessory IS DISTINCT FROM OLD.is_accessory THEN
    UPDATE calendar_events ce
    SET title = COALESCE(
          (SELECT pw.custom_tag || ': ' || trim(NEW.name) FROM program_workouts pw
           WHERE pw.workout_id = NEW.id AND pw.exclude_from_numbering = true AND pw.custom_tag IS NOT NULL AND NOT COALESCE(NEW.is_accessory,false) LIMIT 1),
          trim(NEW.name)),
        updated_at = now()
    WHERE ce.linked_workout_id = NEW.id AND ce.event_type = 'workout';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_phase_labels_on_reorder()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.exclude_from_numbering IS DISTINCT FROM OLD.exclude_from_numbering
     OR NEW.custom_tag IS DISTINCT FROM OLD.custom_tag THEN
    UPDATE calendar_events ce
    SET title = CASE WHEN NEW.exclude_from_numbering AND NEW.custom_tag IS NOT NULL AND NOT COALESCE(w.is_accessory,false)
                     THEN NEW.custom_tag || ': ' || trim(w.name) ELSE trim(w.name) END,
        updated_at = now()
    FROM workouts w
    WHERE w.id = NEW.workout_id AND ce.linked_workout_id = w.id AND ce.event_type = 'workout'
      AND ce.title IS DISTINCT FROM (CASE WHEN NEW.exclude_from_numbering AND NEW.custom_tag IS NOT NULL AND NOT COALESCE(w.is_accessory,false)
                     THEN NEW.custom_tag || ': ' || trim(w.name) ELSE trim(w.name) END);
  END IF;
  RETURN NEW;
END;
$$;