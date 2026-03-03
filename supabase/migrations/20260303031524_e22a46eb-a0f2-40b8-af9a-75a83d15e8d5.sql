
-- Add custom_intensity to program_phases for "Other" intensity option
ALTER TABLE public.program_phases ADD COLUMN IF NOT EXISTS custom_intensity text;

-- Add phase_id to program_workouts for direct phase->workout linking (bypassing weeks)
ALTER TABLE public.program_workouts ADD COLUMN IF NOT EXISTS phase_id uuid REFERENCES public.program_phases(id) ON DELETE CASCADE;

-- Add grouping columns to workout_exercises for superset/circuit grouping
ALTER TABLE public.workout_exercises ADD COLUMN IF NOT EXISTS grouping_type text DEFAULT NULL;
ALTER TABLE public.workout_exercises ADD COLUMN IF NOT EXISTS grouping_id text DEFAULT NULL;

-- Create index for phase_id lookups
CREATE INDEX IF NOT EXISTS idx_program_workouts_phase_id ON public.program_workouts(phase_id);
