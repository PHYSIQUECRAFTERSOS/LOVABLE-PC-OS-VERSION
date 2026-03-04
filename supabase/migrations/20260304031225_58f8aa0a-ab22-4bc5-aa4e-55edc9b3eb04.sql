
-- =============================================
-- TRAINING PROGRAM DATABASE ARCHITECTURE UPGRADE
-- Adds missing columns + master workout library
-- =============================================

-- 1. Add superset_group to workout_exercises (for superset/circuit grouping)
ALTER TABLE public.workout_exercises 
ADD COLUMN IF NOT EXISTS superset_group text DEFAULT NULL;

-- 2. Add estimated_duration to workouts
ALTER TABLE public.workouts 
ADD COLUMN IF NOT EXISTS estimated_duration integer DEFAULT NULL;

-- 3. Create master_workouts table (reusable workout templates)
CREATE TABLE IF NOT EXISTS public.master_workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  workout_name text NOT NULL,
  instructions text,
  estimated_duration integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Create master_workout_exercises table
CREATE TABLE IF NOT EXISTS public.master_workout_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_workout_id uuid NOT NULL REFERENCES public.master_workouts(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  sets integer NOT NULL DEFAULT 3,
  reps text DEFAULT '8-10',
  rest_seconds integer DEFAULT 90,
  rir integer,
  tempo text,
  notes text,
  order_index integer NOT NULL DEFAULT 0,
  superset_group text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Enable RLS
ALTER TABLE public.master_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_workout_exercises ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for master_workouts
CREATE POLICY "Coaches can manage their master workouts"
ON public.master_workouts FOR ALL TO authenticated
USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view master workouts"
ON public.master_workouts FOR SELECT TO authenticated
USING (true);

-- 7. RLS Policies for master_workout_exercises
CREATE POLICY "Coaches can manage master workout exercises"
ON public.master_workout_exercises FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.master_workouts mw
    WHERE mw.id = master_workout_id
    AND (mw.coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.master_workouts mw
    WHERE mw.id = master_workout_id
    AND (mw.coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);

CREATE POLICY "Authenticated users can view master workout exercises"
ON public.master_workout_exercises FOR SELECT TO authenticated
USING (true);

-- 8. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_master_workouts_coach_id ON public.master_workouts(coach_id);
CREATE INDEX IF NOT EXISTS idx_master_workout_exercises_master_workout_id ON public.master_workout_exercises(master_workout_id);
CREATE INDEX IF NOT EXISTS idx_master_workout_exercises_exercise_id ON public.master_workout_exercises(exercise_id);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_superset_group ON public.workout_exercises(superset_group) WHERE superset_group IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_program_workouts_phase_id ON public.program_workouts(phase_id);
CREATE INDEX IF NOT EXISTS idx_program_workouts_workout_id ON public.program_workouts(workout_id);
CREATE INDEX IF NOT EXISTS idx_program_phases_program_id ON public.program_phases(program_id);
CREATE INDEX IF NOT EXISTS idx_programs_coach_id ON public.programs(coach_id);
CREATE INDEX IF NOT EXISTS idx_programs_client_id ON public.programs(client_id);
CREATE INDEX IF NOT EXISTS idx_workouts_coach_id ON public.workouts(coach_id);
CREATE INDEX IF NOT EXISTS idx_workouts_client_id ON public.workouts(client_id);

-- 9. Auto-update trigger for master_workouts
CREATE TRIGGER update_master_workouts_updated_at
BEFORE UPDATE ON public.master_workouts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
