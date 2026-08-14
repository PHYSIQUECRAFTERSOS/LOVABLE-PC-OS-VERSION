CREATE OR REPLACE FUNCTION public.get_client_calendar_events_fast(
  _client_id uuid,
  _start_date date,
  _end_date date
)
RETURNS TABLE (
  id uuid,
  title text,
  event_date date,
  event_type text,
  is_completed boolean,
  color text,
  event_time time without time zone,
  linked_workout_id uuid,
  description text,
  notes text,
  linked_cardio_id uuid,
  linked_checkin_id uuid,
  is_recurring boolean,
  recurrence_pattern text,
  target_client_id uuid,
  completed_at timestamp with time zone,
  end_time time without time zone,
  user_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    auth.uid() = _client_id
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.coach_clients cc
      WHERE cc.coach_id = auth.uid()
        AND cc.client_id = _client_id
        AND cc.status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    ce.id, ce.title, ce.event_date, ce.event_type, ce.is_completed,
    ce.color, ce.event_time, ce.linked_workout_id, ce.description, ce.notes,
    ce.linked_cardio_id, ce.linked_checkin_id, ce.is_recurring,
    ce.recurrence_pattern, ce.target_client_id, ce.completed_at,
    ce.end_time, ce.user_id
  FROM public.calendar_events ce
  WHERE ce.user_id = _client_id
    AND ce.event_date >= _start_date
    AND ce.event_date <= _end_date
  ORDER BY ce.event_date;
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_calendar_events_fast(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_calendar_events_fast(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_calendar_events_fast(uuid, date, date) TO service_role;

CREATE OR REPLACE FUNCTION public.get_client_program_bundle_fast(_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.client_program_assignments%ROWTYPE;
  v_program public.programs%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    auth.uid() = _client_id
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.coach_clients cc
      WHERE cc.coach_id = auth.uid()
        AND cc.client_id = _client_id
        AND cc.status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT cpa.* INTO v_assignment
  FROM public.client_program_assignments cpa
  WHERE cpa.client_id = _client_id
    AND cpa.status IN ('active', 'subscribed')
  ORDER BY cpa.created_at DESC
  LIMIT 1;

  IF v_assignment.id IS NULL THEN
    RETURN jsonb_build_object(
      'assignment', NULL,
      'program', NULL,
      'phases', '[]'::jsonb,
      'weeks', '[]'::jsonb
    );
  END IF;

  SELECT p.* INTO v_program
  FROM public.programs p
  WHERE p.id = v_assignment.program_id;

  RETURN jsonb_build_object(
    'assignment', to_jsonb(v_assignment),
    'program', to_jsonb(v_program),
    'phases', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(pp) || jsonb_build_object(
          'directWorkouts', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', pw.id,
              'workout_id', pw.workout_id,
              'workout_name', COALESCE(w.name, 'Workout'),
              'day_of_week', COALESCE(pw.day_of_week, 0),
              'day_label', pw.day_label,
              'sort_order', pw.sort_order,
              'exclude_from_numbering', COALESCE(pw.exclude_from_numbering, false),
              'custom_tag', pw.custom_tag
            ) ORDER BY pw.sort_order)
            FROM public.program_workouts pw
            LEFT JOIN public.workouts w ON w.id = pw.workout_id
            WHERE pw.phase_id = pp.id
          ), '[]'::jsonb)
        ) ORDER BY pp.phase_order
      )
      FROM public.program_phases pp
      WHERE pp.program_id = v_assignment.program_id
    ), '[]'::jsonb),
    'weeks', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', pwk.id,
          'week_number', pwk.week_number,
          'name', pwk.name,
          'phase_id', pwk.phase_id,
          'workouts', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', pw.id,
              'workout_id', pw.workout_id,
              'workout_name', COALESCE(w.name, 'Workout'),
              'day_of_week', COALESCE(pw.day_of_week, 0),
              'day_label', pw.day_label,
              'sort_order', pw.sort_order
            ) ORDER BY pw.sort_order)
            FROM public.program_workouts pw
            LEFT JOIN public.workouts w ON w.id = pw.workout_id
            WHERE pw.week_id = pwk.id
          ), '[]'::jsonb)
        ) ORDER BY pwk.week_number
      )
      FROM public.program_weeks pwk
      WHERE pwk.program_id = v_assignment.program_id
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_program_bundle_fast(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_program_bundle_fast(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_program_bundle_fast(uuid) TO service_role;