
-- Programs table
CREATE TABLE public.programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL,
  client_id UUID,
  name TEXT NOT NULL,
  description TEXT,
  goal_type TEXT DEFAULT 'hypertrophy',
  start_date DATE,
  end_date DATE,
  is_template BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage own programs" ON public.programs
  FOR ALL USING (coach_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view assigned programs" ON public.programs
  FOR SELECT USING (client_id = auth.uid());

CREATE TRIGGER update_programs_updated_at
  BEFORE UPDATE ON public.programs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Program weeks table
CREATE TABLE public.program_weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  week_number INT NOT NULL DEFAULT 1,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.program_weeks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view program weeks" ON public.program_weeks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.programs p
      WHERE p.id = program_weeks.program_id
      AND (p.coach_id = auth.uid() OR p.client_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
  );

CREATE POLICY "Coaches can manage program weeks" ON public.program_weeks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.programs p
      WHERE p.id = program_weeks.program_id
      AND (p.coach_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
  );

-- Program workouts (links workouts to specific days within a week)
CREATE TABLE public.program_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id UUID NOT NULL REFERENCES public.program_weeks(id) ON DELETE CASCADE,
  workout_id UUID NOT NULL REFERENCES public.workouts(id),
  day_of_week INT DEFAULT 0,
  day_label TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.program_workouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view program workouts" ON public.program_workouts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.program_weeks pw
      JOIN public.programs p ON p.id = pw.program_id
      WHERE pw.id = program_workouts.week_id
      AND (p.coach_id = auth.uid() OR p.client_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
  );

CREATE POLICY "Coaches can manage program workouts" ON public.program_workouts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.program_weeks pw
      JOIN public.programs p ON p.id = pw.program_id
      WHERE pw.id = program_workouts.week_id
      AND (p.coach_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
  );
