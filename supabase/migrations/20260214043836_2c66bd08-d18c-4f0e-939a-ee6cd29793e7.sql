
-- Cardio assignments table (coach assigns to client)
CREATE TABLE public.cardio_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  client_id uuid NOT NULL,
  cardio_type text NOT NULL DEFAULT 'steady_state',
  -- Types: steady_state, distance, interval, hr_zone, step_goal, calorie_goal, custom
  title text NOT NULL,
  description text,
  target_duration_min integer,
  target_distance_km numeric,
  target_steps integer,
  target_calories integer,
  target_hr_zone text,
  interval_config jsonb,
  -- e.g. { "rounds": 8, "work_seconds": 30, "rest_seconds": 90 }
  notes text,
  assigned_date date NOT NULL DEFAULT CURRENT_DATE,
  is_recurring boolean NOT NULL DEFAULT false,
  recurrence_days text[],
  -- e.g. ['monday','wednesday','friday']
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.cardio_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage cardio assignments"
ON public.cardio_assignments FOR ALL
USING (coach_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view own cardio assignments"
ON public.cardio_assignments FOR SELECT
USING (client_id = auth.uid());

CREATE TRIGGER update_cardio_assignments_updated_at
BEFORE UPDATE ON public.cardio_assignments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Cardio logs table (client logs completion)
CREATE TABLE public.cardio_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  assignment_id uuid REFERENCES public.cardio_assignments(id) ON DELETE SET NULL,
  cardio_type text NOT NULL DEFAULT 'steady_state',
  title text NOT NULL,
  duration_min numeric,
  distance_km numeric,
  steps integer,
  calories_burned integer,
  avg_hr integer,
  max_hr integer,
  difficulty_rating integer,
  -- 1-10 client rating
  notes text,
  completed boolean NOT NULL DEFAULT true,
  logged_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.cardio_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can manage own cardio logs"
ON public.cardio_logs FOR ALL
USING (client_id = auth.uid());

CREATE POLICY "Coaches can view cardio logs"
ON public.cardio_logs FOR SELECT
USING (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Expand body_measurements with new fields
ALTER TABLE public.body_measurements
ADD COLUMN IF NOT EXISTS body_fat_pct numeric,
ADD COLUMN IF NOT EXISTS blood_pressure_systolic integer,
ADD COLUMN IF NOT EXISTS blood_pressure_diastolic integer,
ADD COLUMN IF NOT EXISTS resting_hr integer,
ADD COLUMN IF NOT EXISTS sleep_hours numeric,
ADD COLUMN IF NOT EXISTS steps integer;

-- Client tags for filtering
CREATE TABLE public.client_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  client_id uuid NOT NULL,
  tag text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(coach_id, client_id, tag)
);

ALTER TABLE public.client_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage client tags"
ON public.client_tags FOR ALL
USING (coach_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view own tags"
ON public.client_tags FOR SELECT
USING (client_id = auth.uid());
