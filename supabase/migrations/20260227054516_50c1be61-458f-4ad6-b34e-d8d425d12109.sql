
-- 1. Add source_workout_id, order_index, estimated_duration to workouts
ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS source_workout_id uuid REFERENCES public.workouts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS order_index integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_duration integer; -- minutes

-- 2. Create exercise_media table (modular media storage)
CREATE TABLE public.exercise_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  media_type text NOT NULL DEFAULT 'youtube', -- youtube | upload
  video_url text,
  thumbnail_url text,
  duration integer, -- seconds
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.exercise_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage exercise media"
  ON public.exercise_media FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.exercises e
      WHERE e.id = exercise_media.exercise_id
      AND (e.created_by = auth.uid() OR e.created_by IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.exercises e
      WHERE e.id = exercise_media.exercise_id
      AND (e.created_by = auth.uid() OR e.created_by IS NULL)
    )
  );

CREATE POLICY "All authenticated can view exercise media"
  ON public.exercise_media FOR SELECT TO authenticated
  USING (true);

-- 3. Create workout_sets table (individual set rows with targets)
CREATE TABLE public.workout_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_exercise_id uuid NOT NULL REFERENCES public.workout_exercises(id) ON DELETE CASCADE,
  set_number integer NOT NULL,
  rep_target text, -- e.g. "8-12" or "10"
  weight_target numeric,
  rpe_target numeric,
  set_type text DEFAULT 'working', -- working | warmup | dropset | backoff
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workout_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage workout sets"
  ON public.workout_sets FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workout_exercises we
      JOIN public.workouts w ON w.id = we.workout_id
      WHERE we.id = workout_sets.workout_exercise_id
      AND (w.coach_id = auth.uid() OR w.client_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workout_exercises we
      JOIN public.workouts w ON w.id = we.workout_id
      WHERE we.id = workout_sets.workout_exercise_id
      AND (w.coach_id = auth.uid() OR w.client_id = auth.uid())
    )
  );

CREATE POLICY "Authenticated can view workout sets"
  ON public.workout_sets FOR SELECT TO authenticated
  USING (true);

-- Index for fast lookups
CREATE INDEX idx_workout_sets_exercise ON public.workout_sets(workout_exercise_id);
CREATE INDEX idx_exercise_media_exercise ON public.exercise_media(exercise_id);
CREATE INDEX idx_workouts_source ON public.workouts(source_workout_id);
