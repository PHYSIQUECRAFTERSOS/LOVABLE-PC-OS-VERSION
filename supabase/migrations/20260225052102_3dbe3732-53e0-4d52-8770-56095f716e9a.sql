
-- =============================================
-- PHASE 1: Program Phases + Client Workspace DB
-- =============================================

-- 1. Program Phases table (sits between programs and program_weeks)
CREATE TABLE public.program_phases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Phase 1',
  description TEXT,
  phase_order INTEGER NOT NULL DEFAULT 1,
  duration_weeks INTEGER NOT NULL DEFAULT 4,
  training_style TEXT DEFAULT 'hypertrophy',
  intensity_system TEXT DEFAULT 'straight_sets',
  progression_rule TEXT DEFAULT 'add_weight',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.program_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage their program phases"
ON public.program_phases FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id = program_phases.program_id
    AND (p.coach_id = auth.uid() OR p.client_id = auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id = program_phases.program_id
    AND p.coach_id = auth.uid()
  )
);

-- 2. Add phase_id to program_weeks (nullable for backward compat)
ALTER TABLE public.program_weeks
  ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES public.program_phases(id) ON DELETE CASCADE;

-- 3. Client program assignments — tracks which week/phase a client is on
CREATE TABLE public.client_program_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  current_phase_id UUID REFERENCES public.program_phases(id) ON DELETE SET NULL,
  current_week_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  auto_advance BOOLEAN NOT NULL DEFAULT true,
  forked_from_program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, program_id)
);

ALTER TABLE public.client_program_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach and client can view assignments"
ON public.client_program_assignments FOR SELECT
USING (auth.uid() = coach_id OR auth.uid() = client_id);

CREATE POLICY "Coach can manage assignments"
ON public.client_program_assignments FOR INSERT
WITH CHECK (auth.uid() = coach_id);

CREATE POLICY "Coach can update assignments"
ON public.client_program_assignments FOR UPDATE
USING (auth.uid() = coach_id);

CREATE POLICY "Coach can delete assignments"
ON public.client_program_assignments FOR DELETE
USING (auth.uid() = coach_id);

-- 4. Client notes table
CREATE TABLE public.client_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  coach_id UUID NOT NULL,
  content TEXT NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.client_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach can manage their client notes"
ON public.client_notes FOR ALL
USING (auth.uid() = coach_id)
WITH CHECK (auth.uid() = coach_id);

-- 5. Add superset_group and intensity_type to workout_exercises
ALTER TABLE public.workout_exercises
  ADD COLUMN IF NOT EXISTS superset_group TEXT,
  ADD COLUMN IF NOT EXISTS intensity_type TEXT DEFAULT 'straight',
  ADD COLUMN IF NOT EXISTS loading_type TEXT DEFAULT 'absolute',
  ADD COLUMN IF NOT EXISTS loading_percentage NUMERIC,
  ADD COLUMN IF NOT EXISTS rpe_target NUMERIC,
  ADD COLUMN IF NOT EXISTS is_amrap BOOLEAN DEFAULT false;

-- 6. Add tags and duration_weeks to programs
ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS duration_weeks INTEGER;

-- 7. Add workout_type to workouts
ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS workout_type TEXT DEFAULT 'regular';

-- 8. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_program_phases_program ON public.program_phases(program_id);
CREATE INDEX IF NOT EXISTS idx_program_weeks_phase ON public.program_weeks(phase_id);
CREATE INDEX IF NOT EXISTS idx_client_assignments_client ON public.client_program_assignments(client_id);
CREATE INDEX IF NOT EXISTS idx_client_assignments_status ON public.client_program_assignments(status);
CREATE INDEX IF NOT EXISTS idx_client_notes_client ON public.client_notes(client_id, coach_id);

-- 9. Updated_at triggers
CREATE TRIGGER update_program_phases_updated_at
  BEFORE UPDATE ON public.program_phases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_assignments_updated_at
  BEFORE UPDATE ON public.client_program_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_notes_updated_at
  BEFORE UPDATE ON public.client_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
