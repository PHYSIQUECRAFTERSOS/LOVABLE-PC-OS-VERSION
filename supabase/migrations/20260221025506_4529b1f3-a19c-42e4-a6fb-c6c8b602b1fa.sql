
-- Add progression settings to workout_exercises
ALTER TABLE public.workout_exercises
  ADD COLUMN IF NOT EXISTS progression_type TEXT DEFAULT 'double',
  ADD COLUMN IF NOT EXISTS weight_increment NUMERIC DEFAULT 5,
  ADD COLUMN IF NOT EXISTS increment_type TEXT DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS rpe_threshold NUMERIC DEFAULT 8,
  ADD COLUMN IF NOT EXISTS progression_mode TEXT DEFAULT 'moderate';

-- Plateau flags table
CREATE TABLE public.plateau_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id),
  workout_id UUID NOT NULL REFERENCES public.workouts(id),
  flagged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolution TEXT,
  stagnant_sessions INT DEFAULT 3,
  last_weight NUMERIC,
  last_reps INT,
  last_rpe NUMERIC,
  coach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.plateau_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage plateau flags" ON public.plateau_flags
  FOR ALL USING (
    has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Clients can view own plateau flags" ON public.plateau_flags
  FOR SELECT USING (client_id = auth.uid());
