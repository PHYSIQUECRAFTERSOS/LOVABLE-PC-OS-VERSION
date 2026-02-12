
-- Exercises table
CREATE TABLE public.exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  video_url TEXT,
  category TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

-- Workouts (templates/sessions)
CREATE TABLE public.workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  coach_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  phase TEXT,
  notes TEXT,
  is_template BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;

-- Workout exercises (individual exercises within a workout)
CREATE TABLE public.workout_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id UUID REFERENCES public.workouts(id) ON DELETE CASCADE NOT NULL,
  exercise_id UUID REFERENCES public.exercises(id) ON DELETE CASCADE NOT NULL,
  exercise_order INT NOT NULL,
  sets INT NOT NULL,
  reps TEXT,
  tempo TEXT,
  rest_seconds INT,
  rir INT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workout_exercises ENABLE ROW LEVEL SECURITY;

-- Workout sessions (client logging)
CREATE TABLE public.workout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workout_id UUID REFERENCES public.workouts(id) ON DELETE CASCADE NOT NULL,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;

-- Exercise logs (set-by-set logging)
CREATE TABLE public.exercise_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.workout_sessions(id) ON DELETE CASCADE NOT NULL,
  exercise_id UUID REFERENCES public.exercises(id) ON DELETE CASCADE NOT NULL,
  set_number INT NOT NULL,
  weight DECIMAL(10, 2),
  reps INT,
  tempo TEXT,
  rir INT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.exercise_logs ENABLE ROW LEVEL SECURITY;

-- Personal records
CREATE TABLE public.personal_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  exercise_id UUID REFERENCES public.exercises(id) ON DELETE CASCADE NOT NULL,
  weight DECIMAL(10, 2) NOT NULL,
  reps INT NOT NULL,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, exercise_id)
);

ALTER TABLE public.personal_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies for exercises (public read, coaches can create)
CREATE POLICY "Anyone can view exercises"
  ON public.exercises FOR SELECT
  USING (true);

CREATE POLICY "Coaches can create exercises"
  ON public.exercises FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'coach'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for workouts
CREATE POLICY "Coaches can view their workouts"
  ON public.workouts FOR SELECT
  USING (coach_id = auth.uid() OR client_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Coaches can create workouts"
  ON public.workouts FOR INSERT
  WITH CHECK (coach_id = auth.uid() AND (public.has_role(auth.uid(), 'coach'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY "Coaches can update their workouts"
  ON public.workouts FOR UPDATE
  USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for workout_exercises
CREATE POLICY "Users can view workout exercises"
  ON public.workout_exercises FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.workouts
    WHERE id = workout_id AND (coach_id = auth.uid() OR client_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  ));

CREATE POLICY "Coaches can manage workout exercises"
  ON public.workout_exercises FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.workouts
    WHERE id = workout_id AND (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  ));

-- RLS Policies for workout_sessions
CREATE POLICY "Clients can view their sessions"
  ON public.workout_sessions FOR SELECT
  USING (client_id = auth.uid() OR public.has_role(auth.uid(), 'coach'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can create sessions"
  ON public.workout_sessions FOR INSERT
  WITH CHECK (client_id = auth.uid());

CREATE POLICY "Clients can update their sessions"
  ON public.workout_sessions FOR UPDATE
  USING (client_id = auth.uid());

-- RLS Policies for exercise_logs
CREATE POLICY "Users can view exercise logs"
  ON public.exercise_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.workout_sessions
    WHERE id = session_id AND (client_id = auth.uid() OR public.has_role(auth.uid(), 'coach'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  ));

CREATE POLICY "Clients can log exercises"
  ON public.exercise_logs FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.workout_sessions
    WHERE id = session_id AND client_id = auth.uid()
  ));

CREATE POLICY "Clients can update their logs"
  ON public.exercise_logs FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.workout_sessions
    WHERE id = session_id AND client_id = auth.uid()
  ));

-- RLS Policies for personal_records
CREATE POLICY "Users can view personal records"
  ON public.personal_records FOR SELECT
  USING (client_id = auth.uid() OR public.has_role(auth.uid(), 'coach'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can update PRs"
  ON public.personal_records FOR ALL
  USING (true);

-- Triggers for updated_at
CREATE TRIGGER update_exercises_updated_at BEFORE UPDATE ON public.exercises FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_workouts_updated_at BEFORE UPDATE ON public.workouts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_workout_exercises_updated_at BEFORE UPDATE ON public.workout_exercises FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_workout_sessions_updated_at BEFORE UPDATE ON public.workout_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_exercise_logs_updated_at BEFORE UPDATE ON public.exercise_logs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
