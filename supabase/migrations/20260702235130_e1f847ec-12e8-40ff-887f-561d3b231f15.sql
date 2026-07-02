CREATE INDEX IF NOT EXISTS idx_workout_exercises_workout_order
  ON public.workout_exercises (workout_id, exercise_order);

CREATE INDEX IF NOT EXISTS idx_program_workouts_phase_sort
  ON public.program_workouts (phase_id, sort_order)
  WHERE phase_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_program_workouts_week_sort
  ON public.program_workouts (week_id, sort_order)
  WHERE week_id IS NOT NULL;