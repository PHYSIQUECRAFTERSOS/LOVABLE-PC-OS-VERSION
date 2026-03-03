
-- Make week_id nullable on program_workouts so workouts can link directly to phases
ALTER TABLE public.program_workouts ALTER COLUMN week_id DROP NOT NULL;

-- Add index on phase_id for fast phase-based lookups
CREATE INDEX IF NOT EXISTS idx_program_workouts_phase_id ON public.program_workouts(phase_id);
