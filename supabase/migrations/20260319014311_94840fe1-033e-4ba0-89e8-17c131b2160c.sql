
-- Coach check-in day config table
CREATE TABLE IF NOT EXISTS public.coach_checkin_day_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  label text NOT NULL,
  day_of_week integer NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.coach_checkin_day_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage own day config" ON public.coach_checkin_day_config
  FOR ALL TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

-- Coach check-in preferences table
CREATE TABLE IF NOT EXISTS public.coach_checkin_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL UNIQUE,
  default_template_id uuid REFERENCES public.checkin_templates(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.coach_checkin_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage own preferences" ON public.coach_checkin_preferences
  FOR ALL TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

-- Allow clients to read their coach's preferences (for template resolution)
CREATE POLICY "Clients read coach preferences" ON public.coach_checkin_preferences
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_clients
      WHERE coach_clients.coach_id = coach_checkin_preferences.coach_id
      AND coach_clients.client_id = auth.uid()
      AND coach_clients.status = 'active'
    )
  );
